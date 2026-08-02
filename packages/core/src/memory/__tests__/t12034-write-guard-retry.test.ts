/**
 * T12034 — deterministic regression: the write-guard retry path survives a
 * transient "database is not open" throw from sessionExistsInTasksDb.
 *
 * @task T12034
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let throwCount = 0;

/**
 * Mock sessionExistsInTasksDb: throw once, then delegate to the real
 * implementation.  This simulates the T12020 TOCTOU race where the shared
 * cleo.db handle is closed between getDb and the drizzle query inside the
 * real sessionExistsInTasksDb.
 *
 * Hoisted by vitest above imports — runs before the module graph loads.
 */
vi.mock('../../store/cross-db-cleanup.js', async () => {
  const actual = await vi.importActual<typeof import('../../store/cross-db-cleanup.js')>(
    '../../store/cross-db-cleanup.js',
  );
  return {
    ...actual,
    sessionExistsInTasksDb: vi.fn(
      async (
        sessionId: string,
        tasksDb: Awaited<ReturnType<typeof import('../../store/sqlite.js')['getDb']>>,
      ): Promise<boolean> => {
        throwCount += 1;
        if (throwCount === 1) {
          throw new Error('database is not open');
        }
        return actual.sessionExistsInTasksDb(sessionId, tasksDb);
      },
    ),
  };
});

let tempDir: string;

describe('T12034 — write-guard retry on closed-handle throw', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cleo-t12034-'));
    const cleoDir = join(tempDir, '.cleo');
    await mkdir(cleoDir, { recursive: true });
    process.env['CLEO_DIR'] = cleoDir;

    const { getDb } = await import('../../store/sqlite.js');
    const { sessions } = await import('../../store/tasks-schema.js');
    const { eq: eqOp } = await import('drizzle-orm');
    const db = await getDb(tempDir);
    await db
      .insert(sessions)
      .values({ id: 'S-123', name: 'test-session', status: 'active' })
      .onConflictDoNothing()
      .run();

    const rows = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eqOp(sessions.id, 'S-123'))
      .all();
    expect(rows).toHaveLength(1);
    throwCount = 0;
  });

  afterEach(async () => {
    try {
      const { closeBrainDb } = await import('../../store/memory-sqlite.js');
      closeBrainDb();
    } catch {
      /* ok */
    }
    try {
      const { closeDb } = await import('../../store/sqlite.js');
      closeDb();
    } catch {
      /* ok */
    }
    try {
      const { shutdownBrainWriter, _resetBrainWriterForTests } = await import(
        '../brain-writer-thread.js'
      );
      await shutdownBrainWriter();
      _resetBrainWriterForTests();
    } catch {
      /* ok */
    }
    try {
      const { _resetWriterLeaseStateForTest } = await import('../../store/writer-lease.js');
      _resetWriterLeaseStateForTest();
    } catch {
      /* ok */
    }
    delete process.env['CLEO_DIR'];
    await rm(tempDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  });

  it('survives a thrown closed-handle error and recovers via canonical retry', async () => {
    const { observeBrain, fetchBrainEntries } = await import('../brain-retrieval.js');

    const result = await observeBrain(tempDir, {
      text: 'Observation after forced TOCTOU throw',
      sourceType: 'session-debrief',
      project: 'cleo',
      sourceSessionId: 'S-123',
    });

    // The first sessionExistsInTasksDb call must have thrown (TOCTOU simulated)
    expect(throwCount).toBeGreaterThanOrEqual(2);

    const fetched = await fetchBrainEntries(tempDir, { ids: [result.id] });
    expect(fetched.results).toHaveLength(1);
    const data = fetched.results[0].data as Record<string, unknown>;
    expect(data['sourceSessionId']).toBe('S-123');
  });

  it('nulls sourceSessionId when the session is genuinely absent', async () => {
    const { observeBrain, fetchBrainEntries } = await import('../brain-retrieval.js');

    // No session S-999 exists — the write-guard must null without retrying.
    const result = await observeBrain(tempDir, {
      text: 'Observation for absent session',
      sourceType: 'session-debrief',
      project: 'cleo',
      sourceSessionId: 'S-999',
    });

    // The mock still throws on first call, but the retry queries the real DB
    // which has no S-999 → sessionExists false → nulled.
    const fetched = await fetchBrainEntries(tempDir, { ids: [result.id] });
    expect(fetched.results).toHaveLength(1);
    const data = fetched.results[0].data as Record<string, unknown>;
    expect(data['sourceSessionId']).toBeNull();
  });
});

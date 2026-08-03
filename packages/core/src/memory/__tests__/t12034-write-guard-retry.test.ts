/**
 * T12034 — deterministic regressions: the write-guard retry path survives a
 * transient throw or stale empty result from sessionExistsInTasksDb.
 *
 * @task T12034
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { worktreeScope } from '../../paths.js';

let lookupCount = 0;
let firstLookupThrows = true;

/**
 * Mock sessionExistsInTasksDb: fail once, then delegate to the real
 * implementation. This simulates both T12020 failure modes: the shared cleo.db
 * handle throws after close, or a stale handle returns an empty result.
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
        lookupCount += 1;
        if (lookupCount === 1) {
          if (firstLookupThrows) {
            throw new Error('database is not open');
          }
          return false;
        }
        return actual.sessionExistsInTasksDb(sessionId, tasksDb);
      },
    ),
  };
});

let tempDir: string;

function runInProjectScope<T>(operation: () => T): T {
  return worktreeScope.run(
    { worktreeRoot: tempDir, projectHash: 't12034-write-guard-retry' },
    operation,
  );
}

describe('T12034 — write-guard retry on transient lookup failure', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cleo-t12034-'));
    const cleoDir = join(tempDir, '.cleo');
    await mkdir(cleoDir, { recursive: true });

    await runInProjectScope(async () => {
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
      const { sessionExistsInTasksDbFresh } = await import('../../store/cross-db-cleanup.js');
      await expect(sessionExistsInTasksDbFresh('S-123', db, tempDir)).resolves.toBe(true);
    });
    lookupCount = 0;
    firstLookupThrows = true;
  });

  afterEach(async () => {
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
      const { _resetWriterLeaseStateForTest } = await import('../../store/writer-lease.js');
      _resetWriterLeaseStateForTest();
    } catch {
      /* ok */
    }
    await rm(tempDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  });

  it('survives a thrown closed-handle error and recovers via a fresh probe', async () => {
    await runInProjectScope(async () => {
      const { observeBrain, fetchBrainEntries } = await import('../brain-retrieval.js');

      const result = await observeBrain(tempDir, {
        text: 'Observation after forced TOCTOU throw',
        sourceType: 'session-debrief',
        project: 'cleo',
        sourceSessionId: 'S-123',
      });

      // The first sessionExistsInTasksDb call must have thrown (TOCTOU simulated)
      expect(lookupCount).toBe(1);

      const fetched = await fetchBrainEntries(tempDir, { ids: [result.id] });
      expect(fetched.results).toHaveLength(1);
      const data = fetched.results[0].data as Record<string, unknown>;
      expect(data['sourceSessionId']).toBe('S-123');
    });
  });

  it('survives a transient empty lookup and recovers via a fresh probe', async () => {
    await runInProjectScope(async () => {
      const { observeBrain, fetchBrainEntries } = await import('../brain-retrieval.js');
      firstLookupThrows = false;

      const result = await observeBrain(tempDir, {
        text: 'Observation after forced stale empty lookup',
        sourceType: 'session-debrief',
        project: 'cleo',
        sourceSessionId: 'S-123',
      });

      expect(lookupCount).toBe(1);

      const fetched = await fetchBrainEntries(tempDir, { ids: [result.id] });
      expect(fetched.results).toHaveLength(1);
      const data = fetched.results[0].data as Record<string, unknown>;
      expect(data['sourceSessionId']).toBe('S-123');
    });
  });

  it('nulls sourceSessionId when the session is genuinely absent', async () => {
    await runInProjectScope(async () => {
      const { observeBrain, fetchBrainEntries } = await import('../brain-retrieval.js');

      // No session S-999 exists — the write-guard must null after confirmation.
      const result = await observeBrain(tempDir, {
        text: 'Observation for absent session',
        sourceType: 'session-debrief',
        project: 'cleo',
        sourceSessionId: 'S-999',
      });

      // The mock throws on the primary lookup; the fresh probe confirms S-999 is absent.
      const fetched = await fetchBrainEntries(tempDir, { ids: [result.id] });
      expect(fetched.results).toHaveLength(1);
      const data = fetched.results[0].data as Record<string, unknown>;
      expect(data['sourceSessionId']).toBeNull();
      expect(lookupCount).toBe(1);
    });
  });

  it('uses the live handle when its committed database file was unlinked', async () => {
    await runInProjectScope(async () => {
      const { getDb } = await import('../../store/sqlite.js');
      const { sessionExistsInTasksDbFresh } = await import('../../store/cross-db-cleanup.js');
      const db = await getDb(tempDir);
      await rm(db.$client.location(), { force: true });

      await expect(sessionExistsInTasksDbFresh('S-123', db, tempDir)).resolves.toBe(true);
    });
  });
});

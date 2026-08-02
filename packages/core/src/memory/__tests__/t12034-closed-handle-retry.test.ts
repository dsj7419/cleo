/**
 * T12034 — deterministic regression: prove sourceSessionId survives a
 * stale/closed cleo.db handle thrown by sessionExistsInTasksDb.
 *
 * Forces the documented T12020 TOCTOU race — closeDb() drops the dual-scope
 * cache + native handle between getDb and the session query — then calls
 * observeBrain.  The first write-guard attempt throws, the catch-reacquire path
 * recovers, and sourceSessionId is preserved.
 *
 * @task T12034
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tempDir: string;

describe('T12034 — sourceSessionId survives closed-handle retry', () => {
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

    // Verify durable
    const rows = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eqOp(sessions.id, 'S-123'))
      .all();
    expect(rows).toHaveLength(1);
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

  it('survives closeDb() between getDb and session query', async () => {
    // Force-close the shared handle — exactly the T12020 TOCTOU scenario that
    // causes sessionExistsInTasksDb to throw "database is not open" on its
    // first attempt inside the write-guard.
    const { _resetDualScopeDbCache } = await import('../../store/dual-scope-db.js');
    _resetDualScopeDbCache('project');

    const { observeBrain, fetchBrainEntries } = await import('../brain-retrieval.js');
    const result = await observeBrain(tempDir, {
      text: 'Observation after forced cache reset',
      sourceType: 'session-debrief',
      project: 'cleo',
      sourceSessionId: 'S-123',
    });

    const fetched = await fetchBrainEntries(tempDir, { ids: [result.id] });
    expect(fetched.results).toHaveLength(1);
    const data = fetched.results[0].data as Record<string, unknown>;
    expect(data['sourceSessionId']).toBe('S-123');
  });

  it('survives closed native handle (closeDb on main handle)', async () => {
    // Close the native handle through the sqlite.ts singleton — the _db
    // still references a closed DatabaseSync.
    const { closeDb, getDb } = await import('../../store/sqlite.js');
    closeDb();

    // Verify the data is still durable: open a fresh connection directly
    const { sessions } = await import('../../store/tasks-schema.js');
    const { eq: eqOp } = await import('drizzle-orm');
    const db = await getDb(tempDir);
    const rows = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eqOp(sessions.id, 'S-123'))
      .all();
    expect(rows).toHaveLength(1);
    // Close again to set up the stale-handle condition for observeBrain
    closeDb();

    const { observeBrain, fetchBrainEntries } = await import('../brain-retrieval.js');
    const result = await observeBrain(tempDir, {
      text: 'Observation after direct closeDb',
      sourceType: 'session-debrief',
      project: 'cleo',
      sourceSessionId: 'S-123',
    });

    const fetched = await fetchBrainEntries(tempDir, { ids: [result.id] });
    expect(fetched.results).toHaveLength(1);
    const data = fetched.results[0].data as Record<string, unknown>;
    expect(data['sourceSessionId']).toBe('S-123');
  });
});

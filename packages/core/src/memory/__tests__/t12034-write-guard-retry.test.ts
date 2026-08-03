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
let freshLookupThrows = false;
let taskLookupThrows = false;
let freshTaskLookupThrows = false;

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
    sessionExistsInTasksDbFresh: vi.fn(
      async (
        sessionId: string,
        tasksDb: Awaited<ReturnType<typeof import('../../store/sqlite.js')['getDb']>> | null,
        cwd?: string,
      ): Promise<boolean> => {
        if (freshLookupThrows) {
          throw new Error('no readable tasks database candidate');
        }
        return actual.sessionExistsInTasksDbFresh(sessionId, tasksDb, cwd);
      },
    ),
    taskExistsInTasksDb: vi.fn(
      async (
        taskId: string,
        tasksDb: Awaited<ReturnType<typeof import('../../store/sqlite.js')['getDb']>>,
      ): Promise<boolean> => {
        if (taskLookupThrows) {
          throw new Error('database is not open');
        }
        return actual.taskExistsInTasksDb(taskId, tasksDb);
      },
    ),
    taskExistsInTasksDbFresh: vi.fn(
      async (
        taskId: string,
        tasksDb: Awaited<ReturnType<typeof import('../../store/sqlite.js')['getDb']>> | null,
        cwd?: string,
      ): Promise<boolean> => {
        if (freshTaskLookupThrows) {
          throw new Error('no readable tasks database candidate');
        }
        return actual.taskExistsInTasksDbFresh(taskId, tasksDb, cwd);
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
    lookupCount = 0;
    firstLookupThrows = true;
    freshLookupThrows = false;
    taskLookupThrows = false;
    freshTaskLookupThrows = false;
    tempDir = await mkdtemp(join(tmpdir(), 'cleo-t12034-'));
    const cleoDir = join(tempDir, '.cleo');
    await mkdir(cleoDir, { recursive: true });

    await runInProjectScope(async () => {
      const { getDb } = await import('../../store/sqlite.js');
      const { sessions, tasks } = await import('../../store/tasks-schema.js');
      const { eq: eqOp } = await import('drizzle-orm');
      const db = await getDb(tempDir);
      await db
        .insert(sessions)
        .values({ id: 'S-123', name: 'test-session', status: 'active' })
        .onConflictDoNothing()
        .run();
      await db
        .insert(tasks)
        .values({ id: 'T100', title: 'Test task', status: 'pending', type: 'task', position: 0 })
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

  it('preserves sourceSessionId when validation is unavailable', async () => {
    await runInProjectScope(async () => {
      const { observeBrain, fetchBrainEntries } = await import('../brain-retrieval.js');
      freshLookupThrows = true;

      const result = await observeBrain(tempDir, {
        text: 'Observation while session validation is unavailable',
        sourceType: 'session-debrief',
        project: 'cleo',
        sourceSessionId: 'S-123',
      });

      const fetched = await fetchBrainEntries(tempDir, { ids: [result.id] });
      expect(fetched.results).toHaveLength(1);
      const data = fetched.results[0].data as Record<string, unknown>;
      expect(data['sourceSessionId']).toBe('S-123');
      expect(lookupCount).toBe(1);
    });
  });

  it('reports unavailable validation when no database candidate is readable', async () => {
    const unavailableRoot = join(tempDir, 'unavailable');
    await mkdir(join(unavailableRoot, '.cleo'), { recursive: true });
    const actual = await vi.importActual<typeof import('../../store/cross-db-cleanup.js')>(
      '../../store/cross-db-cleanup.js',
    );

    await expect(
      actual.sessionExistsInTasksDbFresh('S-123', null, unavailableRoot),
    ).rejects.toThrow('no readable tasks database candidate');
  });

  it('retries a fresh probe while a committed session becomes visible', async () => {
    await runInProjectScope(async () => {
      const actual = await vi.importActual<typeof import('../../store/cross-db-cleanup.js')>(
        '../../store/cross-db-cleanup.js',
      );
      const { resolveDualScopeDbPath } = await import('../../store/dual-scope-db.js');
      const { openNativeDatabase } = await import('../../store/sqlite-native.js');
      const dbPath = resolveDualScopeDbPath('project', tempDir);
      const insertion = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          let insertionDb: import('../../store/sqlite-native.js').DatabaseSync | null = null;
          try {
            insertionDb = openNativeDatabase(dbPath);
            insertionDb
              .prepare('INSERT INTO sessions (id, name, status) VALUES (?, ?, ?)')
              .run('S-delayed', 'delayed-session', 'active');
            resolve();
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          } finally {
            insertionDb?.close();
          }
        }, 5);
      });

      await expect(actual.sessionExistsInTasksDbFresh('S-delayed', null, tempDir)).resolves.toBe(
        true,
      );
      await insertion;
    });
  });

  it('preserves a task link when validation is unavailable', async () => {
    await runInProjectScope(async () => {
      const { linkMemoryToTask } = await import('../brain-links.js');
      taskLookupThrows = true;
      freshTaskLookupThrows = true;

      const link = await linkMemoryToTask(tempDir, 'observation', 'O-test', 'T100', 'produced_by');

      expect(link.taskId).toBe('T100');
    });
  });

  it('rejects a task link after confirmed absence', async () => {
    await runInProjectScope(async () => {
      const { linkMemoryToTask } = await import('../brain-links.js');

      await expect(
        linkMemoryToTask(tempDir, 'observation', 'O-test', 'T999', 'produced_by'),
      ).rejects.toThrow('task T999 does not exist');
    });
  });
});

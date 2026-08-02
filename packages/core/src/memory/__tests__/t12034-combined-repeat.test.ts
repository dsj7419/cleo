/**
 * T12034 — bounded repeated combined test: prove both original CI failures
 * (brain-retrieval:795 and session-memory:227) reach 0 flakes.
 *
 * Runs brain-retrieval's "should set sourceType and project" and
 * session-memory's "returns correct counts" in a loop within a single vitest
 * fork, forcing closeDb()/getDb() cycling that surfaces the T12020 TOCTOU race.
 *
 * @task T12034
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPEATS = 30;

describe('T12034 — bounded repeated combined', () => {
  it(`${REPEATS}x brain-retrieval sourceSessionId survives stale-handle conditions`, async () => {
    const { getDb, closeDb } = await import('../../store/sqlite.js');
    const { closeBrainDb } = await import('../../store/memory-sqlite.js');
    const { shutdownBrainWriter, _resetBrainWriterForTests } = await import(
      '../brain-writer-thread.js'
    );
    const { _resetWriterLeaseStateForTest } = await import('../../store/writer-lease.js');
    const { resetFts5Cache } = await import('../brain-search.js');

    for (let i = 0; i < REPEATS; i++) {
      const tempDir = await mkdtemp(join(tmpdir(), 'cleo-brc-'));
      const cleoDir = join(tempDir, '.cleo');
      await mkdir(cleoDir, { recursive: true });
      process.env['CLEO_DIR'] = cleoDir;

      // Seed tasks.db (mirrors brain-retrieval.test.ts beforeEach)
      const db = await getDb(tempDir);
      const { sessions } = await import('../../store/tasks-schema.js');
      const { eq: eqOp } = await import('drizzle-orm');
      await db
        .insert(sessions)
        .values({ id: 'S-123', name: 'test-session', status: 'active' })
        .onConflictDoNothing()
        .run();
      expect(
        (
          await db
            .select({ id: sessions.id })
            .from(sessions)
            .where(eqOp(sessions.id, 'S-123'))
            .all()
        ).length,
      ).toBe(1);

      // Mirror brain-retrieval.test.ts:776 — close brain, reset FTS5, observe
      closeBrainDb();
      resetFts5Cache();

      const { observeBrain, fetchBrainEntries } = await import('../brain-retrieval.js');
      const result = await observeBrain(tempDir, {
        text: `Combined stress ${i}`,
        sourceType: 'session-debrief',
        project: 'cleo',
        sourceSessionId: 'S-123',
      });

      const fetched = await fetchBrainEntries(tempDir, { ids: [result.id] });
      const data = fetched.results[0].data as Record<string, unknown>;
      expect(fetched.results).toHaveLength(1);
      expect(data['sourceSessionId']).toBe('S-123');

      // Full teardown between iterations
      closeDb();
      await shutdownBrainWriter();
      _resetBrainWriterForTests();
      _resetWriterLeaseStateForTest();
      resetFts5Cache();
      delete process.env['CLEO_DIR'];
      await rm(tempDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    }
  }, 120_000);

  it(`${REPEATS}x session-memory returns correct counts after stale-handle cycles`, async () => {
    const { closeDb } = await import('../../store/sqlite.js');
    const { closeBrainDb } = await import('../../store/memory-sqlite.js');
    const { shutdownBrainWriter, _resetBrainWriterForTests } = await import(
      '../brain-writer-thread.js'
    );
    const { _resetWriterLeaseStateForTest } = await import('../../store/writer-lease.js');
    const { resetFts5Cache } = await import('../brain-search.js');

    for (let i = 0; i < REPEATS; i++) {
      const tempDir = await mkdtemp(join(tmpdir(), 'cleo-smc-'));
      const cleoDir = join(tempDir, '.cleo');
      await mkdir(cleoDir, { recursive: true });
      process.env['CLEO_DIR'] = cleoDir;

      // Seed tasks.db (mirrors session-memory.test.ts beforeEach)
      const { getDb } = await import('../../store/sqlite.js');
      const { tasks, sessions } = await import('../../store/tasks-schema.js');
      const { eq: eqOp } = await import('drizzle-orm');
      const db = await getDb(tempDir);
      for (const id of ['T100', 'T101']) {
        await db
          .insert(tasks)
          .values({
            id,
            title: `Test task ${id}`,
            status: 'pending',
            type: 'task',
            position: 0,
          })
          .onConflictDoNothing()
          .run();
      }
      await db
        .insert(sessions)
        .values({ id: 'S-001', name: 'test-session', status: 'active' })
        .onConflictDoNothing()
        .run();

      // Verify seeds
      expect(
        (
          await db
            .select({ id: sessions.id })
            .from(sessions)
            .where(eqOp(sessions.id, 'S-001'))
            .all()
        ).length,
      ).toBe(1);

      // Mirror session-memory.test.ts:227
      const { persistSessionMemory } = await import('../session-memory.js');

      const debrief = {
        handoff: {
          lastTask: 'T100',
          tasksCompleted: ['T101', 'T102'],
          tasksCreated: [],
          decisionsRecorded: 2,
          nextSuggested: ['T103'],
          openBlockers: [],
          openBugs: [],
          note: 'Finished the main implementation',
        },
        sessionId: 'S-test-001',
        agentIdentifier: 'agent-1',
        startedAt: '2026-03-01T10:00:00Z',
        endedAt: '2026-03-01T11:00:00Z',
        durationMinutes: 60,
        decisions: [
          {
            id: 'DEC-001',
            decision: 'Use SQLite for brain storage',
            rationale: 'Reliable embedded database with FTS5 support',
            taskId: 'T100',
          },
          {
            id: 'DEC-002',
            decision: 'Use WAL journaling mode',
            rationale: 'Better concurrency and read performance',
            taskId: 'T101',
          },
        ],
        gitState: null,
        chainPosition: 1,
        chainLength: 1,
      };

      const result = await persistSessionMemory(tempDir, 'S-001', debrief);

      // 2 decisions + 1 session summary + 1 session note = 4 observations
      expect(result.observationsCreated).toBe(4);
      // 2 decisions with taskIds => 2 links
      expect(result.linksCreated).toBe(2);
      expect(result.observationIds).toHaveLength(4);

      // Full teardown
      closeBrainDb();
      closeDb();
      await shutdownBrainWriter();
      _resetBrainWriterForTests();
      _resetWriterLeaseStateForTest();
      resetFts5Cache();
      delete process.env['CLEO_DIR'];
      await rm(tempDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    }
  }, 120_000);
});

/**
 * T11627 ST-3 — T5158 heal wiring tests (Seams 0 & 1).
 *
 * Covers the spec test-plan rows assigned to ST-3:
 *   - T12042 — writer-lease identity isolation: concurrent project A / project B /
 *     global writers cannot steal, release, resolve, or close each other's lease
 *     identity; the removed process-global activeScope() registry is replaced with
 *     explicit WriterLeaseIdentity per call.
 *   - Seam 0 — `withColdOpenLease` serializes the cold-open critical section
 *     (claims + releases the row), bootstraps the lease tables on the passed handle,
 *     and is a pure pass-through in `off` mode.
 *   - T9  — dual-scope: a project cold-open lease and a global cold-open lease are
 *     independent (distinct files, never serialize against each other).
 *   - T11 — two-writer arbitration (`local`, daemon OFF): two independent native
 *     handles to the SAME file racing `withColdOpenLease` serialize cleanly.
 *   - T14 — **T5158 regression**: N INDEPENDENT native handles to the SAME
 *     temp-dir cleo.db copy (modeling N processes — `withColdOpenLease` bypasses
 *     the in-process grant memo and arbitrates only over the persisted lease ROW,
 *     so the file is the sole shared medium, exactly as across real processes)
 *     concurrently cold-open in `local` mode → the Seam-0 lease serializes the racy
 *     migrate-write-txn analog → every increment lands (zero lost rows), zero
 *     `E_NOT_INITIALIZED`-class failures. `off` mode is run to confirm the race is
 *     real (guards the heal's value).
 *
 * Every test runs against a TEMP-DIR cleo.db copy — never `.cleo/*.db`.
 *
 * @task T11627
 * @task T12042 (E6-L12b — explicit writer-lease identity)
 * @epic T11625
 */

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  _resetDualScopeDbCache,
  insertIdempotent,
  openDualScopeDbAtPath,
} from '../dual-scope-db.js';
import { applyPerfPragmas } from '../sqlite-pragmas.js';
import {
  _resetWriterLeaseStateForTest,
  _setNativeDbResolverForTest,
  acquireWriterLease,
  type LeaseScope,
  type LeaseTarget,
  makeWriterLeaseIdentity,
  withColdOpenLease,
} from '../writer-lease.js';
import { WRITER_LEASES_TABLE, WRITER_QUEUE_TABLE } from '../writer-lease-schema.js';

let testRoot: string;

beforeEach(() => {
  testRoot = join(tmpdir(), `wl-coldopen-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testRoot, { recursive: true });
  delete process.env.CLEO_WRITER_LEASE_MODE;
  _resetWriterLeaseStateForTest();
});

afterEach(() => {
  _resetWriterLeaseStateForTest();
  _setNativeDbResolverForTest(undefined);
  _resetDualScopeDbCache();
  delete process.env.CLEO_WRITER_LEASE_MODE;
  try {
    rmSync(testRoot, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

/** Open + migrate an isolated temp cleo.db for a scope; return its native handle. */
async function openTempScope(scope: LeaseScope, dir: string): Promise<DatabaseSync> {
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, 'cleo.db');
  const handle =
    scope === 'project'
      ? await openDualScopeDbAtPath('project', dbPath)
      : await openDualScopeDbAtPath('global', dbPath);
  return (handle.db as unknown as { $client: DatabaseSync }).$client;
}

function countActive(db: DatabaseSync, scope: string, lane: string): number {
  return (
    (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM ${WRITER_LEASES_TABLE} WHERE scope = ? AND lane = ? AND active = 1`,
        )
        .get(scope, lane) as { c: number } | undefined
    )?.c ?? 0
  );
}

// ── T12042 — writer-lease identity isolation (replaces process-global activeScope) ──

describe('T12042 — explicit WriterLeaseIdentity isolation (replaces process-global activeScope)', () => {
  it('makeWriterLeaseIdentity produces distinct frozen identities for distinct paths', () => {
    const idA = makeWriterLeaseIdentity('project', '/tmp/a/.cleo/cleo.db');
    const idB = makeWriterLeaseIdentity('project', '/tmp/b/.cleo/cleo.db');
    expect(idA.scope).toBe('project');
    expect(idB.scope).toBe('project');
    expect(idA.dbPath).not.toBe(idB.dbPath);
    // Frozen — cannot be mutated after construction.
    expect(() => {
      (idA as { scope: string }).scope = 'global';
    }).toThrow();
  });

  it('a project identity release cannot free a different project identity row', async () => {
    const dirA = join(testRoot, 'isoA', '.cleo');
    const dirB = join(testRoot, 'isoB', '.cleo');

    const nativeA = await openTempScope('project', dirA);
    const nativeB = await openTempScope('project', dirB);

    const idA = makeWriterLeaseIdentity('project', join(dirA, 'cleo.db'));
    const idB = makeWriterLeaseIdentity('project', join(dirB, 'cleo.db'));

    _setNativeDbResolverForTest(async (_scope, dbPath): Promise<LeaseTarget> => {
      if (dbPath === idB.dbPath) return { native: nativeB, dbPath: idB.dbPath };
      return { native: nativeA, dbPath: idA.dbPath };
    });

    const hA = await acquireWriterLease(idA.scope, 'tasks', { dbPath: idA.dbPath });
    const hB = await acquireWriterLease(idB.scope, 'tasks', { dbPath: idB.dbPath });

    expect(countActive(nativeA, 'project', 'tasks')).toBe(1);
    expect(countActive(nativeB, 'project', 'tasks')).toBe(1);

    // Release A must NOT free B.
    await hA.release();
    expect(countActive(nativeA, 'project', 'tasks')).toBe(0);
    expect(countActive(nativeB, 'project', 'tasks')).toBe(1);

    // Release B must NOT resurrect A.
    await hB.release();
    expect(countActive(nativeB, 'project', 'tasks')).toBe(0);
    expect(countActive(nativeA, 'project', 'tasks')).toBe(0);
  }, 20_000);

  it("a project identity assertion must not gate a global identity's release", async () => {
    const projNative = await openTempScope('project', join(testRoot, 'iso-p', '.cleo'));
    const globNative = await openTempScope('global', join(testRoot, 'iso-g'));

    const projId = makeWriterLeaseIdentity('project', join(testRoot, 'iso-p', '.cleo', 'cleo.db'));
    const globId = makeWriterLeaseIdentity('global', join(testRoot, 'iso-g', 'cleo.db'));

    _setNativeDbResolverForTest(async (scope, dbPath): Promise<LeaseTarget> => {
      if (scope === 'global') return { native: globNative, dbPath: globId.dbPath };
      return { native: projNative, dbPath: projId.dbPath };
    });

    const hP = await acquireWriterLease(projId.scope, 'tasks', { dbPath: projId.dbPath });
    const hG = await acquireWriterLease(globId.scope, 'tasks', { dbPath: globId.dbPath });

    expect(countActive(projNative, 'project', 'tasks')).toBe(1);
    expect(countActive(globNative, 'global', 'tasks')).toBe(1);

    // Release project — global row MUST remain active.
    await hP.release();
    expect(countActive(projNative, 'project', 'tasks')).toBe(0);
    expect(countActive(globNative, 'global', 'tasks')).toBe(1);

    // Release global.
    await hG.release();
    expect(countActive(globNative, 'global', 'tasks')).toBe(0);
  }, 20_000);
});

// ── Chokepoint write primitives with explicit identity ───────────────────────

describe('chokepoint write primitives with explicit WriterLeaseIdentity', () => {
  it('insertIdempotent leases with the passed identity, not a process-global', async () => {
    const projectNative = await openTempScope('project', join(testRoot, 'choke', '.cleo'));
    const dbPath = join(testRoot, 'choke', '.cleo', 'cleo.db');
    const identity = makeWriterLeaseIdentity('project', dbPath);

    _setNativeDbResolverForTest(async () => ({ native: projectNative, dbPath }));

    projectNative.exec(
      'CREATE TABLE IF NOT EXISTS _t_choke (k TEXT PRIMARY KEY, v INTEGER NOT NULL)',
    );

    let activeDuringWrite = -1;
    const stubDb = {
      insert() {
        return {
          values() {
            return {
              onConflictDoNothing() {
                return {
                  async returning() {
                    activeDuringWrite = countActive(projectNative, 'project', 'tasks');
                    projectNative
                      .prepare('INSERT OR IGNORE INTO _t_choke (k, v) VALUES (?, ?)')
                      .run('a', 1);
                    return [{ k: 'a' }];
                  },
                };
              },
            };
          },
        };
      },
    } as any;

    const inserted = await insertIdempotent(stubDb, {} as any, {} as any, 'k', identity);
    expect(inserted).toBe(1);
    expect(activeDuringWrite).toBe(1);
    expect(countActive(projectNative, 'project', 'tasks')).toBe(0);
  }, 20_000);
});

// ── Seam 0 — withColdOpenLease ─────────────────────────────────────────────────

describe('Seam 0 — withColdOpenLease (cold-open critical section)', () => {
  it('bootstraps the lease tables on the passed handle and claims+releases the row', async () => {
    const dbPath = join(testRoot, 'seam0', 'cleo.db');
    mkdirSync(dirname(dbPath), { recursive: true });
    const nativeDb = new DatabaseSync(dbPath, { allowExtension: true });
    applyPerfPragmas(nativeDb, { mmapSizeBytes: 0, cacheSizeKb: 8000 });

    let activeDuring = -1;
    const out = await withColdOpenLease('project', nativeDb, async () => {
      // Tables were bootstrapped before the section runs.
      activeDuring = countActive(nativeDb, 'project', 'tasks');
      return 'ready';
    });
    expect(out).toBe('ready');
    expect(activeDuring).toBe(1); // lease held during the section
    expect(countActive(nativeDb, 'project', 'tasks')).toBe(0); // released after
    // The lease infra tables now exist on the handle.
    const tbl = nativeDb
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(WRITER_QUEUE_TABLE) as { name: string } | undefined;
    expect(tbl?.name).toBe(WRITER_QUEUE_TABLE);
    nativeDb.close();
  });

  it("'off' mode is a pure pass-through: fn runs, no lease row written", async () => {
    process.env.CLEO_WRITER_LEASE_MODE = 'off';
    _resetWriterLeaseStateForTest();
    const dbPath = join(testRoot, 'seam0-off', 'cleo.db');
    mkdirSync(dirname(dbPath), { recursive: true });
    const nativeDb = new DatabaseSync(dbPath, { allowExtension: true });
    applyPerfPragmas(nativeDb, { mmapSizeBytes: 0, cacheSizeKb: 8000 });

    let ran = false;
    await withColdOpenLease('project', nativeDb, async () => {
      ran = true;
    });
    expect(ran).toBe(true);
    // off mode never bootstraps lease tables — the table must not exist.
    const tbl = nativeDb
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(WRITER_LEASES_TABLE) as { name: string } | undefined;
    expect(tbl).toBeUndefined();
    nativeDb.close();
  });
});

// ── T9 — dual-scope independence ───────────────────────────────────────────────

describe('T9 — dual-scope cold-open leases are independent', () => {
  it('a project and a global cold-open lease do not serialize against each other', async () => {
    const projPath = join(testRoot, 't9p', 'cleo.db');
    const globPath = join(testRoot, 't9g', 'cleo.db');
    mkdirSync(dirname(projPath), { recursive: true });
    mkdirSync(dirname(globPath), { recursive: true });
    const proj = new DatabaseSync(projPath, { allowExtension: true });
    const glob = new DatabaseSync(globPath, { allowExtension: true });
    applyPerfPragmas(proj, { mmapSizeBytes: 0, cacheSizeKb: 8000 });
    applyPerfPragmas(glob, { mmapSizeBytes: 0, cacheSizeKb: 8000 });

    // Hold the project cold-open lease while concurrently taking the global one.
    let globalRan = false;
    await withColdOpenLease('project', proj, async () => {
      expect(countActive(proj, 'project', 'tasks')).toBe(1);
      await withColdOpenLease('global', glob, async () => {
        globalRan = true;
        expect(countActive(glob, 'global', 'tasks')).toBe(1);
      });
    });
    expect(globalRan).toBe(true);
    expect(countActive(proj, 'project', 'tasks')).toBe(0);
    expect(countActive(glob, 'global', 'tasks')).toBe(0);
    proj.close();
    glob.close();
  });
});

// ── T11 — two-writer arbitration (local, daemon OFF) ───────────────────────────

describe('T11 — two independent handles to one file serialize cleanly (local)', () => {
  it('two cold-open leases on the SAME file via distinct handles never both hold the row', async () => {
    const dbPath = join(testRoot, 't11', 'cleo.db');
    mkdirSync(dirname(dbPath), { recursive: true });
    const a = new DatabaseSync(dbPath, { allowExtension: true });
    const b = new DatabaseSync(dbPath, { allowExtension: true });
    applyPerfPragmas(a, { mmapSizeBytes: 0, cacheSizeKb: 8000 });
    applyPerfPragmas(b, { mmapSizeBytes: 0, cacheSizeKb: 8000 });

    let maxConcurrent = 0;
    let inSection = 0;
    const section = (h: DatabaseSync) =>
      withColdOpenLease('project', h, async () => {
        inSection += 1;
        maxConcurrent = Math.max(maxConcurrent, inSection);
        await new Promise((r) => setTimeout(r, 40));
        inSection -= 1;
      });

    await Promise.all([section(a), section(b)]);
    // The lease serialized them — they never overlapped in the section.
    expect(maxConcurrent).toBe(1);
    expect(countActive(a, 'project', 'tasks')).toBe(0);
    a.close();
    b.close();
  }, 20_000);
});

// ── T14 — T5158 regression (concurrent cold-open writers serialize) ─────────────

/**
 * Model N concurrent processes by opening N INDEPENDENT native handles to the
 * SAME db file (WAL allows it). `withColdOpenLease` bypasses the in-process grant
 * memo and arbitrates DIRECTLY over the persisted `_writer_leases` row with a fresh
 * `holderId` per call — so the ONLY shared state across these N handles is the
 * SQLite file itself, exactly as it is across real processes. Each "writer" runs
 * the lost-update race (read counter → async yield → write counter+1) that is
 * consistent ONLY under serialization — the cold-open migrate/reconcile write-txn
 * analog at the heart of T5158.
 *
 * @param dbPath - The shared db file.
 * @param count - Number of concurrent independent-handle writers.
 * @param mode - `'local'` (lease serializes) or `'off'` (pass-through, race).
 * @param raceWindowMs - Read→write yield window (widens interleaving).
 * @returns Per-writer `{ id, error }`; `error` is non-null on any open/lease failure.
 */
async function runConcurrentColdOpens(
  dbPath: string,
  count: number,
  mode: 'local' | 'off',
  raceWindowMs: number,
): Promise<{ id: number; error: string | null }[]> {
  process.env.CLEO_WRITER_LEASE_MODE = mode;
  _resetWriterLeaseStateForTest();
  const handles: DatabaseSync[] = Array.from({ length: count }, () => {
    const h = new DatabaseSync(dbPath, { allowExtension: true });
    applyPerfPragmas(h, { mmapSizeBytes: 0, cacheSizeKb: 8000 });
    return h;
  });

  const writer = async (
    h: DatabaseSync,
    id: number,
  ): Promise<{ id: number; error: string | null }> => {
    try {
      await withColdOpenLease(
        'project',
        h,
        async () => {
          // The shared counter + provenance tables (idempotent — any writer may be
          // the one that creates them; the lease makes these safe).
          h.exec(
            'CREATE TABLE IF NOT EXISTS _t14_counter (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)',
          );
          h.exec(
            'CREATE TABLE IF NOT EXISTS _t14_provenance (writer_id INTEGER PRIMARY KEY, observed INTEGER NOT NULL)',
          );
          h.exec('INSERT OR IGNORE INTO _t14_counter (id, n) VALUES (1, 0)');

          // ── The racy read-modify-write (lost-update if not serialized) ────────
          const before =
            (
              h.prepare('SELECT n FROM _t14_counter WHERE id = 1').get() as
                | { n: number }
                | undefined
            )?.n ?? 0;
          await new Promise((r) => setTimeout(r, raceWindowMs)); // widen read→write gap
          h.prepare('UPDATE _t14_counter SET n = ? WHERE id = 1').run(before + 1);
          h.prepare('INSERT INTO _t14_provenance (writer_id, observed) VALUES (?, ?)').run(
            id,
            before,
          );
        },
        { ttlMs: 30_000 },
      );
      return { id, error: null };
    } catch (err) {
      return { id, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
    }
  };

  try {
    return await Promise.all(handles.map((h, id) => writer(h, id)));
  } finally {
    for (const h of handles) {
      try {
        h.close();
      } catch {
        /* idempotent */
      }
    }
  }
}

function counterValue(db: DatabaseSync): number {
  return (
    (db.prepare('SELECT n FROM _t14_counter WHERE id = 1').get() as { n: number } | undefined)?.n ??
    0
  );
}

function provenanceCount(db: DatabaseSync): number {
  return (
    (db.prepare('SELECT COUNT(*) AS c FROM _t14_provenance').get() as { c: number } | undefined)
      ?.c ?? 0
  );
}

describe('T14 — T5158 regression: concurrent cold-open writers serialize (local, daemon OFF)', () => {
  const WRITERS = 6;
  const RACE_WINDOW_MS = 20;

  it("'local' mode serializes the cold-open write-txn: every increment lands, zero E_NOT_INITIALIZED", async () => {
    const dbPath = join(testRoot, 't14-local', 'cleo.db');
    mkdirSync(dirname(dbPath), { recursive: true });

    const results = await runConcurrentColdOpens(dbPath, WRITERS, 'local', RACE_WINDOW_MS);

    // Zero open/arbitration failures (no E_NOT_INITIALIZED / E_INTERNAL class error).
    const errors = results.filter((r) => r.error !== null);
    expect(errors, JSON.stringify(errors)).toHaveLength(0);

    const verify = new DatabaseSync(dbPath, { allowExtension: true });
    applyPerfPragmas(verify, { mmapSizeBytes: 0, cacheSizeKb: 8000 });
    // Serialized → every writer's increment landed (zero lost updates / lost rows).
    expect(counterValue(verify)).toBe(WRITERS);
    expect(provenanceCount(verify)).toBe(WRITERS);
    // No active lease row leaks past the end (all released).
    expect(countActive(verify, 'project', 'tasks')).toBe(0);
    verify.close();
  }, 60_000);

  it("'off' mode reproduces the lost-update race (guards the heal's value)", async () => {
    const dbPath = join(testRoot, 't14-off', 'cleo.db');
    mkdirSync(dirname(dbPath), { recursive: true });

    const results = await runConcurrentColdOpens(dbPath, WRITERS, 'off', RACE_WINDOW_MS);
    // off mode does not arbitrate: opens still succeed (no error), but the racy
    // read-modify-write across the concurrent handles loses updates → the final
    // counter is LESS than the writer count. This proves the race is real and that
    // local-mode serialization (above) is what heals it. (`< WRITERS` keeps the
    // assertion deterministic regardless of interleaving.)
    expect(results.filter((r) => r.error !== null)).toHaveLength(0);
    const verify = new DatabaseSync(dbPath, { allowExtension: true });
    applyPerfPragmas(verify, { mmapSizeBytes: 0, cacheSizeKb: 8000 });
    expect(counterValue(verify)).toBeLessThan(WRITERS);
    verify.close();
  }, 60_000);
});

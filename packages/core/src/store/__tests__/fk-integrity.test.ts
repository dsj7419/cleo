/**
 * Foreign-key integrity of the consolidated dual-scope `cleo.db` (T11530).
 *
 * AC1 of E6-L10 requires `PRAGMA foreign_key_check` to report ZERO violations
 * on BOTH consolidated scopes after the cutover. These cases prove the
 * verification surface itself is sound (it detects a real orphan and a
 * dangling parent table) and then assert the AC on a freshly-migrated pair.
 *
 * @task T11530 (E6-L10)
 * @epic T11249 (E6)
 * @saga T11242
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let projectRoot: string;
let originalCleoDir: string | undefined;
let originalCleoHome: string | undefined;
let cleoHome: string;

describe('foreign-key integrity (T11530)', () => {
  beforeEach(async () => {
    originalCleoDir = process.env['CLEO_DIR'];
    originalCleoHome = process.env['CLEO_HOME'];

    projectRoot = await mkdtemp(join(tmpdir(), 'cleo-fk-project-'));
    await mkdir(join(projectRoot, '.cleo'), { recursive: true });
    process.env['CLEO_DIR'] = join(projectRoot, '.cleo');

    cleoHome = await mkdtemp(join(tmpdir(), 'cleo-fk-home-'));
    process.env['CLEO_HOME'] = cleoHome;
  });

  afterEach(async () => {
    const { closeAllDatabases } = await import('../sqlite.js');
    await closeAllDatabases();

    if (originalCleoDir) process.env['CLEO_DIR'] = originalCleoDir;
    else delete process.env['CLEO_DIR'];
    if (originalCleoHome) process.env['CLEO_HOME'] = originalCleoHome;
    else delete process.env['CLEO_HOME'];

    await rm(projectRoot, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    await rm(cleoHome, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  });

  it('AC1: reports ZERO violations on a freshly-migrated project + global pair', async () => {
    const { verifyForeignKeyIntegrity } = await import('../ports/fk-integrity.js');

    const report = await verifyForeignKeyIntegrity({ cwd: projectRoot });

    expect(report.scopes).toEqual(['project', 'global']);
    // Print the offenders rather than a bare `false` — a violation here names
    // the exact child/parent pair that regressed.
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('detects a genuine orphan row', async () => {
    const { bindTasksDomain } = await import('../sqlite.js');
    const { checkForeignKeys } = await import('../ports/fk-integrity.js');

    const { native } = await bindTasksDomain(projectRoot);

    // Build a child→parent pair and orphan the child with FK enforcement OFF,
    // exactly how a partially-applied migration or a restored legacy snapshot
    // leaves one behind.
    native.exec('PRAGMA foreign_keys=OFF');
    native.exec('CREATE TABLE fk_parent (id INTEGER PRIMARY KEY)');
    native.exec(
      'CREATE TABLE fk_child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES fk_parent(id))',
    );
    native.exec('INSERT INTO fk_child (id, parent_id) VALUES (1, 999)');

    const violations = checkForeignKeys(native, 'project');

    const orphan = violations.find((v) => v.table === 'fk_child');
    expect(orphan).toBeDefined();
    expect(orphan?.parent).toBe('fk_parent');
    expect(orphan?.rowid).toBe(1);
    expect(orphan?.scope).toBe('project');
  });

  it('reports a dangling parent TABLE, not a clean pass', async () => {
    const { bindTasksDomain } = await import('../sqlite.js');
    const { checkForeignKeys } = await import('../ports/fk-integrity.js');

    const { native } = await bindTasksDomain(projectRoot);

    // An FK naming a table that does not exist is legal DDL in SQLite and only
    // fails at write time — this is the shape of a schema still pointing at a
    // table the cutover retired. `PRAGMA foreign_key_check` surfaces it as a
    // normal violation row whose `parent` is the missing table, so the check
    // catches the structural defect and the row-level one through one path.
    native.exec('PRAGMA foreign_keys=OFF');
    native.exec(
      'CREATE TABLE fk_dangling (id INTEGER PRIMARY KEY, ref INTEGER REFERENCES table_that_does_not_exist(id))',
    );
    native.exec('INSERT INTO fk_dangling (id, ref) VALUES (1, 1)');

    const violations = checkForeignKeys(native, 'project');

    const dangling = violations.find((v) => v.table === 'fk_dangling');
    expect(dangling).toBeDefined();
    expect(dangling?.parent).toBe('table_that_does_not_exist');
    expect(dangling?.scope).toBe('project');
  });

  it('can verify a single scope on request', async () => {
    const { verifyForeignKeyIntegrity } = await import('../ports/fk-integrity.js');

    const report = await verifyForeignKeyIntegrity({ cwd: projectRoot, scopes: ['project'] });

    expect(report.scopes).toEqual(['project']);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe('foreign-key repair (T11530)', () => {
  beforeEach(async () => {
    originalCleoDir = process.env['CLEO_DIR'];
    originalCleoHome = process.env['CLEO_HOME'];

    projectRoot = await mkdtemp(join(tmpdir(), 'cleo-fkfix-project-'));
    await mkdir(join(projectRoot, '.cleo'), { recursive: true });
    process.env['CLEO_DIR'] = join(projectRoot, '.cleo');

    cleoHome = await mkdtemp(join(tmpdir(), 'cleo-fkfix-home-'));
    process.env['CLEO_HOME'] = cleoHome;
  });

  afterEach(async () => {
    const { closeAllDatabases } = await import('../sqlite.js');
    await closeAllDatabases();

    if (originalCleoDir) process.env['CLEO_DIR'] = originalCleoDir;
    else delete process.env['CLEO_DIR'];
    if (originalCleoHome) process.env['CLEO_HOME'] = originalCleoHome;
    else delete process.env['CLEO_HOME'];

    await rm(projectRoot, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    await rm(cleoHome, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  });

  it('deletes an orphan whose FK declares ON DELETE CASCADE', async () => {
    const { bindTasksDomain } = await import('../sqlite.js');
    const { repairForeignKeyViolations } = await import('../ports/fk-integrity.js');

    const { native } = await bindTasksDomain(projectRoot);
    native.exec('PRAGMA foreign_keys=OFF');
    native.exec('CREATE TABLE fx_parent (id INTEGER PRIMARY KEY)');
    native.exec(
      'CREATE TABLE fx_child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES fx_parent(id) ON DELETE CASCADE)',
    );
    native.exec('INSERT INTO fx_parent (id) VALUES (1)');
    native.exec('INSERT INTO fx_child (id, parent_id) VALUES (1, 1)');
    native.exec('INSERT INTO fx_child (id, parent_id) VALUES (2, 404)');

    const report = await repairForeignKeyViolations({ cwd: projectRoot, scopes: ['project'] });

    expect(report.repaired.map((v) => v.rowid)).toContain(2);
    expect(report.skipped).toEqual([]);
    expect(report.ok).toBe(true);

    // The orphan is gone; the VALID row survives untouched.
    const remaining = native.prepare('SELECT id FROM fx_child ORDER BY id').all();
    expect(remaining).toEqual([{ id: 1 }]);
  });

  it('refuses to delete an orphan whose FK is NOT ON DELETE CASCADE', async () => {
    const { bindTasksDomain } = await import('../sqlite.js');
    const { repairForeignKeyViolations } = await import('../ports/fk-integrity.js');

    const { native } = await bindTasksDomain(projectRoot);
    native.exec('PRAGMA foreign_keys=OFF');
    native.exec('CREATE TABLE fy_parent (id INTEGER PRIMARY KEY)');
    // NO ACTION (the SQLite default) — the schema expects this row to outlive
    // its parent, so discarding it is an operator decision, not ours.
    native.exec(
      'CREATE TABLE fy_child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES fy_parent(id))',
    );
    native.exec('INSERT INTO fy_child (id, parent_id) VALUES (1, 404)');

    const report = await repairForeignKeyViolations({ cwd: projectRoot, scopes: ['project'] });

    expect(report.repaired).toEqual([]);
    expect(report.skipped.map((v) => v.table)).toContain('fy_child');
    expect(report.ok).toBe(false);

    // Data preserved.
    expect(native.prepare('SELECT id FROM fy_child').all()).toEqual([{ id: 1 }]);
  });
});

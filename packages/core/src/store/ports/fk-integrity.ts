/**
 * Foreign-key integrity verification for the consolidated dual-scope
 * `cleo.db` files.
 *
 * ## Why this exists (E6-L10 · T11530)
 *
 * The E6 cutover consolidated eight standalone databases into two files
 * (project `cleo.db` and global `cleo.db`) and re-pointed every cross-domain
 * foreign key at the PREFIXED consolidated tables. Two properties must hold
 * afterwards and neither is self-evident:
 *
 * 1. **Referential integrity survived the move.** Exodus copies tables in
 *    dependency order, but a partially-applied migration, a hand-edited row,
 *    or a legacy DB restored from a pre-consolidation backup can leave an
 *    orphan whose parent row never made the trip.
 * 2. **The FKs point at the right tables.** SQLite resolves a `REFERENCES`
 *    clause lazily, so an FK naming a table that no longer exists is not an
 *    error at DDL time — it fails only when a write touches it. A schema that
 *    still references the retired bare `tasks` table looks fine until
 *    something inserts.
 *
 * `PRAGMA foreign_key_check` answers both: it walks every FK in the schema and
 * returns one row per violation, including one whose `parent` names a table
 * that does not exist. So a structural defect and a row-level orphan surface
 * through the same path.
 *
 * The verification runs against the LIVE consolidated files, not a fixture —
 * this is the check that proves a real installation is sound.
 *
 * @packageDocumentation
 * @task T11530 (E6-L10)
 * @epic T11249 (E6)
 * @saga T11242 (SG-DB-SUBSTRATE-V2)
 */

import type { DatabaseSync } from 'node:sqlite';
import type { DualScope } from '../dual-scope-db.js';
import { bindGlobalDomain, bindProjectDomain } from './domain-binding.js';

/**
 * One referential-integrity violation.
 *
 * Mirrors a `PRAGMA foreign_key_check` row, plus the scope it was found in so
 * a combined project+global report stays attributable.
 *
 * @task T11530
 */
export interface ForeignKeyViolation {
  /** Which consolidated `cleo.db` the violation was found in. */
  readonly scope: DualScope;
  /** The child table holding the orphan row. */
  readonly table: string;
  /**
   * `rowid` of the orphan row, or `null` when the violation is structural
   * (the referenced parent TABLE does not exist, so there is no single row).
   */
  readonly rowid: number | null;
  /** The parent table the foreign key references. */
  readonly parent: string;
  /**
   * Index of the failing foreign key within the child table's FK list, as
   * reported by `PRAGMA foreign_key_list`. `-1` for structural violations.
   */
  readonly fkid: number;
}

/**
 * Result of verifying one or both consolidated scopes.
 *
 * @task T11530
 */
export interface ForeignKeyIntegrityReport {
  /** `true` when {@link violations} is empty. */
  readonly ok: boolean;
  /** The scopes actually checked. */
  readonly scopes: readonly DualScope[];
  /** Every violation found, in scope order. */
  readonly violations: readonly ForeignKeyViolation[];
}

/**
 * Run `PRAGMA foreign_key_check` against one open connection.
 *
 * @param native - An open consolidated `cleo.db` connection.
 * @param scope - The scope label to attribute violations to.
 * @returns Every violation the pragma reported.
 */
export function checkForeignKeys(
  native: DatabaseSync,
  scope: DualScope,
): readonly ForeignKeyViolation[] {
  let rows: Array<{ table: string; rowid: number | null; parent: string; fkid: number }>;
  try {
    rows = native.prepare('PRAGMA foreign_key_check').all() as typeof rows;
  } catch (err) {
    // The pragma normally reports a dangling parent table as an ordinary
    // violation row, so this path is defensive: it covers the cases where
    // SQLite raises instead (a malformed schema row, an unreadable page).
    // Surfacing the error as a violation keeps a failure from reading as
    // "no violations found".
    const message = err instanceof Error ? err.message : String(err);
    return [
      {
        scope,
        table: '(schema)',
        rowid: null,
        parent: message,
        fkid: -1,
      },
    ];
  }

  return rows.map((row) => ({
    scope,
    table: row.table,
    rowid: row.rowid,
    parent: row.parent,
    fkid: row.fkid,
  }));
}

/**
 * Verify foreign-key integrity across the consolidated dual-scope databases.
 *
 * Opens each requested scope through the ProjectStore/GlobalStore ports — the
 * same chokepoint the runtime uses — so the check runs against exactly the
 * connection (and therefore the schema and pragmas) production code sees.
 *
 * The `establish` callbacks are deliberately inert: this is a read-only probe
 * and must not reconcile or migrate anything as a side effect of checking.
 *
 * @param options - Which scopes to check and which project.
 * @returns A report; `ok` is `true` only when ZERO violations were found.
 *
 * @example
 * ```ts
 * const report = await verifyForeignKeyIntegrity({ cwd: projectRoot });
 * if (!report.ok) {
 *   for (const v of report.violations) {
 *     console.error(`${v.scope}: ${v.table} row ${v.rowid} → missing ${v.parent}`);
 *   }
 * }
 * ```
 *
 * @task T11530
 */
export async function verifyForeignKeyIntegrity(options?: {
  /** Project working directory. Defaults to the ambient project. */
  readonly cwd?: string;
  /** Scopes to check. Defaults to BOTH — the AC requires project AND global. */
  readonly scopes?: readonly DualScope[];
}): Promise<ForeignKeyIntegrityReport> {
  const scopes = options?.scopes ?? (['project', 'global'] as const);
  const violations: ForeignKeyViolation[] = [];

  for (const scope of scopes) {
    const binding =
      scope === 'project'
        ? await bindProjectDomain('fk-check', options?.cwd, (native) => native)
        : await bindGlobalDomain('fk-check', (native) => native);

    violations.push(...checkForeignKeys(binding.native, scope));
  }

  return { ok: violations.length === 0, scopes, violations };
}

/**
 * Outcome of a repair pass.
 *
 * @task T11530
 */
export interface ForeignKeyRepairReport {
  /** Violations found before the repair ran. */
  readonly found: readonly ForeignKeyViolation[];
  /** Violations the repair deleted (parent FK declared `ON DELETE CASCADE`). */
  readonly repaired: readonly ForeignKeyViolation[];
  /**
   * Violations left in place because the schema does NOT authorise deleting
   * the child — the FK's `ON DELETE` is not `CASCADE`, so removing the row is
   * a judgement call an operator must make.
   */
  readonly skipped: readonly ForeignKeyViolation[];
  /** `true` when a re-check after the repair reported zero violations. */
  readonly ok: boolean;
}

/**
 * Whether the child table's failing foreign key declares `ON DELETE CASCADE`.
 *
 * This is the authorisation rule for automatic repair. A `CASCADE` FK is the
 * schema stating "this row exists only while its parent does" — so an orphan
 * is a row that SHOULD already have been deleted and removing it restores the
 * intended state rather than discarding meaningful data. Any other
 * `ON DELETE` action (`NO ACTION`, `RESTRICT`, `SET NULL`) means the schema
 * expects the row to outlive or block the parent's removal, and deleting it
 * would be destroying data the operator never authorised.
 *
 * @param native - The open connection.
 * @param table - The child table.
 * @param fkid - Index into the child's `PRAGMA foreign_key_list`.
 */
function isCascadeDelete(native: DatabaseSync, table: string, fkid: number): boolean {
  try {
    const fks = native.prepare(`PRAGMA foreign_key_list(${JSON.stringify(table)})`).all() as Array<{
      id: number;
      on_delete: string;
    }>;
    return fks.some((fk) => fk.id === fkid && fk.on_delete.toUpperCase() === 'CASCADE');
  } catch {
    return false;
  }
}

/**
 * Delete orphan rows whose foreign key declares `ON DELETE CASCADE`.
 *
 * These rows are the residue of a parent deletion that happened while FK
 * enforcement was off — most commonly a pre-consolidation legacy database that
 * exodus then copied verbatim. The schema already says they should not exist;
 * this restores that invariant.
 *
 * Rows whose FK is NOT `CASCADE` are reported in `skipped` and left untouched.
 *
 * @param options - Which scopes to repair and which project.
 * @returns What was found, repaired, and deliberately skipped.
 *
 * @task T11530
 */
export async function repairForeignKeyViolations(options?: {
  /** Project working directory. Defaults to the ambient project. */
  readonly cwd?: string;
  /** Scopes to repair. Defaults to BOTH. */
  readonly scopes?: readonly DualScope[];
}): Promise<ForeignKeyRepairReport> {
  const scopes = options?.scopes ?? (['project', 'global'] as const);
  const found: ForeignKeyViolation[] = [];
  const repaired: ForeignKeyViolation[] = [];
  const skipped: ForeignKeyViolation[] = [];

  for (const scope of scopes) {
    const binding =
      scope === 'project'
        ? await bindProjectDomain('fk-check', options?.cwd, (native) => native)
        : await bindGlobalDomain('fk-check', (native) => native);
    const native = binding.native;

    const violations = checkForeignKeys(native, scope);
    found.push(...violations);

    for (const v of violations) {
      // A structural violation has no single row to delete.
      if (v.rowid === null || v.fkid < 0) {
        skipped.push(v);
        continue;
      }
      if (!isCascadeDelete(native, v.table, v.fkid)) {
        skipped.push(v);
        continue;
      }
      native
        .prepare(`DELETE FROM ${JSON.stringify(v.table)} WHERE rowid = ?`)
        .run(v.rowid as unknown as number);
      repaired.push(v);
    }
  }

  const after = await verifyForeignKeyIntegrity({
    ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
    scopes,
  });

  return { found, repaired, skipped, ok: after.ok };
}

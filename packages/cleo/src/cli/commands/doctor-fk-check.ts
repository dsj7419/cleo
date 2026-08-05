/**
 * `cleo doctor fk-check` — foreign-key integrity of the consolidated
 * dual-scope `cleo.db` files (T11530).
 *
 * Runs `PRAGMA foreign_key_check` against the project and global consolidated
 * databases through the same ProjectStore/GlobalStore ports the runtime uses,
 * so the check sees exactly the schema and pragmas production code sees.
 *
 * Read-only: it never migrates, reconciles, or repairs. Exits non-zero when
 * any violation is found so CI can gate on it.
 *
 * @task T11530 (E6-L10)
 * @epic T11249 (E6)
 * @saga T11242 (SG-DB-SUBSTRATE-V2)
 * @see packages/core/src/store/ports/fk-integrity.ts — the verification primitive
 */

import { repairForeignKeyViolations, verifyForeignKeyIntegrity } from '@cleocode/core/db';
import { defineCommand } from '../lib/define-cli-command.js';
import { cliError, cliOutput, humanInfo } from '../renderers/index.js';

/**
 * `cleo doctor fk-check` subcommand.
 *
 * @task T11530
 */
export const doctorFkCheckCommand = defineCommand({
  meta: {
    name: 'fk-check',
    description:
      'Verify foreign-key integrity of the consolidated project + global cleo.db ' +
      '(PRAGMA foreign_key_check). Read-only; exits non-zero on any violation.',
  },
  args: {
    scope: {
      type: 'string',
      description: "Limit the check to one scope ('project' or 'global'). Default: both.",
    },
    fix: {
      type: 'boolean',
      description:
        'Delete orphan rows whose foreign key declares ON DELETE CASCADE (the schema already ' +
        'says they should not exist). Other violations are reported, never touched.',
    },
  },
  async run({ args }) {
    const scopeArg = args.scope as string | undefined;
    if (scopeArg !== undefined && scopeArg !== 'project' && scopeArg !== 'global') {
      cliError(`--scope must be 'project' or 'global' (received: ${scopeArg})`, 'E_INVALID_INPUT', {
        fix: "Run 'cleo doctor fk-check --scope project' or omit --scope to check both.",
      });
      process.exitCode = 6;
      return;
    }

    const scopeOpt = scopeArg ? { scopes: [scopeArg] as const } : {};

    if (args.fix === true) {
      const fixReport = await repairForeignKeyViolations({ cwd: process.cwd(), ...scopeOpt });

      humanInfo(
        `  foreign_key_check --fix: ${fixReport.found.length} found, ` +
          `${fixReport.repaired.length} repaired, ${fixReport.skipped.length} skipped`,
      );
      for (const v of fixReport.repaired) {
        humanInfo(`      repaired [${v.scope}] ${v.table} rowid=${v.rowid} → ${v.parent}`);
      }
      for (const v of fixReport.skipped) {
        humanInfo(
          `      SKIPPED  [${v.scope}] ${v.table} rowid=${v.rowid ?? 'n/a'} → ${v.parent} ` +
            '(foreign key is not ON DELETE CASCADE — repair by hand)',
        );
      }

      cliOutput(
        { kind: 'generic', ...fixReport },
        {
          command: 'doctor fk-check',
          message: fixReport.ok
            ? `foreign_key_check: repaired ${fixReport.repaired.length} orphan(s); 0 violations remain.`
            : `foreign_key_check: ${fixReport.skipped.length} violation(s) remain after repair.`,
        },
      );

      if (!fixReport.ok) process.exitCode = 1;
      return;
    }

    const report = await verifyForeignKeyIntegrity({ cwd: process.cwd(), ...scopeOpt });

    if (report.ok) {
      humanInfo(`  foreign_key_check: OK — 0 violations across ${report.scopes.join(' + ')}`);
    } else {
      humanInfo(`  foreign_key_check: ${report.violations.length} violation(s)`);
      for (const v of report.violations) {
        humanInfo(
          `      [${v.scope}] ${v.table} rowid=${v.rowid ?? 'n/a'} → missing parent ${v.parent} (fk #${v.fkid})`,
        );
      }
    }

    cliOutput(
      {
        kind: 'generic',
        ok: report.ok,
        scopes: report.scopes,
        violationCount: report.violations.length,
        violations: report.violations,
      },
      {
        command: 'doctor fk-check',
        message: report.ok
          ? `foreign_key_check: OK — 0 violations across ${report.scopes.join(' + ')}.`
          : `foreign_key_check: ${report.violations.length} violation(s) across ${report.scopes.join(' + ')}.`,
      },
    );

    if (!report.ok) {
      process.exitCode = 1;
    }
  },
});

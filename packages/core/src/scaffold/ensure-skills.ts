/**
 * Project-context scaffolding: detects project type and writes
 * project-context.json.
 */

import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectContext } from '@cleocode/contracts';
import type { ScaffoldResult } from '@cleocode/contracts/scaffold-diagnostics';
import { pushWarning } from '../output.js';
import { resolveScaffoldCleoDir } from './ensure-config.js';

/**
 * Detect and write project-context.json.
 * Idempotent: skips if file exists and is less than staleDays old (default: 30).
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param opts - Optional configuration
 * @param opts.force - When true, regenerate even if the file is fresh
 * @param opts.staleDays - Age threshold in days before regeneration (default: 30)
 * @returns Scaffold result indicating the action taken
 */
export async function ensureProjectContext(
  projectRoot: string,
  opts?: { force?: boolean; staleDays?: number },
): Promise<ScaffoldResult> {
  const cleoDir = resolveScaffoldCleoDir(projectRoot);
  const contextPath = join(cleoDir, 'project-context.json');
  const staleDays = opts?.staleDays ?? 30;

  if (existsSync(contextPath) && !opts?.force) {
    try {
      const content = JSON.parse(readFileSync(contextPath, 'utf-8'));
      if (content.detectedAt) {
        const detectedAt = new Date(content.detectedAt);
        const ageMs = Date.now() - detectedAt.getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        if (ageDays < staleDays) {
          return {
            action: 'skipped',
            path: contextPath,
            details: `Fresh (${Math.floor(ageDays)}d old)`,
          };
        }
      }
    } catch {
      // If we can't parse it, regenerate
    }
  }

  const { detectProjectType } = await import('../store/project-detect.js');
  const context = detectProjectType(projectRoot);

  // Preserve user-supplied command overrides from existing file so
  // regeneration does not silently clobber them (T12027 / #1122 / #1129).
  if (existsSync(contextPath)) {
    try {
      const existing = JSON.parse(readFileSync(contextPath, 'utf-8')) as Record<string, unknown>;
      preserveUserOverrides(existing, context);
    } catch {
      // If we can't parse existing, proceed with freshly-detected context
    }
  }

  try {
    const schemaPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../schemas/project-context.schema.json',
    );
    if (existsSync(schemaPath)) {
      const AjvModule = await import('ajv');
      const ajvMod = AjvModule as Record<string, unknown>;
      const AjvClass = (
        typeof ajvMod.default === 'function' ? ajvMod.default : AjvModule.default
      ) as new (
        opts?: Record<string, unknown>,
      ) => {
        validate(schema: unknown, data: unknown): boolean;
        errors?: unknown[] | null;
        addFormat?: (name: string, format: unknown) => unknown;
      };
      const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
      const ajv = new AjvClass({ strict: false });
      const addFormatsModule = await import('ajv-formats');
      const fmtMod = addFormatsModule as Record<string, unknown>;
      const addFormats = (
        typeof fmtMod.default === 'function' ? fmtMod.default : addFormatsModule.default
      ) as (instance: unknown) => unknown;
      addFormats(ajv);
      const valid = ajv.validate(schema, context);
      if (!valid) {
        pushWarning({
          code: 'W_SCAFFOLD_PARTIAL',
          message: `project-context.json schema validation warnings: ${JSON.stringify(ajv.errors)}`,
        });
      }
    }
  } catch {
    // Schema validation is best-effort — never block the write
  }

  await writeFile(contextPath, JSON.stringify(context, null, 2));

  return {
    action: existsSync(contextPath) ? 'repaired' : 'created',
    path: contextPath,
  };
}

/**
 * Copy user-supplied command overrides from parsed JSON (`existing`) into
 * the freshly-detected {@link ProjectContext} so regeneration does not
 * silently clobber them.
 *
 * Each override is carried over only when the existing JSON carries a
 * non-empty string at the typed command path.
 *
 * @task T12027
 */
function preserveUserOverrides(existing: Record<string, unknown>, context: ProjectContext): void {
  // testing.command
  const testingCmd = readCmdFromExisting(existing, 'testing');
  if (testingCmd) {
    context.testing = { ...context.testing, command: testingCmd };
  }

  // build.command
  const buildCmd = readCmdFromExisting(existing, 'build');
  if (buildCmd) {
    context.build = { ...context.build, command: buildCmd };
  }

  // lint.command
  const lintCmd = readCmdFromExisting(existing, 'lint');
  if (lintCmd) {
    context.lint = { command: lintCmd };
  }

  // typecheck.command
  const typecheckCmd = readCmdFromExisting(existing, 'typecheck');
  if (typecheckCmd) {
    context.typecheck = { command: typecheckCmd };
  }

  // audit.command
  const auditCmd = readCmdFromExisting(existing, 'audit');
  if (auditCmd) {
    context.audit = { command: auditCmd };
  }

  // security-scan.command
  const secscanCmd = readCmdFromExisting(existing, 'security-scan');
  if (secscanCmd) {
    context['security-scan'] = { command: secscanCmd };
  }
}

/**
 * Safely extract a `.command` string from a nested key of a parsed JSON
 * object. Returns `null` when the key is absent, not an object, or the
 * command is missing / empty.
 *
 * @task T12027
 */
function readCmdFromExisting(existing: Record<string, unknown>, key: string): string | null {
  const obj = existing[key];
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const cmd = (obj as Record<string, unknown>).command;
  return typeof cmd === 'string' && cmd.length > 0 ? cmd : null;
}

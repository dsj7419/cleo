/**
 * Project-context scaffolding: detects project type and writes
 * project-context.json.
 */

import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
      mergeCommandOverride(existing, context as unknown as Record<string, unknown>, [
        'testing',
        'command',
      ]);
      mergeCommandOverride(existing, context as unknown as Record<string, unknown>, [
        'build',
        'command',
      ]);
      mergeCommandOverride(existing, context as unknown as Record<string, unknown>, [
        'lint',
        'command',
      ]);
      mergeCommandOverride(existing, context as unknown as Record<string, unknown>, [
        'typecheck',
        'command',
      ]);
      mergeCommandOverride(existing, context as unknown as Record<string, unknown>, [
        'audit',
        'command',
      ]);
      mergeCommandOverride(existing, context as unknown as Record<string, unknown>, [
        'security-scan',
        'command',
      ]);
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
 * Copy a user-supplied command override from `existing` into `context` at
 * the given JSON path segments.
 *
 * Only copies if the existing file actually has a non-empty string at that
 * path — auto-detected fields from `detectProjectType()` are preserved when
 * the user has not set an override.
 *
 * @task T12027
 */
function mergeCommandOverride(
  existing: Record<string, unknown>,
  context: Record<string, unknown>,
  path: string[],
): void {
  let src: unknown = existing;
  for (const segment of path) {
    if (!src || typeof src !== 'object' || Array.isArray(src)) return;
    src = (src as Record<string, unknown>)[segment];
  }
  if (typeof src !== 'string' || src.length === 0) return;

  let tgt: Record<string, unknown> = context;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    let next = tgt[seg];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      next = {};
      tgt[seg] = next;
    }
    tgt = next as Record<string, unknown>;
  }
  tgt[path[path.length - 1]] = src;
}

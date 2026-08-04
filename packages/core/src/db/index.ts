/**
 * `@cleocode/core/db` subpath export — typed dual-scope SQLite client.
 *
 * This barrel re-exports the public API of the dual-scope DB chokepoint
 * implemented in `packages/core/src/store/dual-scope-db.ts` as the
 * `@cleocode/core/db` subpath module.
 *
 * ## What is exported
 *
 * - {@link openDualScopeDb} — open (or re-use) the consolidated `cleo.db`
 *   for either scope.
 * - {@link DualScopeDbHandle} — handle type returned by `openDualScopeDb`.
 * - {@link DualScope} — the `'project' | 'global'` scope union.
 * - {@link CleoProjectDb} — typed Drizzle handle for the project scope.
 * - {@link CleoGlobalDb} — typed Drizzle handle for the global scope.
 * - {@link resolveDualScopeDbPath} — resolve the absolute DB file path.
 * - {@link insertIdempotent} — retry-safe insert (ON CONFLICT DO NOTHING).
 * - {@link upsertIdempotent} — retry-safe upsert (ON CONFLICT DO UPDATE).
 * - {@link assertWriteDurable} — guard a mutation path against an aborted
 *   exodus-on-open (T11828 · DHQ-059).
 * - {@link ExodusAbortWriteUnsafeError} — thrown by `assertWriteDurable`.
 * - {@link _resetDualScopeDbCache} — test helper: clear singleton cache.
 * - {@link createCleoRuntime} — create the runtime store registry.
 * - {@link CleoRuntime} — the registry interface.
 * - {@link ProjectStore} — typed project-scope handle from the runtime.
 * - {@link GlobalStore} — typed global-scope handle from the runtime.
 *
 * ## Usage
 *
 * ```ts
 * import { openDualScopeDb, insertIdempotent } from '@cleocode/core/db';
 *
 * const proj = await openDualScopeDb('project', process.cwd());
 * const global = await openDualScopeDb('global');
 * ```
 *
 * ```ts
 * import { createCleoRuntime, resolveDualScopeDbPath } from '@cleocode/core/db';
 *
 * const runtime = createCleoRuntime();
 * const projectA = await runtime.openProject(resolveDualScopeDbPath('project', '/path/A'));
 * const dedicated = await runtime.openProject('/path/to/snapshot.db', { dedicated: true });
 * // dedicated.close() closes only this connection; the runtime does NOT track it.
 * ```
 *
 * @packageDocumentation
 * @task T11514 (E4-T3)
 * @task T12036 (E6-L12)
 * @epic T11247 (E4)
 * @saga T11242 (SG-DB-SUBSTRATE-V2)
 */

export {
  _resetDualScopeDbCache,
  assertWriteDurable,
  type CleoGlobalDb,
  type CleoProjectDb,
  type CleoRuntime,
  type CleoRuntimeOpenOptions,
  createCleoRuntime,
  type DualScope,
  type DualScopeDbHandle,
  ExodusAbortWriteUnsafeError,
  type GlobalStore,
  insertIdempotent,
  openDualScopeDb,
  type ProjectStore,
  resolveDualScopeDbPath,
  upsertIdempotent,
} from '../store/dual-scope-db.js';
export { type ExodusAbortDetail, exodusAbortEvents } from '../store/exodus/abort-events.js';

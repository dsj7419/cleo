/**
 * Ambient declaration for `@cleocode/core/tools/fs.js`.
 *
 * caamp CONSUMES the canonical atomic-write primitive from core rather than
 * redefining it — the Tools-vs-Skills boundary (T11409) requires atomic tool
 * primitives to be DEFINED only under `packages/core/src/tools`.
 *
 * It cannot resolve the real declaration at typecheck time: `packages/caamp`
 * deliberately carries **no project reference to core** (that is how the
 * core↔caamp dependency cycle is broken), so `tsc -b` never builds core's
 * declarations before caamp's. Pre-emitting a stub into `packages/core/dist/`
 * — the approach used for `skills/skill-root.js` — makes the file both an
 * input to caamp and an emit target of core, which `tsc -b` rejects with
 * TS5055.
 *
 * Declaring the module here instead keeps the shim inside caamp, where it is
 * visible next to the code that needs it, and cannot collide with core's emit.
 * The signature is reproduced from `packages/core/src/tools/fs.ts`; the types
 * come from `@cleocode/contracts/tools/atomic`, which caamp already depends
 * on, so nothing new is introduced.
 *
 * Runtime resolution is unaffected — core's `package.json` exports
 * `./tools/*`, and `@cleocode/core` is a direct dependency of caamp.
 *
 * @task T12051
 */
declare module '@cleocode/core/tools/fs.js' {
  import type { WriteFileInput, WriteFileResult } from '@cleocode/contracts/tools/atomic';

  /**
   * Atomically write a file via tmp-then-rename.
   *
   * @param input - Absolute path, content, and whether to create parent dirs.
   * @returns The path written and the number of bytes written.
   */
  export function writeFileAtomic(input: WriteFileInput): Promise<WriteFileResult>;
}

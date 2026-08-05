/**
 * Shared lock file utilities
 *
 * Single source of truth for reading/writing the canonical CAAMP lock file path.
 * Both MCP and skills lock modules import from here.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { CaampLockFile } from '../types.js';
import { withFileLock, writeFileAtomic } from './fs/atomic.js';
import { LOCK_FILE_PATH } from './paths/agents.js';

async function writeLockFileUnsafe(lock: CaampLockFile): Promise<void> {
  await writeFileAtomic(LOCK_FILE_PATH, `${JSON.stringify(lock, null, 2)}\n`);
}

/**
 * Read and parse the CAAMP lock file from disk.
 *
 * @remarks
 * Returns a default empty lock structure when the file does not exist or
 * cannot be parsed, ensuring callers always receive a valid object.
 *
 * @returns Parsed lock file contents
 *
 * @example
 * ```typescript
 * const lock = await readLockFile();
 * console.log(Object.keys(lock.mcpServers));
 * ```
 *
 * @public
 */
export async function readLockFile(): Promise<CaampLockFile> {
  try {
    if (!existsSync(LOCK_FILE_PATH)) {
      return { version: 1, skills: {}, mcpServers: {} };
    }
    const content = await readFile(LOCK_FILE_PATH, 'utf-8');
    return JSON.parse(content) as CaampLockFile;
  } catch {
    return { version: 1, skills: {}, mcpServers: {} };
  }
}

/**
 * Write the lock file atomically under a process lock guard.
 *
 * @remarks
 * Uses a file-system lock guard to prevent concurrent writes from multiple
 * CAAMP processes. The write itself is atomic (write-to-tmp then rename).
 *
 * @param lock - Lock file data to persist
 *
 * @example
 * ```typescript
 * const lock = await readLockFile();
 * lock.mcpServers["my-server"] = entry;
 * await writeLockFile(lock);
 * ```
 *
 * @public
 */
export async function writeLockFile(lock: CaampLockFile): Promise<void> {
  await withFileLock(LOCK_FILE_PATH, () => writeLockFileUnsafe(lock));
}

/**
 * Safely read-modify-write the lock file under a process lock guard.
 *
 * @remarks
 * Acquires an exclusive file-system lock, reads the current lock file, applies
 * the updater callback, writes the result atomically, and releases the lock.
 * The updater may mutate the lock object in place.
 *
 * @param updater - Callback that modifies the lock object (may be async)
 * @returns The updated lock file contents after the write
 *
 * @example
 * ```typescript
 * const updated = await updateLockFile((lock) => {
 *   lock.mcpServers["new-server"] = entry;
 * });
 * ```
 *
 * @public
 */
export async function updateLockFile(
  updater: (lock: CaampLockFile) => void | Promise<void>,
): Promise<CaampLockFile> {
  return withFileLock(LOCK_FILE_PATH, async () => {
    const lock = await readLockFile();
    await updater(lock);
    await writeLockFileUnsafe(lock);
    return lock;
  });
}

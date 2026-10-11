/**
 * T13522 — worker worktrees advertised strict git protection while the shim
 * was never installed. `ensureGitShimDir` now installs a launcher pointing at
 * the real shim, and refuses (installed: false) when the shim is missing.
 *
 * @task T13522
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentWorktreeState } from '@cleocode/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { buildWorktreeSpawnResult, ensureGitShimDir } from '../branch-lock.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILT_SHIM = resolve(here, '../../../../git-shim/dist/shim.js');

describe('ensureGitShimDir (T13522)', () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  /** A standalone project: a git repo with no node_modules of its own. */
  function standaloneRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'cleo-shim-standalone-'));
    execFileSync('git', ['init', '-q', '--initial-branch=main'], { cwd: dir });
    writeFileSync(join(dir, 'README.md'), 'x\n');
    return dir;
  }

  it.runIf(existsSync(BUILT_SHIM) && process.platform !== 'win32')(
    'a standalone project gets an executable git launcher that blocks a push to main',
    () => {
      root = standaloneRepo();
      const shim = ensureGitShimDir(root, BUILT_SHIM);
      expect(shim.installed).toBe(true);
      const launcher = join(shim.dir, 'git');
      accessSync(launcher, constants.X_OK);

      const env = {
        PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
        HOME: root,
        CLEO_AGENT_ROLE: 'worker',
        CLEO_WORKTREE_ROOT: root,
        CLEO_AUDIT_LOG_PATH: join(root, 'git-shim.jsonl'),
      };
      const pushed = spawnSync(launcher, ['push', 'origin', 'HEAD:main'], {
        cwd: root,
        env,
        encoding: 'utf-8',
      });
      expect(pushed.status).toBe(77);
      expect(pushed.stderr).toContain('protected branch');
      // Global options and every-ref pushes do not get around it (T13533).
      for (const argv of [
        ['-c', 'k=v', 'push', 'origin', 'main'],
        ['-C', root, 'push', 'origin', 'HEAD:main'],
        ['push', '--all', 'origin'],
        ['push', '--mirror', 'origin'],
      ]) {
        const r = spawnSync(launcher, argv, { cwd: root, env, encoding: 'utf-8' });
        expect(r.status, argv.join(' ')).toBe(77);
      }
      // A bare push from a task branch whose upstream is main (T13533).
      const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf-8' });
      git([
        '-c',
        'user.email=t@t',
        '-c',
        'user.name=t',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'T1 init',
      ]);
      git(['remote', 'add', 'origin', root]);
      git(['fetch', '-q', 'origin']);
      git(['switch', '-q', '-c', 'task/T1', '--track', 'origin/main']);
      const bare = spawnSync(launcher, ['push'], { cwd: root, env, encoding: 'utf-8' });
      expect(bare.status).toBe(77);
      expect(bare.stderr).toContain('protected branch main');
      // A harmless command still reaches the real git.
      const status = spawnSync(launcher, ['status', '--short'], {
        cwd: root,
        env,
        encoding: 'utf-8',
      });
      expect(status.status).toBe(0);
    },
  );

  it('reports not installed, writing no launcher, when the shim cannot be found', () => {
    root = standaloneRepo();
    const shim = ensureGitShimDir(root, join(root, 'missing', 'shim.js'));
    expect(shim.installed).toBe(false);
    expect(shim.reason).toContain('not found');
    expect(existsSync(join(shim.dir, 'git'))).toBe(false);
  });
});

describe('buildWorktreeSpawnResult honours the shim install (T13522)', () => {
  const worktree: AgentWorktreeState = {
    path: '/wt/T1',
    branch: 'task/T1',
    taskId: 'T1',
    baseRef: 'main',
    projectHash: 'h',
    createdAt: '2026-10-11T00:00:00.000Z',
    locked: false,
  };

  it('says unavailable and adds no PATH entry when the shim is not installed', () => {
    const r = buildWorktreeSpawnResult(worktree, {
      dir: '/p/.cleo/bin/git-shim',
      installed: false,
      shimBinPath: null,
    });
    expect(r.envVars['CLEO_BRANCH_PROTECTION']).toBe('unavailable');
    expect(Object.values(r.envVars).some((v) => v.includes('/p/.cleo/bin/git-shim'))).toBe(false);
    expect(r.preamble).toContain('NOT enforced');
  });

  it('says strict with the shim first on PATH when installed', () => {
    const r = buildWorktreeSpawnResult(worktree, {
      dir: '/p/.cleo/bin/git-shim',
      installed: true,
      shimBinPath: '/x/shim.js',
    });
    expect(r.envVars['CLEO_BRANCH_PROTECTION']).toBe('strict');
    expect(Object.values(r.envVars).some((v) => v.startsWith('/p/.cleo/bin/git-shim'))).toBe(true);
  });
});

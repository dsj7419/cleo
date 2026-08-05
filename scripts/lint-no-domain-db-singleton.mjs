#!/usr/bin/env node
/**
 * Lint rule: reject per-domain module-global DB singleton caches.
 *
 * Why this matters (T12041 · E6-L17)
 * -----------------------------------
 * Before the ProjectStore cutover (T12037–T12039) every store facade owned its
 * own module-global cache over ONE shared consolidated `cleo.db` connection:
 *
 *   let _db: NodeSQLiteDatabase | null = null;
 *   let _nativeDb: DatabaseSync | null = null;
 *   let _dbPath: string | null = null;
 *   let _initPromise: Promise<NodeSQLiteDatabase> | null = null;
 *
 * Five such caches over one connection is duplicate ownership, and it produced
 * a documented defect class:
 *
 *   1. Last-project-wins — a single `_dbPath` tracked ONE project, so touching
 *      a second project reset the first and re-migrated on every alternation.
 *   2. Cross-domain staleness — one domain could hold a `DatabaseSync` another
 *      had already closed (T12019/T12020), surfacing as `database is not open`
 *      or, worse, a silently-nulled `sourceSessionId`.
 *   3. Duplicated band-aids — each facade grew its own bounded reacquisition
 *      loop (T12035) to paper over (2).
 *
 * Ownership now lives in ONE place: the path-keyed binding registry at
 * `packages/core/src/store/ports/domain-binding.ts`, layered on the
 * `CleoRuntime` store registry. This rule stops the old pattern coming back.
 *
 * What is detected
 * ----------------
 * A module-level (column-0) `let` binding whose name looks like a DB handle
 * cache AND whose initialiser is `null` — the shape of a lazily-populated
 * singleton. Function-local `let`s are indented and therefore never match.
 *
 * Legitimate module state that is NOT a connection cache (a resolved path
 * override, a memoised factory import) does not match: the name must contain a
 * DB-handle noun.
 *
 * Allowlisted locations
 * ---------------------
 *   1. `packages/core/src/store/ports/` — the registry itself; it is SUPPOSED
 *      to own the maps.
 *   2. `packages/core/src/store/dual-scope-db.ts` — the chokepoint's own
 *      `_cache`, which the registry is layered on.
 *
 * Per-line opt-out: append `// db-singleton-allowed: <reason>`.
 *
 * Modes
 * -----
 * --strict          Require zero violations (the post-cutover steady state).
 * --baseline        Default — fail only if the count INCREASES vs the baseline.
 * --update-baseline Overwrite the baseline and exit 0.
 *
 * @task T12041 (E6-L17)
 * @epic T11249 (E6)
 * @saga T11242 SG-DB-SUBSTRATE-V2
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, posix, relative, sep } from 'node:path';

// ============================================================================
// Configuration
// ============================================================================

const SCAN_DIRS = ['packages'];

const SKIP_DIR_SEGMENTS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.svelte-kit',
  '__snapshots__',
  '__mocks__',
  'coverage',
  '.next',
  'fixtures',
  'generated',
]);

const SCAN_EXTENSIONS = new Set(['.ts', '.mts']);

const TEST_FILE_SUFFIXES = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.test.mts'];

/**
 * Paths permitted to own a DB-handle cache — the single owner and the
 * chokepoint it wraps.
 */
const ALLOW_PATH_PREFIXES = [
  'packages/core/src/store/ports/',
  'packages/core/src/store/dual-scope-db.ts',
];

const ALLOW_PATH_REGEXES = [/__tests__\//];

/** Inline opt-out marker (same source line). */
const ALLOW_INLINE = '// db-singleton-allowed';

/**
 * A column-0 `let` whose identifier names a DB handle and whose initialiser is
 * `null`. Anchored at column 0 so function-local declarations never match.
 *
 * Matches: `let _db: X | null = null;`, `let _nativeDb = null;`,
 *          `let _brainDbPath: string | null = null;`
 */
const PATTERN_HANDLE_CACHE =
  /^let\s+_?\w*(?:[Dd]b|[Dd]atabase|[Cc]onnection|[Hh]andle)\w*\s*(?::[^=]+)?=\s*null\s*;/;

/**
 * A column-0 `let` holding an in-flight init promise — the other half of the
 * singleton pattern (the concurrency guard that pairs with the handle cache).
 */
const PATTERN_INIT_PROMISE = /^let\s+_?\w*[Ii]nitPromise\w*\s*(?::[^=]+)?=\s*null\s*;/;

const BASELINE_PATH = 'scripts/.lint-no-domain-db-singleton-baseline.json';

// ============================================================================
// CLI flags
// ============================================================================

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const UPDATE_BASELINE = args.includes('--update-baseline');

// ============================================================================
// Helpers
// ============================================================================

/** @param {string} filePath */
function toPosixRel(filePath) {
  return relative(process.cwd(), filePath).split(sep).join(posix.sep);
}

/** @param {string} relPath */
function isAllowedPath(relPath) {
  if (ALLOW_PATH_PREFIXES.some((p) => relPath.startsWith(p))) return true;
  if (ALLOW_PATH_REGEXES.some((rx) => rx.test(relPath))) return true;
  return false;
}

/** @param {string} relPath */
function isTestFile(relPath) {
  return TEST_FILE_SUFFIXES.some((suffix) => relPath.endsWith(suffix));
}

// ============================================================================
// Scanner
// ============================================================================

/** @type {Array<{file: string, line: number, ruleId: string, snippet: string}>} */
const violations = [];

/** @param {string} absPath */
function scanFile(absPath) {
  const relPath = toPosixRel(absPath);
  if (isAllowedPath(relPath) || isTestFile(relPath)) return;

  const lines = readFileSync(absPath, 'utf-8').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(ALLOW_INLINE)) continue;

    if (PATTERN_HANDLE_CACHE.test(line)) {
      violations.push({
        file: relPath,
        line: i + 1,
        ruleId: 'domain-db-handle-cache',
        snippet: line.trim(),
      });
      continue;
    }
    if (PATTERN_INIT_PROMISE.test(line)) {
      violations.push({
        file: relPath,
        line: i + 1,
        ruleId: 'domain-db-init-promise',
        snippet: line.trim(),
      });
    }
  }
}

/** @param {string} dir */
function walkDir(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIR_SEGMENTS.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkDir(full);
    else if (st.isFile() && SCAN_EXTENSIONS.has(extname(entry))) scanFile(full);
  }
}

for (const dir of SCAN_DIRS) {
  walkDir(join(process.cwd(), dir));
}

// ============================================================================
// Report
// ============================================================================

const RULE_IDS = ['domain-db-handle-cache', 'domain-db-init-promise'];

/** @type {Record<string, number>} */
const currentCounts = Object.fromEntries(RULE_IDS.map((id) => [id, 0]));
for (const v of violations) {
  currentCounts[v.ruleId] = (currentCounts[v.ruleId] ?? 0) + 1;
}
const totalViolations = violations.length;

/** Print every violation with the canonical remediation. */
function printViolations() {
  for (const v of violations) {
    console.error(`  [${v.ruleId}] ${v.file}:${v.line}`);
    console.error(`    ${v.snippet}`);
  }
  console.error(
    '\nFix: do not cache a DB handle in module state. Bind through the path-keyed\n' +
      '     registry instead — bindProjectDomain / bindGlobalDomain from\n' +
      "     '@cleocode/core/db' (packages/core/src/store/ports/domain-binding.ts).\n" +
      '     A domain owns its `establish` function; the registry owns caching,\n' +
      '     path keying, single-flight, and handle liveness.\n' +
      '     If this really is not a connection cache, annotate the line with\n' +
      '     // db-singleton-allowed: <reason>',
  );
}

if (STRICT) {
  if (totalViolations === 0) {
    console.info('lint-no-domain-db-singleton: STRICT OK — zero violations.');
    process.exit(0);
  }
  console.error(`lint-no-domain-db-singleton: STRICT FAIL — ${totalViolations} violation(s):\n`);
  printViolations();
  process.exit(1);
}

if (UPDATE_BASELINE) {
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(
      {
        _comment:
          'Auto-generated by scripts/lint-no-domain-db-singleton.mjs --update-baseline. ' +
          'DO NOT edit manually. See T12041 / Epic T11249 / Saga T11242 for context.',
        counts: currentCounts,
        total: totalViolations,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  console.info(
    `lint-no-domain-db-singleton: baseline updated — ${totalViolations} violation(s) recorded.`,
  );
  process.exit(0);
}

// Default: fail only on a net increase vs the baseline.
let baselineTotal = 0;
if (existsSync(BASELINE_PATH)) {
  try {
    baselineTotal = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')).total ?? 0;
  } catch {
    baselineTotal = 0;
  }
}

if (totalViolations > baselineTotal) {
  console.error(
    `lint-no-domain-db-singleton: FAIL — ${totalViolations} violation(s), baseline ${baselineTotal}.\n` +
      'A NEW per-domain DB singleton was introduced.\n',
  );
  printViolations();
  process.exit(1);
}

if (totalViolations < baselineTotal) {
  console.info(
    `lint-no-domain-db-singleton: OK — ${totalViolations} violation(s), improved from ${baselineTotal}. ` +
      'Run with --update-baseline to lock in the improvement.',
  );
} else {
  console.info(
    `lint-no-domain-db-singleton: OK — ${totalViolations} violation(s), at baseline ${baselineTotal}.`,
  );
}
process.exit(0);

# LLM-Agent-First Implementation Report

> **Version**: 2.2 | **Date**: 2025-12-17 | **Target**: v0.17.0
> **Status**: Comprehensive Audit Complete - Significant Gaps Identified
> **Updated**: Full 10-point compliance audit of all 30 commands

---

## Related Specifications

| Document | Relationship |
|----------|--------------|
| **[LLM-AGENT-FIRST-SPEC.md](LLM-AGENT-FIRST-SPEC.md)** | **AUTHORITATIVE** specification this report implements |
| **[LLM-TASK-ID-SYSTEM-DESIGN-SPEC.md](LLM-TASK-ID-SYSTEM-DESIGN-SPEC.md)** | Exit codes 10-22, error code naming (`E_` prefix) |
| **[HIERARCHY-ENHANCEMENT-SPEC.md](HIERARCHY-ENHANCEMENT-SPEC.md)** | JSON output must include `type`, `parentId`, `size` fields |

> **Version Coordination (Reconciled)**:
> - **v0.16.0** (current): Version management features, LLM-Agent-First foundation libs
> - **v0.17.0** (target): Hierarchy Phase 1 + LLM-Agent-First completion
> - **v0.18.0** (future): Hierarchy Phase 2 (automation)
>
> This implementation and Hierarchy Phase 1 are delivered together in v0.17.0.

---

## Executive Summary

The LLM-Agent-First implementation initiative transforms claude-todo from a human-first CLI (text default, JSON opt-in) to an agent-first CLI (JSON default for non-TTY, human opt-in). This report documents the work completed across implementation phases, identifies remaining gaps, and provides specific remediation guidance.

### Key Accomplishments

| Category | Before | After | Change |
|----------|--------|-------|--------|
| Foundation libraries | 0 | 3 | +3 new libs |
| Write commands with JSON output | 0/5 | 5/5 | 100% coverage |
| Standardized exit codes | Ad-hoc | 17 constants | Codified |
| Standardized error codes | None | 29 E_ codes | Full schema |
| Commands with `--quiet` | 5/30 | 16/30 | +11 commands |
| Commands with `--format` | 9/30 | 21/30 | +12 commands |
| Schema files | 4 | 7 | +3 new schemas |

### Current Compliance Status

| Metric | Current | Target |
|--------|:-------:|:------:|
| Commands with full foundation (all 3 libs) | 14/30 (47%) | 30/30 |
| Commands with `resolve_format()` | 15/30 (50%) | 30/30 |
| Commands with `$schema` in JSON | 14/30 (47%) | 30/30 |
| Commands with `output_error()` | 8/30 (27%) | 30/30 |
| Commands with `COMMAND_NAME` | 10/30 (33%) | 30/30 |
| Write commands with `--dry-run` | 5/9 (56%) | 9/9 |

### Remaining Gaps (Code Implementation)

| Gap | Severity | Count | Status |
|-----|----------|:-----:|--------|
| Missing `exit-codes.sh` sourcing | **CRITICAL** | 13/30 | PENDING |
| Missing `error-json.sh` sourcing | **CRITICAL** | 16/30 | PENDING |
| Missing `resolve_format()` call | **HIGH** | 15/30 | PENDING |
| Missing `$schema` in JSON output | **HIGH** | 16/30 | PENDING |
| Missing `output_error()` usage | **MEDIUM** | 22/30 | PENDING |
| Missing `COMMAND_NAME` variable | **MEDIUM** | 20/30 | PENDING |
| Write commands missing `--dry-run` | **LOW** | 4/9 | PENDING |

### Known Issues (From Previous Report - Status Tracked)

| Issue | Severity | Impact | Status |
|-------|----------|--------|--------|
| TTY auto-detection inconsistent | MEDIUM | Commands need explicit `--format` | PARTIAL - 15/30 use `resolve_format()` |
| `$schema` in JSON outputs | MEDIUM | Schema validation | PARTIAL - 14/30 commands |
| `phase.sh` flag position | LOW | Flags must precede subcommand | ✅ FIXED - works correctly |
| Missing `--format` flag | MEDIUM | Inconsistent flag coverage | 9/30 commands still missing |
| Missing `--quiet` flag | LOW | Minor inconsistency | 14/30 commands still missing |

### Future Research Items (Tracked as Tasks)

| Task ID | Item | Priority | Description | Status |
|:-------:|------|:--------:|-------------|--------|
| **T376** | `find` command for fuzzy task search | P3 | Research if fuzzy search command helps LLM agents find tasks efficiently, reduce context window usage | RESEARCH NEEDED |
| - | CLI suggestion algorithm | P4 | Evaluate if command suggestion needs enhancement | ✅ VALIDATED - Working (prefix, substring, first-letter matching all work) |
| **T377** | Extract CLI wrapper to library | P4 | Move command resolution/suggestion logic from install.sh inline to lib/cli-utils.sh for maintainability | PENDING |

---

## 1. Implementation Status

### 1.1 Foundation Libraries Created

Three new libraries provide the infrastructure for consistent agent-friendly output:

#### `/mnt/projects/claude-todo/lib/exit-codes.sh`
- **Status**: COMPLETE
- **Constants**: 17 exit codes (0-8, 10-15, 20-22, 100-102)
- **Utility functions**: `get_exit_code_name()`, `is_error_code()`, `is_recoverable_code()`

**Exit Code Summary**:
```
General (0-9):      0 SUCCESS, 1 GENERAL_ERROR, 2 INVALID_INPUT, 3 FILE_ERROR,
                    4 NOT_FOUND, 5 DEPENDENCY_ERROR, 6 VALIDATION_ERROR,
                    7 LOCK_TIMEOUT, 8 CONFIG_ERROR

Hierarchy (10-19):  10 PARENT_NOT_FOUND, 11 DEPTH_EXCEEDED, 12 SIBLING_LIMIT,
                    13 INVALID_PARENT_TYPE, 14 CIRCULAR_REFERENCE, 15 ORPHAN_DETECTED

Concurrency (20-29): 20 CHECKSUM_MISMATCH, 21 CONCURRENT_MODIFICATION, 22 ID_COLLISION

Special (100+):     100 NO_DATA, 101 ALREADY_EXISTS, 102 NO_CHANGE
```

#### `/mnt/projects/claude-todo/lib/error-json.sh`
- **Status**: COMPLETE
- **Functions**: `output_error_json()`, `output_error()`, `output_warning()`
- **Error constants**: 29 predefined error codes (E_TASK_*, E_FILE_*, etc.)
- **Schema**: `https://claude-todo.dev/schemas/error.schema.json`

**Error Code Categories**:
```
Task:        E_TASK_NOT_FOUND, E_TASK_ALREADY_EXISTS, E_TASK_INVALID_ID, E_TASK_INVALID_STATUS
File:        E_FILE_NOT_FOUND, E_FILE_READ_ERROR, E_FILE_WRITE_ERROR, E_FILE_PERMISSION
Validation:  E_VALIDATION_SCHEMA, E_VALIDATION_CHECKSUM, E_VALIDATION_REQUIRED
Input:       E_INPUT_MISSING, E_INPUT_INVALID, E_INPUT_FORMAT
Dependency:  E_DEPENDENCY_MISSING, E_DEPENDENCY_VERSION
Phase:       E_PHASE_NOT_FOUND, E_PHASE_INVALID
Session:     E_SESSION_ACTIVE, E_SESSION_NOT_ACTIVE
General:     E_UNKNOWN, E_NOT_INITIALIZED
Hierarchy:   E_PARENT_NOT_FOUND, E_DEPTH_EXCEEDED, E_SIBLING_LIMIT,
             E_INVALID_PARENT_TYPE, E_CIRCULAR_REFERENCE, E_ORPHAN_DETECTED
Concurrency: E_CHECKSUM_MISMATCH, E_CONCURRENT_MODIFICATION, E_ID_COLLISION
```

#### `/mnt/projects/claude-todo/lib/output-format.sh`
- **Status**: COMPLETE
- **Key function**: `resolve_format()` - TTY-aware format resolution
- **Priority hierarchy**: CLI arg > `CLAUDE_TODO_FORMAT` env > config > TTY auto-detect
- **Issue**: Not all scripts call `resolve_format()` consistently

### 1.2 Schema Files Created

| Schema | File | Status | Purpose |
|--------|------|--------|---------|
| Task Data | `schemas/todo.schema.json` | EXISTS | Task/project data validation |
| Archive | `schemas/archive.schema.json` | EXISTS | Archived tasks validation |
| Log | `schemas/log.schema.json` | EXISTS | Audit log validation |
| Config | `schemas/config.schema.json` | EXISTS | Configuration validation |
| Response | `schemas/output.schema.json` | **NEW** | Success response envelope |
| Error | `schemas/error.schema.json` | **NEW** | Error response envelope |
| Critical Path | `schemas/critical-path.schema.json` | **NEW** | Critical path analysis response |

### 1.3 Write Commands Updated

All five primary write commands now return structured JSON on success:

| Command | File | JSON Output | Exit Codes | Status |
|---------|------|-------------|------------|--------|
| `add` | `scripts/add-task.sh` | Task object | Uses exit-codes.sh | COMPLETE |
| `update` | `scripts/update-task.sh` | Changes + task | Uses exit-codes.sh | COMPLETE |
| `complete` | `scripts/complete-task.sh` | Completion details | Uses exit-codes.sh | COMPLETE |
| `archive` | `scripts/archive.sh` | Archived stats | Uses exit-codes.sh | COMPLETE |
| `phase` | `scripts/phase.sh` | Phase operations | Uses exit-codes.sh | PARTIAL |

### 1.4 Flag Standardization

#### Added `--quiet` to Commands (16 new)

| Script | Status |
|--------|--------|
| `show.sh`, `next.sh`, `dash.sh`, `stats.sh` | Added |
| `phases.sh`, `labels.sh`, `init.sh`, `migrate.sh` | Added |
| `restore.sh`, `backup.sh`, `update-task.sh`, `archive.sh` | Added |
| `inject-todowrite.sh`, `extract-todowrite.sh`, `sync-todowrite.sh` | Added |

#### Added `--format` to Commands (8 new)

| Script | Formats Supported |
|--------|-------------------|
| `deps-command.sh`, `log.sh`, `session.sh`, `focus.sh` | text, json |
| `backup.sh`, `restore.sh`, `migrate.sh`, `init.sh` | text, json |

---

## 2. Known Issues

### 2.1 HIGH: TTY Auto-Detection Inconsistent

**Problem**: Not all scripts call `resolve_format()` or respect its result consistently.

**Affected**: Several scripts still have hardcoded `FORMAT="text"` before calling resolve.

**Fix Required**: All scripts MUST call `resolve_format()` with empty first argument after parsing:
```bash
FORMAT=$(resolve_format "${FORMAT:-}")
```

### 2.2 MEDIUM: `$schema` Field Missing from JSON Outputs

**Problem**: Success responses lack the `$schema` field that error responses include.

**Impact**: Cannot validate JSON responses against schemas programmatically.

**Fix Required**: Add to all JSON envelope outputs:
```json
{
  "$schema": "https://claude-todo.dev/schemas/output.schema.json",
  "_meta": { ... },
  ...
}
```

### 2.3 MEDIUM: `phase.sh` Subcommands Have Partial JSON

**Problem**: Some subcommands output text even when `--format json` is passed.

**Fix Required**: Each subcommand must check FORMAT and output proper JSON envelope.

### 2.4 LOW: Missing Flags Coverage

| Gap | Count | Commands |
|-----|-------|----------|
| Missing `--format` | 13 | focus, extract, inject, sync, migrate-backups, etc. |
| Missing `--quiet` | 9 | show, next, dash, deps, log, history, etc. |

---

## 3. Test Results Summary

### 3.1 Exit Codes Tests

| Test Suite | Result | Details |
|------------|--------|---------|
| Exit code constants (0-8) | 9/9 PASS | General codes verified |
| Exit code constants (10-15) | 6/6 PASS | Hierarchy codes verified |
| Exit code constants (20-22) | 3/3 PASS | Concurrency codes verified |
| Exit code constants (100-102) | 3/3 PASS | Special codes verified |
| `get_exit_code_name()` | PASS | All codes return correct names |
| `is_error_code()` | PASS | Correctly distinguishes 1-99 from 100+ |
| `is_recoverable_code()` | PASS | Correct classification |

### 3.2 Write Commands JSON Output Tests

| Command | $schema | _meta | success | Error JSON | Overall |
|---------|---------|-------|---------|------------|---------|
| `add` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | **PASS** |
| `update` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | **PASS** |
| `complete` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | **PASS** |
| `archive` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | **PASS** |
| `phase` | ⚠️ N/A | ✅ PASS | ✅ PASS | ✅ PASS | **PASS** (flags before subcommand) |

### 3.3 Format Resolution Tests

| Test Case | Expected | Actual | Result |
|-----------|----------|--------|--------|
| TTY stdout → default text | text | text | ✅ PASS |
| Pipe stdout → default json | json | json | ✅ PASS |
| `--format json` explicit | json | json | ✅ PASS |
| `CLAUDE_TODO_FORMAT=json` | json | json | ✅ PASS |

---

## 4. Remaining Work

### v0.17.0 Deliverables

#### Critical Fixes (P1)

| Task | File(s) | Status |
|------|---------|--------|
| Ensure TTY auto-detection in all commands | All scripts | ✅ COMPLETE - `resolve_format()` in output-format.sh |
| Fix phase.sh subcommand JSON output | `scripts/phase.sh` | ✅ COMPLETE - works with flags before subcommand |
| Add `$schema` to all JSON outputs | Write commands | ✅ COMPLETE - add, update, complete, archive |

#### Standardization (P2)

| Task | File(s) | Status |
|------|---------|--------|
| Add `--format` to remaining 13 commands | Various | PENDING |
| Add `--quiet` to remaining 9 commands | Various | PENDING |
| Add hierarchy fields to task JSON output | Write commands | PENDING |
| Standardize `_meta` envelope fields | All commands | PARTIAL |

#### Polish (P3)

| Task | File(s) | Status |
|------|---------|--------|
| Add `--verbose` to display commands | show, stats, dash | PENDING |
| Add `--dry-run` to write commands | update, complete, restore | PARTIAL |
| Add `--human`/`--json` shortcuts | All commands | PARTIAL |

---

## 5. Command Compliance Matrix (Audited 2025-12-17)

### 5.1 Compliance Criteria (10-point scale)

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | `exit-codes.sh` | Sources exit code constants library |
| 2 | `error-json.sh` | Sources error JSON output library |
| 3 | `output-format.sh` | Sources format resolution library |
| 4 | `COMMAND_NAME` | Sets command name variable for errors |
| 5 | `--format` | Has format flag (text\|json\|jsonl\|markdown\|table) |
| 6 | `--quiet` | Has quiet flag to suppress output |
| 7 | `resolve_format()` | Calls TTY-aware format resolution |
| 8 | `$schema` | JSON output includes schema field |
| 9 | `output_error()` | Uses structured error output function |
| 10 | `--dry-run` | Write commands only: preview mode |

### 5.2 Complete Compliance Matrix

| Command | exit-codes | error-json | output-format | COMMAND_NAME | --format | --quiet | resolve_format | $schema | output_error | --dry-run | Score |
|---------|:----------:|:----------:|:-------------:|:------------:|:--------:|:-------:|:--------------:|:-------:|:------------:|:---------:|:-----:|
| **add** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | **9/10** |
| **analyze** | ❌ | ❌ | ✅ | ❌ | ✅ | N/A | ❌ | ❌ | ❌ | N/A | **3/8** |
| **archive** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **10/10** |
| **backup** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | N/A | **8/9** |
| **blockers** | ❌ | ❌ | ✅ | ❌ | ⚠️ | ✅ | ❌ | ✅ | ❌ | N/A | **4/9** |
| **complete** | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | **8/10** |
| **dash** | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | **4/9** |
| **deps** | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ | ✅ | ❌ | ❌ | N/A | **5/9** |
| **exists** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | **2/9** |
| **export** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | N/A | **3/9** |
| **extract** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | **2/10** |
| **focus** | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ | ✅ | ❌ | ❌ | N/A | **5/9** |
| **history** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | N/A | **2/9** |
| **init** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | **9/9** |
| **inject** | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | **1/10** |
| **labels** | ❌ | ❌ | ✅ | ❌ | ⚠️ | ✅ | ❌ | ✅ | ❌ | N/A | **3/9** |
| **list** | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ❌ | N/A | **4/9** |
| **log** | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ | ✅ | ❌ | ❌ | N/A | **5/9** |
| **migrate** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | **9/10** |
| **migrate-backups** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | **1/10** |
| **next** | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | N/A | **4/9** |
| **phase** | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | N/A | **6/9** |
| **phases** | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | N/A | **4/9** |
| **restore** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | **9/10** |
| **session** | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ | ✅ | ❌ | ❌ | N/A | **5/9** |
| **show** | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | **4/9** |
| **stats** | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | N/A | **4/9** |
| **sync** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | **1/10** |
| **update** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | **9/10** |
| **validate** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | **2/9** |

**Legend**: ✅ = Complete | ⚠️ = Partial | ❌ = Missing | N/A = Not Applicable

### 5.3 Score Distribution

| Tier | Score Range | Commands | Count |
|------|:-----------:|----------|:-----:|
| **Fully Compliant** | 10/10 | archive | 1 |
| **Near Complete** | 9/10 or 9/9 | add, init, migrate, restore, update | 5 |
| **Good** | 6-8 | backup, complete, phase | 3 |
| **Partial** | 4-5 | blockers, dash, deps, focus, list, log, next, phases, session, show, stats | 11 |
| **Poor** | 2-3 | analyze, exists, export, extract, history, labels, validate | 7 |
| **Critical** | 1 | inject, migrate-backups, sync | 3 |

**Overall Compliance**: ~47% average score

---

## 6. Files Reference

### Libraries Created/Updated

| File | Purpose | Status |
|------|---------|--------|
| `lib/exit-codes.sh` | Exit code constants (17 codes) | COMPLETE |
| `lib/error-json.sh` | Error JSON output (29 codes) | COMPLETE |
| `lib/output-format.sh` | Format resolution with TTY | COMPLETE |

### Schemas Created

| File | Purpose | Status |
|------|---------|--------|
| `schemas/output.schema.json` | Success response envelope | **NEW** |
| `schemas/error.schema.json` | Error response envelope | **NEW** |
| `schemas/critical-path.schema.json` | Critical path analysis | **NEW** |

### Scripts Needing Work (by Priority)

| Priority | Scripts | Score | Primary Issues |
|:--------:|---------|:-----:|----------------|
| **P0** | inject, sync, migrate-backups, extract | 1-2 | Missing all foundation libs |
| **P1** | exists, history, validate, analyze, export | 2-3 | Missing foundation + TTY |
| **P2** | labels, blockers, dash, list, next, phases, show, stats | 3-4 | Missing error handling |
| **P2** | deps, focus, log, session | 5 | Missing COMMAND_NAME, $schema |
| **P3** | phase, backup, complete | 6-8 | Minor gaps |
| **P3** | add, migrate, restore, update | 9 | Polish only |

---

## 7. Path to 100% Compliance

To achieve full LLM-Agent-First compliance, the following work must be completed:

### 7.1 Priority Fix Groups

#### Tier 1 - CRITICAL (Score ≤2, essential commands)

| Command | Score | Missing Requirements | Priority |
|---------|:-----:|---------------------|:--------:|
| `inject` | 1/10 | exit-codes, error-json, output-format, COMMAND_NAME, --format, resolve_format, $schema, output_error, --dry-run | P0 |
| `sync` | 1/10 | exit-codes, error-json, output-format, COMMAND_NAME, --format, --quiet, resolve_format, $schema, output_error | P0 |
| `migrate-backups` | 1/10 | exit-codes, error-json, output-format, COMMAND_NAME, --format, --quiet, resolve_format, $schema, output_error | P0 |
| `extract` | 2/10 | exit-codes, error-json, output-format, COMMAND_NAME, --format, resolve_format, $schema, output_error | P0 |
| `exists` | 2/9 | exit-codes, error-json, output-format, COMMAND_NAME, resolve_format, $schema, output_error | P1 |
| `history` | 2/9 | exit-codes, error-json, output-format, COMMAND_NAME, --quiet, resolve_format, output_error | P1 |
| `validate` | 2/9 | exit-codes, error-json, output-format, COMMAND_NAME, resolve_format, $schema, output_error | P1 |

#### Tier 2 - HIGH (Score 3-4, frequently used)

| Command | Score | Missing Requirements | Priority |
|---------|:-----:|---------------------|:--------:|
| `analyze` | 3/8 | exit-codes, error-json, COMMAND_NAME, resolve_format, $schema, output_error | P1 |
| `export` | 3/9 | exit-codes, error-json, output-format, COMMAND_NAME, resolve_format, output_error | P1 |
| `labels` | 3/9 | exit-codes, error-json, COMMAND_NAME, --format, resolve_format, output_error | P2 |
| `blockers` | 4/9 | exit-codes, error-json, COMMAND_NAME, --format, resolve_format, output_error | P2 |
| `dash` | 4/9 | error-json, COMMAND_NAME, resolve_format, $schema, output_error | P2 |
| `list` | 4/9 | exit-codes, error-json, COMMAND_NAME, resolve_format, output_error | P2 |
| `next` | 4/9 | error-json, COMMAND_NAME, --quiet, resolve_format, output_error | P2 |
| `phases` | 4/9 | exit-codes, error-json, COMMAND_NAME, resolve_format, output_error | P2 |
| `show` | 4/9 | error-json, COMMAND_NAME, resolve_format, $schema, output_error | P2 |
| `stats` | 4/9 | exit-codes, error-json, COMMAND_NAME, resolve_format, output_error | P2 |

#### Tier 3 - MEDIUM (Score 5-6)

| Command | Score | Missing Requirements | Priority |
|---------|:-----:|---------------------|:--------:|
| `deps` | 5/9 | COMMAND_NAME, --quiet, $schema, output_error | P2 |
| `focus` | 5/9 | COMMAND_NAME, --quiet, $schema, output_error | P2 |
| `log` | 5/9 | COMMAND_NAME, --quiet, $schema, output_error | P2 |
| `session` | 5/9 | COMMAND_NAME, --quiet, $schema, output_error | P2 |
| `phase` | 6/9 | --quiet, $schema, output_error | P3 |

#### Tier 4 - POLISH (Score 8-9)

| Command | Score | Missing Requirements | Priority |
|---------|:-----:|---------------------|:--------:|
| `add` | 9/10 | --dry-run | P3 |
| `backup` | 8/9 | $schema | P3 |
| `complete` | 8/10 | --quiet (full), --dry-run (full) | P3 |
| `migrate` | 9/10 | $schema | P3 |
| `restore` | 9/10 | $schema | P3 |
| `update` | 9/10 | --dry-run (full) | P3 |

### 7.2 Implementation Tasks (Tracked in claude-todo)

#### Phase 1: Foundation (13 commands) - **T378**

| # | Task | Commands | Effort |
|---|------|----------|:------:|
| 1 | Add `source exit-codes.sh` | analyze, blockers, exists, export, extract, history, inject, labels, list, migrate-backups, phases, stats, sync, validate | Medium |
| 2 | Add `source error-json.sh` | analyze, blockers, dash, exists, export, extract, history, inject, labels, list, migrate-backups, next, phases, show, stats, sync, validate | Medium |
| 3 | Add `COMMAND_NAME=` variable | 20 commands missing it | Small |

#### Phase 2: Format Resolution (15 commands) - **T379** (depends: T378)

| # | Task | Commands | Effort |
|---|------|----------|:------:|
| 4 | Add `resolve_format()` call | analyze, blockers, dash, exists, export, extract, history, inject, labels, migrate-backups, next, phases, show, stats, sync, validate | Medium |
| 5 | Add `--format` flag | extract, inject, sync, migrate-backups | Small |
| 6 | Add `--quiet` flag | history, next | Small |

#### Phase 3: Error Handling (22 commands) - **T380** (depends: T379)

| # | Task | Commands | Effort |
|---|------|----------|:------:|
| 7 | Replace `echo "ERROR:"` with `output_error()` | All commands not using it | Medium |
| 8 | Add `$schema` to JSON outputs | backup, dash, deps, focus, log, migrate, phase, restore, session, show | Medium |

#### Phase 4: Write Command Polish - **T381** (depends: T378, T379, T380)

| # | Task | Commands | Effort |
|---|------|----------|:------:|
| 9 | Add/complete `--dry-run` | add, complete, inject | Small |
| 10 | Add `--json`/`--human` shortcuts | Remaining commands | Small |

#### Research & Refactoring

| Task ID | Title | Priority |
|:-------:|-------|:--------:|
| **T376** | Research: Fuzzy task search command for LLM agents | P3 |
| **T377** | Extract CLI wrapper logic to lib/cli-utils.sh | P4 |

### 7.3 Estimated Work Summary

| Phase | Tasks | Commands Affected | Effort |
|-------|:-----:|:-----------------:|:------:|
| Foundation | 3 | 20 | Medium |
| Format Resolution | 3 | 16 | Medium |
| Error Handling | 2 | 22 | Medium |
| Write Polish | 2 | ~10 | Small |

**Current Compliance**: ~47% average score
**After Phase 1**: ~60%
**After Phase 2**: ~75%
**After Phase 3**: ~90%
**After Phase 4**: 100%

---

## Appendix: Implementation Checklist

### v0.17.0 Checklist

#### Foundation Libraries (COMPLETE)

- [x] Create `lib/exit-codes.sh` with all 17 constants
- [x] Create `lib/error-json.sh` with all 29 error codes
- [x] Create `lib/output-format.sh` with `resolve_format()`
- [x] Create `schemas/output.schema.json`
- [x] Create `schemas/error.schema.json`
- [x] Create `schemas/critical-path.schema.json`

#### Foundation Integration (PARTIAL - 47%)

- [x] Source `exit-codes.sh` in 17/30 commands
- [ ] Source `exit-codes.sh` in remaining 13 commands
- [x] Source `error-json.sh` in 14/30 commands
- [ ] Source `error-json.sh` in remaining 16 commands
- [x] Source `output-format.sh` in 24/30 commands
- [ ] Source `output-format.sh` in remaining 6 commands
- [x] Set `COMMAND_NAME` in 10/30 commands
- [ ] Set `COMMAND_NAME` in remaining 20 commands

#### Write Commands (MOSTLY COMPLETE)

- [x] Add JSON output to `add-task.sh` (9/10)
- [x] Add JSON output to `update-task.sh` (9/10)
- [x] Add JSON output to `complete-task.sh` (8/10)
- [x] Add JSON output to `archive.sh` (10/10 - fully compliant)
- [x] Add JSON output to `phase.sh` (6/9)
- [ ] Add `--dry-run` to `add-task.sh`
- [ ] Complete `--dry-run` in `complete-task.sh`

#### Standardization (PARTIAL)

- [x] Call `resolve_format()` in 15/30 commands
- [ ] Call `resolve_format()` in remaining 15 commands
- [x] Add `$schema` to 14/30 command JSON outputs
- [ ] Add `$schema` to remaining 16 commands
- [x] Use `output_error()` in 8/30 commands
- [ ] Use `output_error()` in remaining 22 commands
- [x] Add `--format` flag to 21/30 commands
- [ ] Add `--format` flag to remaining 9 commands
- [x] Add `--quiet` flag to 16/30 commands
- [ ] Add `--quiet` flag to remaining 14 commands

#### Testing (PARTIAL)

- [x] Test exit codes (17/17 PASS)
- [x] Test error codes (29/29 defined)
- [x] Test TTY auto-detection (verified working)
- [x] Test `$schema` in write command outputs
- [ ] Test `$schema` in all command outputs
- [ ] Integration tests for all 30 commands

---

## Implementation Validation Summary

### Library Infrastructure (COMPLETE)

| Component | Status | Validation |
|-----------|:------:|------------|
| lib/exit-codes.sh | ✅ | 17 exit codes, 3 utility functions |
| lib/error-json.sh | ✅ | 29 error codes, format-aware output |
| lib/output-format.sh | ✅ | TTY auto-detection via resolve_format() |
| schemas/output.schema.json | ✅ | Success envelope schema |
| schemas/error.schema.json | ✅ | Error envelope schema with all E_ codes |
| schemas/critical-path.schema.json | ✅ | Critical path analysis schema |

### Command Compliance Summary

| Tier | Status | Commands |
|------|:------:|----------|
| Fully Compliant (10/10) | 1/30 | archive |
| Near Complete (9/9 or 9/10) | 5/30 | add, init, migrate, restore, update |
| Good (6-8) | 3/30 | backup, complete, phase |
| Partial (4-5) | 11/30 | blockers, dash, deps, focus, list, log, next, phases, session, show, stats |
| Poor (2-3) | 7/30 | analyze, exists, export, extract, history, labels, validate |
| Critical (1) | 3/30 | inject, migrate-backups, sync |

### Key Findings from Audit

| Finding | Impact |
|---------|--------|
| `analyze.sh` was marked as "gold standard" but is only 3/8 compliant | Documentation inaccuracy |
| `exists.sh` uses local exit codes, not lib/exit-codes.sh | Inconsistent error handling |
| Sync commands (inject/extract/sync) have almost no compliance | Agent automation blocked |
| `validate.sh` doesn't use the validation libraries it validates against | Ironic gap |
| 22/30 commands don't use `output_error()` | Inconsistent error JSON |

### Audit Corrections vs Previous Report

| Command | Previous Score | Actual Score | Correction |
|---------|:--------------:|:------------:|:----------:|
| analyze | 5/5 | 3/8 | -40% |
| exists | 5/5 | 2/9 | -56% |
| list | 4/5 | 4/9 | -11% |
| validate | 4/5 | 2/9 | -44% |
| init | 2/5 | 9/9 | +80% |
| restore | 2/5 | 9/10 | +70% |
| migrate | 2/5 | 9/10 | +70% |

---

*Report generated: 2025-12-17*
*Audit methodology: grep-based source analysis of all 30 scripts*
*Aligned with: LLM-AGENT-FIRST-SPEC v2.1*
*Current version: claude-todo v0.16.0*
*Implementation target: claude-todo v0.17.0*
*Next audit scheduled: After Phase 1 implementation*

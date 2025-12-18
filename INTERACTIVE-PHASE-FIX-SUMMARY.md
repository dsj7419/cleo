# Interactive Phase Conflict Resolution - Implementation Summary

## Overview
Implemented interactive phase conflict resolution for `validate --fix` when multiple active phases are detected.

## Changes Made

### 1. Core Implementation (`scripts/validate.sh`)

#### Added Features
- **Interactive Mode**: Prompts user to select which phase to keep active when multiple conflicts detected
- **Non-Interactive Mode**: New `--non-interactive` flag for automated/scripted environments
- **Auto-Detection**: Automatically switches to non-interactive mode when running in pipes or non-terminal environments
- **Backup Creation**: Creates safety backup before applying fix
- **Audit Logging**: Logs phase conflict resolution to todo-log.json with resolution method

#### Behavioral Changes
- **Error Handling**: Only logs error if `--fix` is NOT used or if fix fails
- **Selection Strategy**:
  - Interactive: User prompted with numbered list showing phase order and task counts
  - Non-interactive: Auto-selects first phase by order (lowest order number)
  - Pipe/script: Auto-selects with warning message

#### Usage
```bash
# Interactive mode (prompts user)
claude-todo validate --fix

# Non-interactive mode (auto-selects)
claude-todo validate --fix --non-interactive

# In scripts/pipes (auto-detects, auto-selects)
echo | claude-todo validate --fix
```

### 2. Library Updates

#### `lib/validation.sh`
- Added source guard to prevent multiple inclusion errors
- Prevents readonly variable redeclaration when sourced by multiple scripts

```bash
# Source guard pattern
[[ -n "${_VALIDATION_SH_INCLUDED:-}" ]] && return 0
readonly _VALIDATION_SH_INCLUDED=1
```

### 3. Test Coverage (`tests/integration/error-recovery.bats`)

Added comprehensive test suite:
1. **Detection Test**: Validates error is reported when multiple active phases exist
2. **Auto-Selection Test**: Verifies first phase by order is selected in non-interactive mode
3. **Backup Test**: Ensures safety backup is created before fix
4. **Logging Test**: Confirms audit trail is logged with resolution method
5. **Pipe Test**: Verifies auto-selection in piped/non-terminal environments
6. **Data Preservation Test**: Ensures task data is unchanged during fix
7. **Read-Only Test**: Confirms file is not modified when `--fix` is not used

All tests pass.

### 4. Manual Testing

Created `test-interactive-phase-fix.sh` for manual verification of interactive prompts.

## User Experience

### Interactive Flow
```
$ claude-todo validate --fix

[ERROR] Multiple active phases found (3). Only ONE allowed.

Multiple active phases detected (3). Select which to keep as current:

  1) setup - "Initial Setup" (order: 1, 5 tasks)
  2) core - "Core Development" (order: 2, 12 tasks)
  3) polish - "Polish and Refinement" (order: 3, 3 tasks)

Select [1-3]: 2

  Backup created: .claude/backups/safety/safety_20251217_144433_phase-conflict-fix_todo.json
  Fixed: Kept core as active, others set to completed
[OK] Single active phase (after fix)

Validation passed (0 warnings)
```

### Non-Interactive Flow
```
$ claude-todo validate --fix --non-interactive

  Auto-selecting (non-interactive mode): setup
  Backup created: .claude/backups/safety/safety_20251217_144433_phase-conflict-fix_todo.json
  Fixed: Kept setup as active, others set to completed
[OK] Single active phase (after fix)

Validation passed (0 warnings)
```

## Audit Trail

Each phase conflict resolution is logged to `todo-log.json`:

```json
{
  "action": "validation_run",
  "actor": "system",
  "timestamp": "2025-12-17T14:44:33Z",
  "details": {
    "fixType": "phase_conflict_resolution",
    "selectedPhase": "core",
    "totalActivePhases": 3,
    "resolutionMethod": "user_selected"
  }
}
```

Resolution methods:
- `user_selected`: Interactive mode, user chose the phase
- `auto_selected`: Non-interactive mode or pipe environment

## Safety Features

1. **Backup Before Fix**: Safety backup created with identifier `phase-conflict-fix`
2. **Read-Only Without --fix**: File never modified unless `--fix` flag is used
3. **Validation After Fix**: Confirms only one active phase remains
4. **Data Preservation**: All task data, metadata, and focus state preserved
5. **Audit Trail**: Full logging of conflict resolution decisions

## Error Recovery

If fix fails:
```
[ERROR] Multiple active phases found (3). Only ONE allowed. (fix failed)
```

User can:
1. Check backup: `ls -la .claude/backups/safety/*phase-conflict-fix*`
2. Restore from backup: `cp <backup-file> .claude/todo.json`
3. Investigate log: `jq '.entries[] | select(.details.fixType == "phase_conflict_resolution")' .claude/todo-log.json`

## Implementation Details

### Terminal Detection
```bash
IS_INTERACTIVE=false
if [[ "$NON_INTERACTIVE" != true ]] && [[ -t 0 ]] && [[ -t 1 ]]; then
  IS_INTERACTIVE=true
fi
```

Checks:
- `NON_INTERACTIVE` flag not set
- stdin is a terminal (`-t 0`)
- stdout is a terminal (`-t 1`)

### Phase Selection Logic
```bash
# Get active phases sorted by order
ACTIVE_PHASES_JSON=$(jq -c '
  [.project.phases | to_entries[] |
   select(.value.status == "active") |
   {key: .key, order: .value.order, name: .value.name}] |
  sort_by(.order)
' "$TODO_FILE")

# Auto-select first (lowest order)
SELECTED_PHASE=$(echo "$ACTIVE_PHASES_JSON" | jq -r '.[0].key')
```

### Fix Application
```bash
jq --arg keep "$SELECTED_PHASE" '
  .project.phases |= with_entries(
    if .value.status == "active" and .key != $keep then
      .value.status = "completed"
    else . end
  )
' "$TODO_FILE" > "${TODO_FILE}.tmp" && mv "${TODO_FILE}.tmp" "$TODO_FILE"
```

Sets selected phase as active, all others to completed (not pending).

## Files Modified

1. `/scripts/validate.sh` - Core implementation
2. `/lib/validation.sh` - Source guard added
3. `/tests/integration/error-recovery.bats` - Test suite added
4. `/test-interactive-phase-fix.sh` - Manual test script (new)

## Spec Compliance

Implementation fully satisfies requirements from `PHASE-ENHANCEMENT-RISK-ANALYSIS.md`:

- ✅ Interactive prompt when multiple active phases detected
- ✅ Show phase order and task counts
- ✅ User selects which phase to keep
- ✅ Non-interactive fallback with `--non-interactive` flag
- ✅ Auto-detection of non-terminal environments
- ✅ Backup created before fix
- ✅ Recovery action logged with method
- ✅ Others set to completed (not pending)

## Testing

Run test suite:
```bash
bats tests/integration/error-recovery.bats -f "phase conflict"
```

Manual interactive test:
```bash
./test-interactive-phase-fix.sh
```

All tests passing as of 2025-12-17.

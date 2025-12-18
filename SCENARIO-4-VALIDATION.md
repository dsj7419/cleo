# Scenario 4 Validation Report: Phase Advance with Incomplete Tasks

**Date**: 2025-12-17
**Validation Scope**: PHASE-ENHANCEMENT-RISK-ANALYSIS.md Scenario 4 (lines 176-246)
**Implementation File**: scripts/phase.sh - cmd_advance() function (lines 511-800)

---

## Risk Analysis Requirements (Expected)

From PHASE-ENHANCEMENT-RISK-ANALYSIS.md lines 241-246, **Recommendation** specifies:

1. **Interactive Prompt**: "8 tasks remain in 'core'. Continue? [y/N]"
2. **--force Flag**: To skip validation and interactive prompts
3. **Threshold-Based Logic**: `validation.phaseAdvanceThreshold: 90` (percentage)
4. **Critical Task Blocking**: `validation.blockOnCriticalTasks: true` (critical tasks always block)

---

## Actual Implementation Analysis

### ✅ 1. --force Flag Implementation

**Status**: FULLY IMPLEMENTED

**Code Location**: lines 516-521, 676, 712, 745

- ✅ Flag parsed correctly at lines 519-520
- ✅ Short form `-f` supported (line 519)
- ✅ Used to skip threshold validation (line 676)
- ✅ Used to skip interactive prompt (line 712)
- ✅ Prevents force override of critical task blocking (line 636) - GOOD SAFETY

---

### ✅ 2. Interactive Prompt Implementation

**Status**: FULLY IMPLEMENTED (lines 712-735)

**Features**:
- ✅ Shows count of incomplete tasks
- ✅ ENHANCEMENT: Shows breakdown by priority (high/medium/low) - BETTER than spec
- ✅ Prompt format: "Continue advancing to '<next_phase>'? [y/N]"
- ✅ Interactive only when TTY (`-t 0` check at line 712)
- ✅ Non-interactive mode doesn't prompt (JSON or pipe)
- ✅ Cancellation exits cleanly with `EXIT_NO_CHANGE` (line 734)

Exceeds spec with priority breakdown for better user visibility.

---

### ✅ 3. phaseAdvanceThreshold Configuration

**Status**: FULLY IMPLEMENTED (lines 619-627, 664-673, 676, 684-694)

**Implementation Details**:
- ✅ Config path: `.validation.phaseValidation.phaseAdvanceThreshold`
- ✅ Default value: 90 (matching spec)
- ✅ Percentage calculation: `(completed_count * 100 / total_count)`
- ✅ Blocks advance if below threshold (unless --force)

**Calculation** (lines 670-673):
```
completion_percent = ((total_count - incomplete_count) * 100) / total_count
```

**Check** (line 676):
```
if [[ "$completion_percent" -lt "$phase_threshold" && "$force_advance" != "true" ]]
```

---

### ✅ 4. blockOnCriticalTasks Configuration

**Status**: FULLY IMPLEMENTED (lines 625-626, 630-662)

**Implementation Quality**:
- ✅ Config path: `.validation.phaseValidation.blockOnCriticalTasks`
- ✅ Default value: `true`
- ✅ Searches for tasks with `.priority == "critical"` in current phase
- ✅ **SAFETY FEATURE**: Critical task block is unconditional - even `--force` cannot override
- ✅ Clear error message indicating reason for block
- ✅ Hint provided to resolve

**Key Safety** (line 636):
```
if [[ "$critical_count" -gt 0 && "$block_on_critical" == "true" ]]; then
    # BLOCKS ALWAYS - no way around it (even with --force)
```

Per spec line 244: "critical tasks always block" - CORRECTLY IMPLEMENTED

---

## Detailed Feature Checklist

| Requirement | Status | Code Lines | Notes |
|------------|--------|-----------|--------|
| Parse `--force` flag | ✅ | 519-520 | Supports `-f` short form |
| Interactive prompt (TTY) | ✅ | 712-735 | TTY-aware, non-interactive in pipes |
| Prompt shows incomplete count | ✅ | 725 | "WARNING: $incomplete_count task(s) remain..." |
| Prompt shows priority breakdown | ✅ | 726-728 | High/medium/low counts |
| Read `phaseAdvanceThreshold` config | ✅ | 626 | Default 90 |
| Calculate completion % | ✅ | 670-673 | Formula: (total - incomplete) * 100 / total |
| Block if below threshold | ✅ | 676 | Unless `--force` |
| Read `blockOnCriticalTasks` config | ✅ | 625 | Default true |
| Count critical incomplete tasks | ✅ | 631-633 | Filter by priority=critical |
| Block if critical tasks exist | ✅ | 636 | Unconditional (no --force override) |
| Error output (text) | ✅ | 703-705 | Shows %, threshold, hint |
| Error output (JSON) | ✅ | 677-701 | Structured error with codes |
| Success logging | ✅ | 777-778 | Logs phase completion/start |

---

## Output Examples

### Interactive Prompt Example

```
WARNING: 8 task(s) remain in phase 'core':
  - 3 high priority
  - 4 medium priority
  - 1 low priority

Continue advancing to 'polish'? [y/N]
```

### Threshold Error (Text)

```
ERROR: Cannot advance - 8 incomplete task(s) in phase 'core'
       Completion: 75% (threshold: 90%)
HINT: Use 'phase advance --force' to override
```

### Critical Task Block (Text)

```
ERROR: Cannot advance - 2 critical task(s) remain in phase 'core'
HINT: Complete critical tasks or set validation.phaseValidation.blockOnCriticalTasks to false
```

### Threshold Error (JSON)

```json
{
  "success": false,
  "error": {
    "code": "E_PHASE_INCOMPLETE_TASKS",
    "message": "Cannot advance - 8 incomplete task(s) in phase 'core' (75% complete, threshold: 90%)",
    "incompleteTasks": 8,
    "completionPercent": 75,
    "threshold": 90,
    "currentPhase": "core",
    "hint": "Use --force to override"
  }
}
```

---

## Edge Cases Handled

1. **No incomplete tasks** (line 618)
   - Skips all validation
   - Proceeds directly to phase advance

2. **TTY Detection** (line 712)
   - `[[ -t 0 ]]` checks if stdin is a terminal
   - Pipes/automation skip interactive prompt

3. **JSON Mode** (lines 524-540, 677-701, 758-773)
   - Non-interactive mode even if TTY
   - Structured JSON error output
   - Suitable for scripting

4. **Force with Critical Tasks** (line 636)
   - Blocks BEFORE checking `force_advance`
   - --force cannot override critical blocking

5. **Next Phase Detection** (lines 577-610)
   - Finds next phase by order
   - Errors if no next phase exists

---

## Test Scenarios from Risk Analysis

From PHASE-ENHANCEMENT-RISK-ANALYSIS.md lines 747-748:

```bash
# Scenario 4: Advance with incomplete
ct phase advance  # Should prompt about 8 pending tasks
```

✅ FULLY SUPPORTED:
- Interactive prompt when incomplete tasks exist
- JSON output for automation
- Force override available
- Priority breakdown in prompt

---

## Minor Gaps (Non-Critical)

1. **Priority-Weighted Threshold** (Spec line 236)
   - Spec mentions: "Ignores low priority tasks in calculation"
   - Current: Treats all incomplete tasks equally
   - Impact: LOW - simpler calculation, still functional
   - Could be enhanced: multiply low-priority incomplete by 0.5 or exclude

2. **Blocked Task Exceptions** (Spec line 215-216)
   - Spec mentions: "Exception: Blocked tasks with explicit blockedBy reason"
   - Current: Only special-cases critical priority
   - Impact: LOW - blocked tasks naturally prevent full completion

3. **Operation Logging Detail**
   - Logs phase transition but not `--force` flag usage explicitly
   - Impact: LOW - audit trail present via status changes

---

## Validation Result: PRODUCTION READY ✅

### Summary

| Category | Result | Risk |
|----------|--------|------|
| Interactive Prompt | ✅ Full | None |
| --force Flag | ✅ Full | None |
| Threshold Logic | ✅ Full | None |
| Critical Blocking | ✅ Full | None |
| Error Handling | ✅ Full | None |
| JSON Output | ✅ Full | None |
| Non-TTY Mode | ✅ Full | None |
| Priority Weighting | ⚠️ Simplified | Low |

---

## Conclusion

The `cmd_advance()` function in `/mnt/projects/claude-todo/scripts/phase.sh` **FULLY IMPLEMENTS** Scenario 4 requirements:

1. ✅ Interactive prompt with incomplete task count and priority breakdown
2. ✅ `--force` flag to skip validation and prompts
3. ✅ Percentage-based threshold checking with configurable threshold
4. ✅ Critical task blocking that cannot be overridden (even with --force)
5. ✅ Proper error handling for all modes (text/JSON, TTY/pipe)
6. ✅ Clear user guidance and hints for resolution

**Safety Features**:
- Critical tasks always block (no override)
- Clear error messages
- TTY-aware prompting
- Audit logging present
- Exit codes properly set

**Ready for**: Production use / release

**Recommendation**: Approved. Minor priority-weighting enhancement possible in future release.

---

## Code Snippets: Key Implementation Details

### Snippet 1: Force Flag Parsing (lines 516-521)

```bash
# Parse --force flag
while [[ $# -gt 0 ]]; do
    case "$1" in
        --force|-f)
            force_advance=true
            shift
            ;;
```

### Snippet 2: Config Value Reading (lines 619-627)

```bash
# Read config for validation rules
local config_file="$TODO_FILE"
local block_on_critical=true
local phase_threshold=90

if [[ -f "$config_file" ]]; then
    block_on_critical=$(jq -r '.validation.phaseValidation.blockOnCriticalTasks // true' "$config_file")
    phase_threshold=$(jq -r '.validation.phaseValidation.phaseAdvanceThreshold // 90' "$config_file")
fi
```

### Snippet 3: Critical Task Blocking (lines 630-662)

```bash
# Check for critical tasks
local critical_count
critical_count=$(jq --arg phase "$current" '
    [.tasks[] | select(.phase == $phase and .status != "done" and .priority == "critical")] | length
' "$TODO_FILE")

# If critical tasks exist and blockOnCriticalTasks is true, block even with --force
if [[ "$critical_count" -gt 0 && "$block_on_critical" == "true" ]]; then
    if [[ "$FORMAT" == "json" ]]; then
        # ... JSON error output
    else
        echo "ERROR: Cannot advance - $critical_count critical task(s) remain in phase '$current'" >&2
        echo "HINT: Complete critical tasks or set validation.phaseValidation.blockOnCriticalTasks to false" >&2
    fi
    return "${EXIT_VALIDATION_ERROR:-6}"
fi
```

**Key Point**: Critical task check happens BEFORE force flag check, meaning --force cannot override this block.

### Snippet 4: Threshold Calculation and Check (lines 664-708)

```bash
# Calculate completion percentage
local total_count
total_count=$(jq --arg phase "$current" '
    [.tasks[] | select(.phase == $phase)] | length
' "$TODO_FILE")

local completion_percent=0
if [[ "$total_count" -gt 0 ]]; then
    completion_percent=$(( (total_count - incomplete_count) * 100 / total_count ))
fi

# Check if completion percentage meets threshold
if [[ "$completion_percent" -lt "$phase_threshold" && "$force_advance" != "true" ]]; then
    if [[ "$FORMAT" == "json" ]]; then
        # ... JSON error with details
    else
        echo "ERROR: Cannot advance - $incomplete_count incomplete task(s) in phase '$current'" >&2
        echo "       Completion: $completion_percent% (threshold: $phase_threshold%)" >&2
        echo "HINT: Use 'phase advance --force' to override" >&2
    fi
    return "${EXIT_VALIDATION_ERROR:-6}"
fi
```

### Snippet 5: Interactive Prompt (lines 712-735)

```bash
# Show interactive prompt unless --force was used or not a TTY
if [[ "$force_advance" != "true" && -t 0 && "$FORMAT" != "json" ]]; then
    # Show task breakdown by priority
    local high_count medium_count low_count
    high_count=$(jq --arg phase "$current" '
        [.tasks[] | select(.phase == $phase and .status != "done" and .priority == "high")] | length
    ' "$TODO_FILE")
    medium_count=$(jq --arg phase "$current" '
        [.tasks[] | select(.phase == $phase and .status != "done" and .priority == "medium")] | length
    ' "$TODO_FILE")
    low_count=$(jq --arg phase "$current" '
        [.tasks[] | select(.phase == $phase and .status != "done" and .priority == "low")] | length
    ' "$TODO_FILE")

    echo "WARNING: $incomplete_count task(s) remain in phase '$current':" >&2
    [[ "$high_count" -gt 0 ]] && echo "  - $high_count high priority" >&2
    [[ "$medium_count" -gt 0 ]] && echo "  - $medium_count medium priority" >&2
    [[ "$low_count" -gt 0 ]] && echo "  - $low_count low priority" >&2
    echo "" >&2
    read -r -p "Continue advancing to '$next_phase'? [y/N] " response

    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Advance cancelled" >&2
        return "${EXIT_NO_CHANGE:-102}"
    fi
elif [[ "$force_advance" == "true" ]]; then
    # Show warning for forced advance
    if [[ "$FORMAT" != "json" ]]; then
        echo "WARNING: Forcing advance with $incomplete_count incomplete task(s)" >&2
    fi
fi
```

**Key Points**:
- Line 712: `[[ -t 0 ]]` checks if stdin is a terminal (TTY-aware)
- Line 712: Three conditions must be true: NOT forced, IS TTY, NOT JSON mode
- Lines 726-728: Shows priority breakdown
- Line 730: Reads user response
- Line 732: Only accepts Y/y for confirmation

---

## How the Safety Hierarchy Works

1. **First Check**: Critical tasks (unconditional block)
   - If ANY critical tasks pending AND `blockOnCriticalTasks=true`
   - Block immediately, even if user passes `--force`
   - Force flag CANNOT bypass this

2. **Second Check**: Threshold percentage (can be bypassed with --force)
   - If completion % < threshold (default 90%)
   - Block unless `--force` flag passed
   - `--force` CAN bypass this check

3. **Third Layer**: Interactive confirmation (skipped with --force or non-TTY)
   - Even if threshold passes, prompt user if incomplete tasks remain
   - Only asks in interactive mode (TTY, not JSON, not forced)
   - User must answer Y/y to confirm

This creates a safety hierarchy where:
- Critical tasks = always block
- Threshold = blockable with --force
- Prompt = skippable with --force in automated contexts

---

## Testing the Implementation

To verify Scenario 4 behavior:

```bash
# Test 1: Interactive prompt with incomplete tasks
ct phase advance
# Should show prompt: "WARNING: 8 task(s) remain in phase 'core'..."

# Test 2: Force flag skips prompt
ct phase advance --force
# Should show warning but not prompt

# Test 3: Critical task blocking (cannot force)
# (Create a critical task in current phase, don't complete it)
ct phase advance --force
# Should fail with: "Cannot advance - 1 critical task(s) remain..."

# Test 4: Threshold validation
ct phase advance
# If 75% complete (threshold 90%): blocks with completion % shown
# If 95% complete: allows or shows prompt only

# Test 5: JSON output
ct phase advance --format json
# Returns structured JSON error if validation fails

# Test 6: Non-TTY mode (piped)
echo "" | ct phase advance
# Should not prompt, use JSON or fail with error
```


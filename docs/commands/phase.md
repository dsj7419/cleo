# phase Command

Manage project-level phase lifecycle with status tracking and phase transitions.

## Usage

```bash
claude-todo phase <command> [OPTIONS]
```

## Description

The `phase` command manages the **project-level phase lifecycle**, distinct from task-level phase assignment. While tasks are assigned to phases for organization (using `--phase` option), the `phase` command tracks which phase your **project** is currently in and manages phase status transitions.

This command provides:

- Current project phase tracking
- Phase lifecycle management (pending → active → completed)
- Automatic phase advancement
- Phase status visualization
- Integration with focus and session tracking

**Key Distinction**:
- **Task phases** (via `add --phase` / `update --phase`): Categorize tasks by workflow stage
- **Project phases** (via `phase` command): Track which stage the entire project is in

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `show` | Show current project phase (default if no subcommand) |
| `set <slug>` | Set current phase without changing status |
| `start <slug>` | Start a phase (pending → active) |
| `complete <slug>` | Complete a phase (active → completed) |
| `advance` | Complete current phase and start next |
| `list` | List all phases with status indicators |
| `rename <old> <new>` | Rename a phase and update all task references |
| `delete <slug>` | Delete a phase with task reassignment protection |

## Options

| Option | Context | Description |
|--------|---------|-------------|
| `--help`, `-h` | All | Show help message |
| `--format`, `-f` | All | Output format: `text` (default) or `json` |
| `--json` | All | Shorthand for `--format json` |
| `--rollback` | `set` | Allow moving to a lower-order phase (backward transition) |
| `--force` | `set`, `advance`, `delete` | Skip confirmation prompts or override threshold checks |
| `--reassign-to <slug>` | `delete` | Reassign tasks to specified phase before deletion |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (validation failed, phase not found, invalid operation) |

## Examples

### Show Current Phase

```bash
# Show current project phase
claude-todo phase show
```

Output:
```
Current Phase: core
  Name: Core Development
  Status: active
  Started: 2025-12-10T14:30:00Z
```

If no phase is set:
```
No current phase set
```

### Set Current Phase

```bash
# Set current phase (doesn't change status)
claude-todo phase set polish
```

Output:
```
Phase set to: polish
```

**Use Case**: Switch project focus to a different phase without marking it as started. Useful for planning or when resuming work on a previously started phase.

#### Rollback Detection

Moving to a lower-order phase (e.g., `core` → `setup`) is detected as a rollback and requires explicit confirmation:

```bash
# Moving backward requires --rollback flag
claude-todo phase set setup

# Output:
# ERROR: Rolling back from 'core' (order 2) to 'setup' (order 1) requires --rollback flag
```

**With confirmation prompt:**
```bash
claude-todo phase set setup --rollback

# Output:
# WARNING: This will rollback from 'Core Development' (order 2) to 'Setup' (order 1).
# Continue? [y/N]
```

**Skip confirmation with --force:**
```bash
claude-todo phase set setup --rollback --force
# Phase set to: setup
```

This safety mechanism prevents accidental phase regression while allowing intentional backtracking for iterative workflows.

### Start a Phase

```bash
# Start a phase (transitions pending → active)
claude-todo phase start core
```

Output:
```
Started phase: core
```

**Behavior**:
- Sets phase status to `active`
- Records `startedAt` timestamp
- Sets as current project phase
- Updates focus current phase
- Logs phase start event

**Restrictions**: Can only start phases with status `pending`.

### Complete a Phase

```bash
# Complete a phase (transitions active → completed)
claude-todo phase complete setup
```

Output:
```
Completed phase: setup
```

**Behavior**:
- Validates all tasks in the phase are `done`
- Sets phase status to `completed`
- Records `completedAt` timestamp
- Logs phase completion event with duration

**Restrictions**:
- Can only complete phases with status `active`
- **All tasks in the phase must be completed** (status = `done`)

If incomplete tasks exist:
```
ERROR: Cannot complete phase 'setup' - 3 incomplete task(s) pending
```

**Solution**: Complete all pending tasks in the phase before completing the phase itself.

### Advance to Next Phase

```bash
# Complete current phase and start next
claude-todo phase advance
```

Output:
```
Advanced from 'core' to 'polish'
```

**Behavior**:
1. Completes current phase (if still `active`)
   - **Skips completion step if phase is already `completed`**
   - Validates all tasks are `done` before completing
2. Finds next phase by `order` value
3. Starts next phase automatically
4. Updates current phase pointer

**Error Cases**:
- No current phase set
- No next phase exists (final phase)
- Incomplete tasks in current phase (if phase is `active`)

#### Advancing with Incomplete Tasks

By default, advancing is blocked when tasks remain incomplete. The system uses configurable threshold and critical task checks:

```bash
# When tasks are incomplete:
claude-todo phase advance

# Output:
# ERROR: Cannot advance - 8 incomplete task(s) in phase 'core'
#        Completion: 75% (threshold: 90%)
# HINT: Use 'phase advance --force' to override
```

**Interactive prompt** (when threshold is met but tasks remain):
```bash
claude-todo phase advance

# Output:
# WARNING: 3 task(s) remain in phase 'core':
#   - 1 high priority
#   - 2 medium priority
#
# Continue advancing to 'polish'? [y/N]
```

**Force override** with `--force`:
```bash
claude-todo phase advance --force

# Output:
# WARNING: Forcing advance with 8 incomplete task(s)
# Advanced from 'core' to 'polish'
```

**Critical task blocking**: Critical tasks always block advancement regardless of threshold:
```bash
# If critical tasks exist:
# ERROR: Cannot advance - 2 critical task(s) remain in phase 'core' (blockOnCriticalTasks enabled)
# HINT: Complete critical tasks or set validation.phaseValidation.blockOnCriticalTasks to false
```

See [Configuration](#phase-validation-configuration) for threshold settings.

**Typical Workflows**:
```bash
# Workflow 1: Advance completes and advances
claude-todo phase advance  # Completes active phase, starts next

# Workflow 2: Explicit complete then advance
claude-todo phase complete setup  # Manually complete
claude-todo phase advance          # Only starts next (skips completion)

# Workflow 3: Force advance with incomplete tasks
claude-todo phase advance --force  # Skip threshold check and prompt
```

### List All Phases

```bash
# List all phases with current indicator
claude-todo phase list
```

Output:
```
Project Phases:
===============
  [1] setup: Setup (completed)
★ [2] core: Core Development (active)
  [3] polish: Polish & Testing (pending)
```

**Legend**:
- `★` indicates current project phase
- `[N]` shows phase order
- Numbers in brackets are from phase `order` field

### Rename a Phase

Rename a phase and atomically update all task references:

```bash
# Rename 'core' to 'development'
claude-todo phase rename core development
```

Output:
```
Renaming phase 'core' to 'development'...
Updated 63 tasks
Updated project.currentPhase
Phase renamed successfully
```

**Behavior**:
1. Validates old phase exists
2. Validates new name doesn't already exist
3. Validates new name format (lowercase alphanumeric with hyphens)
4. Creates backup before changes
5. Atomically updates:
   - Phase definition (copied to new name)
   - All `task.phase` references
   - `project.currentPhase` (if matches old name)
   - `focus.currentPhase` (if matches old name)
6. Removes old phase definition
7. Logs the rename operation

**Validation Errors**:
```bash
# Old phase doesn't exist
claude-todo phase rename nonexistent newname
# ERROR: Phase 'nonexistent' does not exist

# New phase already exists
claude-todo phase rename core setup
# ERROR: Phase 'setup' already exists

# Invalid new name format
claude-todo phase rename core "Core Dev"
# ERROR: Invalid phase name 'Core Dev'
# Phase names must be lowercase alphanumeric with hyphens, not starting/ending with hyphen
```

**Use Cases**:
- Fix typos in phase names
- Rename for better clarity (e.g., `core` → `development`)
- Align naming with external systems

### Delete a Phase

Delete a phase with safety protections:

```bash
# Delete empty phase
claude-todo phase delete old-phase --force
```

**Protection: Task Reassignment Required**

If the phase has tasks, you must specify where to reassign them:

```bash
# Phase with tasks - error without reassignment
claude-todo phase delete core --force

# Output:
# ERROR: Cannot delete 'core': 63 tasks would be orphaned
#
# Phase 'core' has 63 tasks:
#   - 45 pending
#   - 5 active
#   - 3 blocked
#   - 10 done
#
# Use: claude-todo phase delete core --reassign-to <phase>
```

**Delete with reassignment:**
```bash
claude-todo phase delete old-phase --reassign-to setup --force

# Output:
# Phase 'old-phase' has 12 tasks:
#   - 8 pending
#   - 4 done
#
# Reassigning to 'setup'...
# Updated 12 tasks
# Phase 'old-phase' deleted
```

**Protection: Cannot Delete Current Phase**

```bash
# Trying to delete the current project phase
claude-todo phase delete core --force

# Output:
# ERROR: Cannot delete current project phase 'core'
# Use 'claude-todo phase set <other-phase>' to change the current phase first
```

**Protection: --force Required**

All deletions require the `--force` flag for safety:

```bash
# Without --force
claude-todo phase delete old-phase

# Output:
# ERROR: Phase deletion requires --force flag for safety
# Use: claude-todo phase delete old-phase --force
```

**Complete Example**:
```bash
# Step 1: Change current phase if deleting current
claude-todo phase set setup

# Step 2: Delete with reassignment and force
claude-todo phase delete deprecated-phase --reassign-to setup --force
```

## Phase Lifecycle

### Status Transitions

```
┌──────────┐
│ pending  │ ──────────────────────────┐
└─────┬────┘                           │
      │                                │
      │ phase start <slug>             │ phase set <slug>
      │                                │
      ▼                                ▼
┌──────────┐                    ┌──────────┐
│  active  │ ◄──────────────────│ (direct) │
└─────┬────┘  phase set <slug>  └──────────┘
      │
      │ phase complete <slug>
      │
      ▼
┌──────────┐
│completed │
└──────────┘
```

### Valid Transitions

| From | To | Command | Restriction |
|------|-----|---------|-------------|
| pending | active | `phase start` | Only from pending |
| active | completed | `phase complete` | Only from active |
| any | any | `phase set` | No status change |

### Advance Command Flow

```
1. Current phase: core (active)
      ↓
2. phase advance
      ↓
3. Complete: core → completed (timestamp recorded)
      ↓
4. Find next by order: polish
      ↓
5. Start: polish → active (timestamp recorded)
      ↓
6. Update currentPhase: polish
```

## Phase Configuration

Phases are defined in `.claude/todo.json` under the `project.phases` object:

```json
{
  "project": {
    "currentPhase": "core",
    "phases": {
      "setup": {
        "name": "Setup",
        "description": "Initial project setup and configuration",
        "order": 1,
        "status": "completed",
        "startedAt": "2025-12-01T10:00:00Z",
        "completedAt": "2025-12-03T16:30:00Z"
      },
      "core": {
        "name": "Core Development",
        "description": "Build core functionality and features",
        "order": 2,
        "status": "active",
        "startedAt": "2025-12-03T16:30:00Z"
      },
      "polish": {
        "name": "Polish & Testing",
        "description": "Refine, test, and prepare for release",
        "order": 3,
        "status": "pending"
      }
    }
  }
}
```

### Phase Definition Fields

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `name` | string | Display name for the phase | No (defaults to slug) |
| `description` | string | Detailed description of phase purpose | No |
| `order` | number | Sort order for phase sequence | No (defaults to 999) |
| `status` | string | Current status: pending, active, completed | No (defaults to pending) |
| `startedAt` | ISO8601 | When phase was started | Auto-set by `start` |
| `completedAt` | ISO8601 | When phase was completed | Auto-set by `complete` |

### Phase Validation Configuration

Configure phase advancement behavior in `.claude/todo.json`:

```json
{
  "validation": {
    "phaseValidation": {
      "phaseAdvanceThreshold": 90,
      "blockOnCriticalTasks": true
    }
  }
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `phaseAdvanceThreshold` | number | 90 | Minimum completion percentage required to advance (0-100) |
| `blockOnCriticalTasks` | boolean | true | Always block advancement if critical tasks remain |

**Behavior**:

1. **Threshold Check**: `phase advance` calculates `(done_tasks / total_tasks) * 100`
   - If below threshold: Error with `HINT: Use 'phase advance --force' to override`
   - If above threshold but tasks remain: Interactive prompt `Continue? [y/N]`

2. **Critical Task Blocking**: When enabled, critical priority tasks always block advancement
   - Even `--force` cannot override this
   - Set `blockOnCriticalTasks: false` to allow forcing past critical tasks

**Examples**:

```json
// Strict: Require 100% completion, always block on critical
{
  "validation": {
    "phaseValidation": {
      "phaseAdvanceThreshold": 100,
      "blockOnCriticalTasks": true
    }
  }
}

// Permissive: Low threshold, allow forcing past critical
{
  "validation": {
    "phaseValidation": {
      "phaseAdvanceThreshold": 50,
      "blockOnCriticalTasks": false
    }
  }
}
```

## State Storage

### Project Phase State

```json
{
  "project": {
    "currentPhase": "core"
  }
}
```

The `currentPhase` field tracks which phase the project is currently in. This is updated by:
- `phase set` - Direct assignment
- `phase start` - Sets when starting phase
- `phase advance` - Sets when advancing to next phase

### Focus Integration

The current phase is also synced to focus state:

```json
{
  "focus": {
    "currentTask": "T001",
    "currentPhase": "core",
    "sessionNote": "Working on authentication",
    "nextAction": "Write tests"
  }
}
```

This allows session start/end to restore project phase context.

### Phase History

The `phaseHistory` array tracks all phase transitions for audit trail and analytics:

```json
{
  "project": {
    "phaseHistory": [
      {
        "phase": "setup",
        "transitionType": "started",
        "timestamp": "2025-12-01T10:00:00Z",
        "taskCount": 14,
        "reason": "Phase started via 'phase start'"
      },
      {
        "phase": "setup",
        "transitionType": "completed",
        "timestamp": "2025-12-05T18:30:00Z",
        "taskCount": 14,
        "reason": "Phase completed via 'phase complete'"
      },
      {
        "phase": "core",
        "transitionType": "started",
        "timestamp": "2025-12-05T18:30:00Z",
        "taskCount": 63,
        "fromPhase": "setup",
        "reason": "Phase started via 'phase advance' from setup"
      }
    ]
  }
}
```

**Transition Types**:
- `started` - Phase became active
- `completed` - Phase was finished
- `rollback` - Reverted to a previous phase (includes `fromPhase` field)

**Fields**:
- `phase` - The phase slug being transitioned
- `transitionType` - Type of transition (started/completed/rollback)
- `timestamp` - ISO 8601 timestamp when transition occurred
- `taskCount` - Number of tasks in this phase at transition time
- `fromPhase` - Previous phase (required for rollback, optional for started via advance)
- `reason` - Optional context for the transition

Phase history is automatically maintained when using:
- `phase start` - Adds "started" entry
- `phase complete` - Adds "completed" entry
- `phase advance` - Adds both "completed" for current and "started" for next
- `phase set --rollback` - Adds "rollback" entry

## Integration with Other Commands

### With add Command

```bash
# Add task to current project phase automatically
CURRENT_PHASE=$(claude-todo phase show | grep -oP '(?<=Current Phase: )\w+')
claude-todo add "Implement feature X" --phase "$CURRENT_PHASE"
```

### With focus Command

```bash
# Show current phase with focus
claude-todo focus show
# Output includes:
#   Current Phase: core
```

Focus state maintains `currentPhase` for context restoration across sessions.

### With session Command

```bash
# Session start shows current phase
claude-todo session start
# Output includes:
#   [INFO] Current project phase: core (active)
```

### With dash Command

The dashboard shows project phase progress:

```bash
claude-todo dash
```

Includes section:
```
PROJECT PHASE
  Current: Core Development (active)
  Started: 2025-12-10
  Progress: 4/10 tasks (40%)
```

### With phases Command

The `phases` command shows task-level phase breakdown, while `phase` manages project-level status:

```bash
# View tasks organized by phase (task assignment)
claude-todo phases show core

# View current project phase (project lifecycle)
claude-todo phase show
```

## Audit Logging

All phase operations are logged to `.claude/todo-log.json`:

### Phase Changed

```json
{
  "timestamp": "2025-12-13T10:00:00Z",
  "action": "phase_changed",
  "details": {
    "oldPhase": "setup",
    "newPhase": "core"
  }
}
```

### Phase Started

```json
{
  "timestamp": "2025-12-13T10:00:00Z",
  "action": "phase_started",
  "details": {
    "phase": "core"
  }
}
```

### Phase Completed

```json
{
  "timestamp": "2025-12-15T16:30:00Z",
  "action": "phase_completed",
  "details": {
    "phase": "core",
    "startedAt": "2025-12-13T10:00:00Z",
    "duration": "2d 6h 30m"
  }
}
```

Duration is calculated automatically from `startedAt` to completion time.

## Use Cases

### Linear Development Workflow

```bash
# Start project
claude-todo phase start setup
# ... work on setup tasks ...
claude-todo phase advance  # → setup completed, core started

# ... work on core tasks ...
claude-todo phase advance  # → core completed, polish started

# ... work on polish tasks ...
claude-todo phase complete polish  # → polish completed
```

### Jumping Between Phases

```bash
# Working on core, but need to fix setup issue
claude-todo phase set setup
# ... fix setup issue ...
claude-todo phase set core  # Resume core work
```

**Note**: Using `set` doesn't change status, so setup remains `completed`.

### Check Phase Before Starting

```bash
# Verify current phase before starting work
claude-todo phase show

# If no phase set, start first phase
if ! claude-todo phase show > /dev/null 2>&1; then
  claude-todo phase start setup
fi
```

### Phase Duration Tracking

```bash
# Start phase
claude-todo phase start core

# ... time passes ...

# Complete phase (duration logged automatically)
claude-todo phase complete core

# View duration in log
claude-todo log --action phase_completed | grep -A3 "core"
```

## Validation

### Single Active Phase

Only one phase can be `active` at a time. The `validate` command checks this:

```bash
claude-todo validate
```

If multiple active phases exist:
```
ERROR: Multiple active phases detected (2)
```

**Fix**: Manually edit `.claude/todo.json` to set only one phase to `active`.

### Current Phase Consistency

The `currentPhase` must match an active phase if set:

```bash
claude-todo validate
```

If mismatch:
```
ERROR: Current phase 'setup' has status 'completed', expected 'active'
```

**Fix**: Run `phase set` to point to an active phase, or `phase start` to activate the desired phase.

## Error Handling

### Starting Non-Pending Phase

```bash
claude-todo phase start core
```

If core is already `active` or `completed`:
```
ERROR: Can only start pending phases (current: active)
```

**Solution**: Use `phase set` to change current phase, or `phase complete` then `start` for completed phases.

### Completing Non-Active Phase

```bash
claude-todo phase complete setup
```

If setup is `pending` or already `completed`:
```
ERROR: Can only complete active phases (current: completed)
```

**Solution**: Only active phases can be completed.

### Phase Not Found

```bash
claude-todo phase set nonexistent
```

Output:
```
ERROR: Phase 'nonexistent' does not exist
```

**Solution**: Use `phase list` to see available phases.

### No Next Phase

```bash
claude-todo phase advance
```

When on final phase:
```
INFO: No more phases after 'polish'
```

**Solution**: Expected behavior at end of project lifecycle.

## Best Practices

### 1. Start Phases Explicitly

```bash
# Good: Explicit start with timestamp
claude-todo phase start core

# Avoid: Setting without starting (no timestamp)
claude-todo phase set core
```

### 2. Use Advance for Linear Workflows

```bash
# Good: Automatic completion + start
claude-todo phase advance

# Avoid: Manual completion + start
claude-todo phase complete setup
claude-todo phase start core
```

### 3. Track Phase Context in Focus

When setting focus, consider updating phase:

```bash
# Set focus to task in different phase
claude-todo focus set T025
claude-todo phase set polish  # Match task's phase
```

### 4. Complete Phases Only When Done

Wait until all critical tasks in phase are complete:

```bash
# Check phase progress before completing
claude-todo phases show core

# Only complete if most tasks done
claude-todo phase complete core
```

### 5. Use List for Overview

```bash
# Quick phase status check
claude-todo phase list

# See current phase with detail
claude-todo phase show
```

## Workflow Examples

### Sprint-Based Development

```bash
# Start sprint
claude-todo phase start sprint-1

# During sprint
claude-todo add "Task X" --phase sprint-1
claude-todo focus set T042

# End sprint
claude-todo phase complete sprint-1
claude-todo phase start sprint-2
```

### Staged Deployment

```bash
# Development phase
claude-todo phase start development
# ... build features ...
claude-todo phase advance  # → testing

# Testing phase
# ... run tests ...
claude-todo phase advance  # → staging

# Staging phase
# ... deploy to staging ...
claude-todo phase advance  # → production
```

### Context Switching

```bash
# Working on features (core)
claude-todo phase show  # → core (active)

# Critical bug in production
claude-todo phase set hotfix
# ... fix bug ...

# Resume feature work
claude-todo phase set core
```

## Shell Integration

### Check Current Phase in Prompt

```bash
# Add to .bashrc or .zshrc
ct_current_phase() {
  if [[ -f .claude/todo.json ]]; then
    jq -r '.project.currentPhase // "none"' .claude/todo.json
  fi
}

# Use in PS1:
PS1='[\u@\h \W $(ct_current_phase)]\$ '
```

### Phase-Based Task Filtering

```bash
# Show tasks in current project phase
current_phase=$(claude-todo phase show | grep -oP '(?<=Current Phase: )\w+')
claude-todo list --phase "$current_phase"
```

### Automated Phase Advancement

```bash
# Advance phase when all tasks complete
check_phase_complete() {
  local phase="$1"
  local pending=$(claude-todo phases show "$phase" --format json | \
    jq '[.tasks[] | select(.status != "done")] | length')

  if [[ $pending -eq 0 ]]; then
    echo "All tasks in $phase complete. Advancing..."
    claude-todo phase advance
  fi
}
```

## Related Commands

- `claude-todo phases` - View task-level phase organization
- `claude-todo phases show <phase>` - See tasks in specific phase
- `claude-todo add --phase <phase>` - Add task to phase
- `claude-todo update ID --phase <phase>` - Assign task to phase
- `claude-todo focus set ID` - Set focus (syncs current phase)
- `claude-todo dash` - Dashboard shows project phase progress

## Tips

1. **Phase vs Phases**: Use `phase` for project lifecycle, `phases` for task organization
2. **Timestamp Tracking**: Use `start`/`complete` instead of `set` to get duration metrics
3. **Validation**: Run `validate` if phase state seems inconsistent
4. **Audit Trail**: Check `todo-log.json` for phase change history
5. **Focus Integration**: Current phase syncs with focus for session restoration
6. **Order Matters**: Set `order` field in phase definitions for correct `advance` behavior

## See Also

- [phases](phases.md) - Task-level phase organization
- [focus](focus.md) - Task focus management
- [session](session.md) - Work session lifecycle
- [dash](dash.md) - Project dashboard
- [validate](validate.md) - Check phase consistency

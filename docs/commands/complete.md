# complete Command

**Alias**: `done`

Mark a task as complete with required completion notes and automatic logging.

## Usage

```bash
claude-todo complete TASK_ID [OPTIONS]
```

## Description

The `complete` command transitions a task from `pending`, `active`, or `blocked` status to `done`. It sets the `completedAt` timestamp, logs the completion, and optionally triggers auto-archive based on configuration.

Completion notes are required by default to maintain audit trails. This ensures every completed task has documentation of what was done and how it was verified.

## Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `TASK_ID` | Task ID to complete (e.g., T001) | Yes |

## Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--notes TEXT` | `-n` | Completion notes (required by default) | |
| `--skip-notes` | | Skip notes requirement | `false` |
| `--skip-archive` | | Don't trigger auto-archive | `false` |
| `--help` | `-h` | Show help message | |

## Examples

### Standard Completion

```bash
# Complete with notes (recommended)
claude-todo complete T001 --notes "Implemented auth middleware. Tested with unit tests."

# With PR reference
claude-todo complete T042 --notes "Fixed bug #123. PR merged. See PR #456."
```

### Quick Completion

```bash
# Skip notes for quick completions
claude-todo complete T003 --skip-notes

# Skip both notes and auto-archive
claude-todo complete T005 --skip-notes --skip-archive
```

## Output

```
[INFO] Backup created: .claude/backups/safety/todo.json.20251213_100000

[INFO] Task T001 marked as complete

Task: Implement user authentication
ID: T001
Status: active -> done
Completed: 2025-12-13T10:00:00Z
Notes: Implemented auth middleware. Tested with unit tests.

[INFO] Clearing focus from completed task
[INFO] Auto-archive is enabled, checking archive policy...
  [INFO] Found 5 completed tasks
  [INFO] No tasks eligible for archiving

[INFO] Task completion successful
```

## Notes Best Practices

Good completion notes describe:
- **What was done**: The implementation or fix applied
- **How it was verified**: Testing, review, or validation performed
- **References**: Commit hashes, PR numbers, documentation links

Examples:
```bash
--notes "Implemented JWT middleware. Unit tests passing. See commit abc123."
--notes "Fixed null pointer in user service. Added regression test."
--notes "Refactored to use dependency injection. All tests green."
```

## Status Transitions

| From | To | Allowed |
|------|----|---------|
| `pending` | `done` | Yes |
| `active` | `done` | Yes |
| `blocked` | `done` | Yes |
| `done` | `done` | No (already completed) |

## Side Effects

1. **Sets `completedAt`**: ISO 8601 timestamp
2. **Removes `blockedBy`**: Clears any blocker reason
3. **Adds completion note**: Timestamped entry in notes array
4. **Clears focus**: If completed task was the current focus
5. **Triggers archive**: If `autoArchiveOnComplete` is enabled
6. **Logs operation**: Entry in `todo-log.json`

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Invalid arguments or task not found |

## See Also

- [add](add.md) - Create tasks
- [update](update.md) - Modify tasks
- [archive](archive.md) - Archive completed tasks
- [focus](focus.md) - Manage task focus

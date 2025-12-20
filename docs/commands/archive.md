# archive Command

**Alias**: `rm`

Archive completed tasks from `todo.json` to `todo-archive.json` based on configurable retention rules.

## Usage

```bash
claude-todo archive [OPTIONS]
```

## Description

The `archive` command moves completed (`done`) tasks from the active todo list to the archive file. It supports configurable retention policies to keep recent completions accessible while archiving older ones.

Archive behavior is controlled by three settings in `todo-config.json`:
- `daysUntilArchive`: Days after completion before archiving (default: 7)
- `maxCompletedTasks`: Threshold triggering archive prompt (default: 15)
- `preserveRecentCount`: Recent completions to keep (default: 3)

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--dry-run` | Preview without making changes | `false` |
| `--force` | Bypass age-based retention (still respects `preserveRecentCount`) | `false` |
| `--all` | Archive ALL completed tasks (bypasses both retention and preserve) | `false` |
| `--count N` | Override `maxCompletedTasks` setting | config value |
| `-f, --format FMT` | Output format: `text` or `json` | auto-detect |
| `--human` | Force human-readable text output | |
| `--json` | Force JSON output | |
| `-q, --quiet` | Suppress non-essential output | `false` |
| `-h, --help` | Show help message | |

## Examples

### Preview Archiving

```bash
# See what would be archived without making changes
claude-todo archive --dry-run
```

Output:
```
[INFO] Config: daysUntilArchive=7, maxCompleted=15, preserve=3
[INFO] Found 8 completed tasks
[INFO] Tasks to archive: 5

DRY RUN - Would archive these tasks:
  - T001: Initial setup
  - T003: Configure database
  - T005: Add authentication
  - T008: Write documentation
  - T012: Code review fixes

No changes made.
```

### Standard Archive

```bash
# Archive based on config rules (age + preserve count)
claude-todo archive
```

### Force Archive

```bash
# Archive regardless of age, but keep 3 most recent
claude-todo archive --force
```

### Archive Everything

```bash
# Archive ALL completed tasks (use with caution)
claude-todo archive --all
```

## Archive Modes

| Mode | Age Check | Preserve Recent | Use Case |
|------|-----------|-----------------|----------|
| Default | Yes | Yes | Normal maintenance |
| `--force` | No | Yes | Clear old completions, keep recent |
| `--all` | No | No | Full cleanup (nuclear option) |

## Archive Metadata

Each archived task receives metadata:

```json
{
  "_archive": {
    "archivedAt": "2025-12-13T10:00:00Z",
    "reason": "auto",
    "sessionId": "session_20251213_100000_abc123",
    "cycleTimeDays": 3
  }
}
```

## Output

### Successful Archive

```
[INFO] Mode: --force (bypassing retention, preserving 3 recent)
[INFO] Found 10 completed tasks
[INFO] Tasks to archive: 7
[INFO] Archive backup created: .claude/backups/archive/...
[INFO] Archived 7 tasks

Archived tasks:
  - T001
  - T003
  - T005
  - T008
  - T010
  - T012
  - T015

[ARCHIVE] Summary Statistics:
  Total archived: 7
  By priority:
    High: 2
    Medium: 4
    Low: 1
  Top labels:
    backend: 3
    frontend: 2
  Average cycle time: 4 days
```

## Configuration

Configure archive behavior in `.claude/todo-config.json`:

```json
{
  "archive": {
    "enabled": true,
    "daysUntilArchive": 7,
    "maxCompletedTasks": 15,
    "preserveRecentCount": 3,
    "archiveOnSessionEnd": true,
    "autoArchiveOnComplete": false
  }
}
```

| Setting | Description | Default |
|---------|-------------|---------|
| `enabled` | Enable/disable archive functionality | `true` |
| `daysUntilArchive` | Days after completion before eligible | `7` |
| `maxCompletedTasks` | Threshold for archive prompt | `15` |
| `preserveRecentCount` | Recent completions to always keep | `3` |
| `archiveOnSessionEnd` | Check archive eligibility at session end | `true` |
| `autoArchiveOnComplete` | Auto-run archive on each task completion | `false` |

## JSON Output

When using `--json` or piping output (LLM-Agent-First), returns structured JSON:

```json
{
  "$schema": "https://claude-todo.dev/schemas/v1/output.schema.json",
  "_meta": {
    "format": "json",
    "command": "archive",
    "timestamp": "2025-12-20T10:00:00Z",
    "version": "0.23.0"
  },
  "success": true,
  "archived": {
    "count": 7,
    "taskIds": ["T001", "T003", "T005", "T008", "T010", "T012", "T015"]
  },
  "remaining": {
    "total": 25,
    "pending": 18,
    "active": 1,
    "blocked": 3
  }
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success (tasks archived or none eligible) |
| `1` | General error |
| `2` | Invalid input/arguments |
| `3` | File not found |
| `4` | Validation error |

## Safety Features

- **File locking** prevents concurrent modifications
- Creates backup before archiving
- Atomic transaction (all-or-nothing)
- Cleans up orphaned dependencies
- Validates JSON before writing

## See Also

- [complete](complete.md) - Mark tasks done
- [list](list.md) - View tasks (use `--archived` to see archive)
- [restore](restore.md) - Restore from backups
- [stats](stats.md) - View archive statistics

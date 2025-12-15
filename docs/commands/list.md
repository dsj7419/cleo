# list Command

**Alias**: `ls`

Display tasks with filtering and multiple output formats.

## Usage

```bash
claude-todo list [OPTIONS]
```

## Description

The `list` command displays tasks from `todo.json` with support for filtering by status, priority, label, and phase. It supports multiple output formats including text, JSON, Markdown, and table views.

By default, completed tasks are hidden. Use `--status done` or `--all` to include them.

## Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--status STATUS` | `-s` | Filter by status: `pending`, `active`, `blocked`, `done` | Active tasks only |
| `--priority PRIORITY` | `-p` | Filter by priority: `critical`, `high`, `medium`, `low` | |
| `--label LABEL` | `-l` | Filter by label | |
| `--phase PHASE` | | Filter by phase slug | |
| `--since DATE` | | Tasks created after date (ISO 8601) | |
| `--until DATE` | | Tasks created before date (ISO 8601) | |
| `--all` | | Show all tasks including archived | `false` |
| `--archived` | | Show only archived tasks | `false` |
| `--format FORMAT` | `-f` | Output format: `text`, `json`, `jsonl`, `markdown`, `table` | `text` |
| `--sort FIELD` | | Sort by: `status`, `priority`, `createdAt`, `title` | `priority` |
| `--reverse` | | Reverse sort order | `false` |
| `--limit N` | | Limit number of results | No limit |
| `--offset N` | | Skip first N tasks (pagination) | 0 |
| `--compact` | `-c` | Compact one-line per task view | `false` |
| `--verbose` | `-v` | Show all task details | `false` |
| `--quiet` | `-q` | Suppress informational messages | `false` |
| `--help` | `-h` | Show help message | |

## Examples

### Basic Listing

```bash
# List all active (non-done) tasks
claude-todo list

# Short alias
claude-todo ls
```

Output:
```
TASKS (4 pending, 1 active, 0 blocked)
======================================

→ T005 [HIGH] Implement authentication
  Phase: core | Labels: backend, security

  T003 [MEDIUM] Add form validation
  Phase: setup | Labels: frontend

  T008 [LOW] Write documentation
  Phase: polish | Labels: docs

  T012 [MEDIUM] Set up CI/CD
  Phase: setup | Labels: devops
```

### Filtering

```bash
# By status
claude-todo list -s pending
claude-todo list --status blocked

# By priority
claude-todo list -p critical
claude-todo list --priority high

# By label
claude-todo list -l security
claude-todo list --label backend

# By phase
claude-todo list --phase setup
claude-todo list --phase core

# By date range
claude-todo list --since 2025-12-01
claude-todo list --until 2025-12-31

# Combined filters
claude-todo list -s pending -p high --phase core
```

### Output Formats

```bash
# JSON (for scripting)
claude-todo list --format json

# JSON Lines (one task per line)
claude-todo list --format jsonl

# Markdown (for documentation)
claude-todo list --format markdown

# Table view
claude-todo list --format table
```

### JSON Output Example

```json
{
  "_meta": {
    "version": "0.12.0",
    "command": "list",
    "timestamp": "2025-12-13T10:00:00Z"
  },
  "summary": {
    "total": 4,
    "pending": 3,
    "active": 1,
    "blocked": 0
  },
  "tasks": [
    {
      "id": "T005",
      "title": "Implement authentication",
      "status": "active",
      "priority": "high",
      "phase": "core",
      "labels": ["backend", "security"]
    }
  ]
}
```

### Sorting

```bash
# Sort by priority (critical first)
claude-todo list --sort priority

# Sort by creation date (newest first)
claude-todo list --sort createdAt --reverse

# Limit results
claude-todo list --limit 5
```

## Status Icons

| Icon | Status | Color |
|------|--------|-------|
| `→` | Active | Yellow |
| ` ` | Pending | Default |
| `⊗` | Blocked | Red |
| `✓` | Done | Green |

## Priority Badges

| Badge | Priority |
|-------|----------|
| `[CRITICAL]` | critical |
| `[HIGH]` | high |
| `[MEDIUM]` | medium |
| `[LOW]` | low |

## JSON Output Parsing

```bash
# Get task IDs
claude-todo list -f json | jq -r '.tasks[].id'

# Filter pending tasks
claude-todo list -f json | jq '.tasks[] | select(.status == "pending")'

# Format as table
claude-todo list -f json | jq -r '.tasks[] | "[\(.id)] \(.status) - \(.title)"'
```

## See Also

- [show](show.md) - View single task details
- [dash](dash.md) - Project dashboard overview
- [labels](labels.md) - View labels with counts
- [phases](phases.md) - View phases with progress

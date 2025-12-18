# export Command

**Alias**: None

Export tasks to various formats including TodoWrite, JSON, Markdown, CSV, and TSV with flexible filtering options.

## Usage

```bash
claude-todo export [OPTIONS]
```

## Description

The `export` command exports claude-todo tasks to different formats for integration with external tools. The primary use case is exporting to TodoWrite format for Claude Code integration, but the command also supports exporting to JSON, Markdown, CSV, and TSV formats for analysis, reporting, and integration with other tools.

This command is ideal for:
- Integrating with Claude Code's TodoWrite system
- Generating task reports in various formats
- Filtering tasks by status, priority, or label
- Exporting data for spreadsheets and databases
- Creating documentation from task lists
- Automating task workflows with scripts

## Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--format FORMAT` | `-f` | Output format: `todowrite`, `json`, `markdown`, `csv`, `tsv` | `todowrite` |
| `--status STATUS` | `-s` | Filter by status (comma-separated: `pending,active,blocked,done`) | `pending,active` |
| `--priority PRIORITY` | `-p` | Filter by priority: `critical`, `high`, `medium`, `low` | None |
| `--label LABEL` | `-l` | Filter by label (single label value) | None |
| `--max N` | `-m` | Maximum tasks to export | `10` |
| `--output FILE` | `-o` | Write to file instead of stdout | stdout |
| `--delimiter CHAR` | `-d` | Custom delimiter for CSV | `,` |
| `--no-header` | | Skip header row in CSV/TSV output | Include header |
| `--quiet` | `-q` | Suppress informational messages | Show messages |
| `--help` | `-h` | Show help message | |

## Filter Options

### Status Filter (`--status`)

Filter tasks by one or more status values. Multiple statuses can be specified as a comma-separated list.

**Valid Status Values**:
- `pending` - Ready to start
- `active` - Currently in progress
- `blocked` - Waiting on dependency
- `done` - Completed

**Examples**:
```bash
# Single status
claude-todo export --status active

# Multiple statuses (comma-separated, no spaces)
claude-todo export --status pending,active

# All statuses
claude-todo export --status pending,active,blocked,done
```

### Priority Filter (`--priority`) 🆕

Filter tasks by priority level. Only tasks matching the specified priority will be exported.

**Valid Priority Values**:
- `critical` - Urgent, blocking work
- `high` - Important, needs attention soon
- `medium` - Normal priority (default for tasks)
- `low` - Nice to have, low urgency

**Examples**:
```bash
# Export only critical priority tasks
claude-todo export --priority critical

# Export high priority tasks
claude-todo export --priority high

# Export low priority tasks
claude-todo export --priority low
```

### Label Filter (`--label`) 🆕

Filter tasks by label (tag). Only tasks that contain the specified label in their labels array will be exported.

**Examples**:
```bash
# Export all tasks labeled 'bug'
claude-todo export --label bug

# Export all backend tasks
claude-todo export --label backend

# Export security-related tasks
claude-todo export --label security
```

## Combining Filters

Filters can be combined using AND logic. Only tasks matching ALL specified filters will be exported.

### Filter Combination Examples

```bash
# Status + Priority: Export active high-priority tasks
claude-todo export --status active --priority high

# Status + Label: Export pending bug tasks
claude-todo export --status pending,active --label bug

# Priority + Label: Export critical backend tasks
claude-todo export --priority critical --label backend

# All Three Filters: Export active high-priority security tasks
claude-todo export --status active --priority high --label security

# Complex Filter: Export pending or blocked critical tasks with backend label
claude-todo export --status pending,blocked --priority critical --label backend
```

## Output Formats

### TodoWrite Format (default)

Claude Code TodoWrite format for ephemeral task tracking integration.

**Structure**:
```json
{
  "todos": [
    {
      "content": "Implement authentication",
      "activeForm": "Implementing authentication",
      "status": "in_progress"
    }
  ]
}
```

**Status Mapping**:
- `pending` → `pending`
- `active` → `in_progress`
- `blocked` → `pending` (downgraded for safety)
- `done` → `completed`

**Grammar Transformation**:

The `activeForm` field is automatically generated from the task title using grammar rules:
- "Implement X" → "Implementing X"
- "Fix bug" → "Fixing bug"
- "Add feature" → "Adding feature"
- "Setup env" → "Setting up env"

**Example**:
```bash
claude-todo export --format todowrite --status pending,active
```

### JSON Format

Full JSON array of tasks with metadata envelope for programmatic detection.

**Structure**:
```json
{
  "$schema": "https://claude-todo.dev/schemas/output.schema.json",
  "_meta": {
    "format": "json",
    "version": "0.8.3",
    "command": "export",
    "timestamp": "2025-12-13T10:00:00Z"
  },
  "filters": {
    "status": ["pending", "active"],
    "maxTasks": 10
  },
  "summary": {
    "exported": 5
  },
  "tasks": [
    {
      "id": "T001",
      "title": "Implement authentication",
      "status": "active",
      "priority": "high",
      "labels": ["backend", "security"],
      "createdAt": "2025-12-01T10:00:00Z"
    }
  ]
}
```

**Example**:
```bash
claude-todo export --format json --priority high --label backend
```

### Markdown Format

Markdown checklist format suitable for documentation and issue tracking.

**Checkbox Symbols**:
- `[ ]` - Pending task
- `[-]` - Active task
- `[!]` - Blocked task
- `[x]` - Completed task

**Priority Badges**:
- `**CRITICAL**` - Critical priority
- `*high*` - High priority

**Example Output**:
```markdown
## Tasks

- [ ] Implement authentication *high* (T001)
- [-] Fix login bug **CRITICAL** (T002)
- [x] Setup database (T003)
```

**Example**:
```bash
claude-todo export --format markdown --status pending,active
```

### CSV Format

RFC 4180 compliant CSV with quoted fields for spreadsheet import.

**Header Row**:
```
"id","status","priority","phase","title","createdAt","completedAt","labels"
```

**Field Quoting**:
- All fields are quoted for consistency
- Internal quotes escaped by doubling (`""` for `"`)
- Commas in content handled properly
- Labels joined with commas inside quotes

**Example Output**:
```csv
"T001","done","high","setup","Setup database","2025-12-08T10:00:00Z","2025-12-09T15:30:00Z","backend,db"
"T002","active","high","core","Create user model","2025-12-09T11:00:00Z","","backend,api"
```

**Example**:
```bash
# Standard CSV
claude-todo export --format csv --status pending,active,done

# Custom delimiter (semicolon)
claude-todo export --format csv --delimiter ';'

# No header row (for appending to existing CSV)
claude-todo export --format csv --no-header

# Export to file
claude-todo export --format csv --output tasks.csv
```

### TSV Format

Tab-separated values format, paste-friendly for spreadsheets.

**Features**:
- Tab character as delimiter
- No quoting needed
- Tabs in content replaced with spaces
- Optimized for direct paste into Excel/Sheets

**Example Output**:
```
id	status	priority	phase	title	createdAt	completedAt	labels
T001	done	high	setup	Setup database	2025-12-08T10:00:00Z	2025-12-09T15:30:00Z	backend,db
T002	active	high	core	Create user model	2025-12-09T11:00:00Z		backend,api
```

**Example**:
```bash
# Standard TSV
claude-todo export --format tsv

# No header for data import
claude-todo export --format tsv --no-header

# Export to file
claude-todo export --format tsv --output tasks.tsv
```

## Examples

### Basic Export

```bash
# Export active and pending tasks to TodoWrite (default)
claude-todo export

# Export only active tasks
claude-todo export --status active

# Export with custom max count
claude-todo export --max 20
```

### Priority-Based Export 🆕

```bash
# Export only critical priority tasks
claude-todo export --format todowrite --priority critical

# Export high priority tasks
claude-todo export --priority high

# Export medium priority tasks as markdown
claude-todo export --format markdown --priority medium
```

### Label-Based Export 🆕

```bash
# Export all bug tasks
claude-todo export --label bug

# Export backend tasks
claude-todo export --label backend

# Export security tasks as JSON
claude-todo export --format json --label security
```

### Combined Filters

```bash
# Active high-priority tasks
claude-todo export --status active --priority high

# Pending or active critical tasks
claude-todo export --status pending,active --priority critical

# Backend tasks with high priority
claude-todo export --priority high --label backend

# All filters: active critical backend tasks
claude-todo export --status active --priority critical --label backend
```

### Format-Specific Examples

```bash
# JSON with filters
claude-todo export --format json --priority high --label bug

# Markdown report
claude-todo export --format markdown --status pending,active,blocked

# CSV for spreadsheet
claude-todo export --format csv --status done --output completed-tasks.csv

# TSV without header for data import
claude-todo export --format tsv --no-header --status pending
```

### File Output

```bash
# Export to TodoWrite file
claude-todo export --format todowrite --output .claude/todowrite-tasks.json

# Export high-priority tasks to JSON file
claude-todo export --format json --priority high --output high-priority.json

# Export all tasks to CSV file
claude-todo export --format csv --status pending,active,blocked,done --output all-tasks.csv

# Quiet mode (no status messages)
claude-todo export --output tasks.json --quiet
```

## Use Cases

### Claude Code Integration

```bash
# Export active tasks to TodoWrite format
claude-todo export --format todowrite --status active

# Export high-priority pending tasks
claude-todo export --format todowrite --status pending --priority high

# Export specific feature tasks
claude-todo export --format todowrite --label feature-auth
```

### Task Reports

```bash
# Generate markdown task report
claude-todo export --format markdown --status pending,active > task-report.md

# Export high-priority items for standup
claude-todo export --format markdown --priority critical,high

# Create bug report from labeled tasks
claude-todo export --format markdown --label bug --output bugs.md
```

### Data Analysis

```bash
# Export to CSV for spreadsheet analysis
claude-todo export --format csv --status done --output completed-tasks.csv

# Export backend tasks for analysis
claude-todo export --format csv --label backend --output backend-tasks.csv

# TSV for database import
claude-todo export --format tsv --no-header > tasks.tsv
```

### Sprint Planning

```bash
# Export pending high-priority tasks
claude-todo export --status pending --priority high,critical

# Export tasks by feature label
claude-todo export --label feature-payments --format markdown

# Export all active work
claude-todo export --status active --format json
```

### Automation and Scripting

```bash
# Pipe to jq for processing
claude-todo export --format json --priority high | jq '.tasks[].title'

# Count critical tasks
claude-todo export --format json --priority critical | jq '.summary.exported'

# Get all backend task IDs
claude-todo export --format json --label backend | jq -r '.tasks[].id'

# Export and process with awk
claude-todo export --format tsv --no-header | awk -F'\t' '{print $1, $5}'
```

## Integration Examples

### Daily Standup Report

```bash
#!/bin/bash
# Generate daily standup report

echo "# Daily Standup - $(date +%Y-%m-%d)"
echo ""
echo "## Active Tasks"
claude-todo export --format markdown --status active
echo ""
echo "## Blocked Tasks"
claude-todo export --format markdown --status blocked
echo ""
echo "## High Priority Pending"
claude-todo export --format markdown --status pending --priority high
```

### Export by Priority

```bash
#!/bin/bash
# Export tasks grouped by priority

for priority in critical high medium low; do
  echo "Exporting $priority priority tasks..."
  claude-todo export --format csv --priority "$priority" \
    --output "tasks-${priority}.csv"
done
```

### Label-Based Export

```bash
#!/bin/bash
# Export tasks for each label

# Get all labels
labels=$(claude-todo labels --format json | jq -r '.labels[].name')

for label in $labels; do
  echo "Exporting tasks for label: $label"
  claude-todo export --format json --label "$label" \
    --output "tasks-${label}.json"
done
```

### CI/CD Integration

```bash
# Check for critical blockers
blocked_count=$(claude-todo export --format json --status blocked --priority critical | jq '.summary.exported')

if [ "$blocked_count" -gt 0 ]; then
  echo "FAILURE: $blocked_count critical tasks are blocked"
  exit 1
fi
```

## Filter Logic Details

### Status Filter Logic

Multiple statuses are combined with OR logic:
```bash
# Matches tasks with status=pending OR status=active
claude-todo export --status pending,active
```

### Priority Filter Logic

Single priority value only:
```bash
# Matches tasks with priority=high
claude-todo export --priority high
```

To export multiple priorities, use multiple commands:
```bash
claude-todo export --priority critical > critical.json
claude-todo export --priority high > high.json
```

### Label Filter Logic

Single label value, checks if label exists in task's labels array:
```bash
# Matches tasks where labels array contains "backend"
claude-todo export --label backend
```

For multiple labels, use multiple commands or combine results:
```bash
claude-todo export --label backend > backend.json
claude-todo export --label frontend > frontend.json
jq -s '.[0].tasks + .[1].tasks' backend.json frontend.json
```

### Combined Filter Logic

All filters combine with AND logic:
```bash
# Matches: (status=pending OR status=active) AND priority=high AND labels contains "backend"
claude-todo export --status pending,active --priority high --label backend
```

## Output Control

### Quiet Mode

Suppress informational messages (useful for scripting):

```bash
# Normal output (shows filter info)
claude-todo export --status active
# Output: [EXPORT] Format: todowrite, Status: active, Found: 5 tasks

# Quiet mode (no messages to stderr)
claude-todo export --status active --quiet
# Output: (only JSON to stdout)
```

### File vs Stdout

```bash
# Write to stdout (default)
claude-todo export > output.json

# Write to file with --output
claude-todo export --output output.json

# Quiet + file for clean automation
claude-todo export --output tasks.json --quiet
```

## Color Output

The export command respects standard color environment variables:

```bash
# Disable colors (for log files)
NO_COLOR=1 claude-todo export

# Force colors in pipes
FORCE_COLOR=1 claude-todo export | less -R
```

## Related Commands

- `claude-todo list` - List tasks with filtering options
- `claude-todo labels` - Analyze label distribution
- `claude-todo labels show LABEL` - Show tasks with specific label
- `claude-todo dash` - Comprehensive dashboard overview
- `claude-todo stats` - Detailed statistics and analytics

## Tips

1. **Default Behavior**: Without filters, exports active and pending tasks (most useful for TodoWrite integration)
2. **Priority Filtering**: Use `--priority` to focus on urgent work or create priority-specific reports
3. **Label Filtering**: Use `--label` to export tasks by feature, component, or category
4. **Combine Filters**: Use multiple filters together to create highly targeted exports
5. **CSV/TSV**: Use for data analysis in spreadsheets or database imports
6. **JSON**: Use for programmatic processing with tools like `jq`
7. **Markdown**: Use for documentation and reports
8. **Quiet Mode**: Use `--quiet` in scripts to avoid stderr noise
9. **File Output**: Use `--output` for automation and CI/CD workflows
10. **Max Tasks**: Adjust `--max` to control export size (default: 10)

## Version History

- **v0.6.0**: Initial implementation with TodoWrite format
- **v0.7.0**: Added JSON, Markdown, CSV, TSV formats
- **v0.8.0**: Added `--priority` and `--label` filter options
- **v0.8.2**: Improved filter combination logic and documentation

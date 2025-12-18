# config Command

View and modify claude-todo configuration settings.

## Synopsis

```bash
claude-todo config <subcommand> [args] [options]
ct cfg <subcommand> [args] [options]  # Alias
```

## Description

The `config` command provides a unified interface for viewing and modifying claude-todo configuration settings. It supports both project-level configuration (`.claude/todo-config.json`) and global user-level configuration (`~/.claude-todo/config.json`).

### Configuration Priority

Settings are resolved in this order (highest to lowest priority):
1. **CLI flags** - Command-line arguments
2. **Environment variables** - `CLAUDE_TODO_*` variables
3. **Project config** - `.claude/todo-config.json`
4. **Global config** - `~/.claude-todo/config.json`
5. **Built-in defaults** - Schema defaults

## Subcommands

### show [PATH]

Display configuration values.

```bash
# Show all config
claude-todo config show

# Show a section
claude-todo config show output
claude-todo config show archive

# Show a specific value
claude-todo config show output.defaultFormat
claude-todo config show validation.strictMode
```

### set PATH VALUE

Update a configuration value.

```bash
# Set output format to JSON
claude-todo config set output.defaultFormat json

# Enable strict validation
claude-todo config set validation.strictMode true

# Change archive retention
claude-todo config set archive.daysUntilArchive 14

# Update global config
claude-todo config set output.showColor false --global
```

### get PATH

Get a single value (useful for scripting).

```bash
# Get format setting
format=$(claude-todo config get output.defaultFormat)

# Use in conditions
if [[ $(ct config get validation.strictMode) == "true" ]]; then
  echo "Strict mode enabled"
fi
```

### list

List all configuration keys with current values.

```bash
claude-todo config list
claude-todo config list --global
```

### reset [SECTION]

Reset configuration to defaults.

```bash
# Reset entire config
claude-todo config reset

# Reset specific section
claude-todo config reset output
claude-todo config reset archive
```

### edit

Launch interactive configuration editor.

```bash
claude-todo config edit
claude-todo config edit --global
```

The editor provides a menu-based interface for browsing and modifying settings.

### validate

Validate configuration against schema.

```bash
claude-todo config validate
claude-todo config validate --global
```

## Options

| Option | Description |
|--------|-------------|
| `--global` | Target global config instead of project config |
| `-f, --format FMT` | Output format: `text` or `json` |
| `--json` | Shorthand for `--format json` |
| `--human` | Shorthand for `--format text` |
| `--dry-run` | Preview changes without applying |
| `-q, --quiet` | Suppress non-essential output |
| `-h, --help` | Show help message |

## Environment Variables

The following environment variables override configuration settings:

| Variable | Config Path | Description |
|----------|-------------|-------------|
| `CLAUDE_TODO_FORMAT` | `output.defaultFormat` | Output format (text/json) |
| `CLAUDE_TODO_OUTPUT_SHOW_COLOR` | `output.showColor` | Enable colors |
| `CLAUDE_TODO_OUTPUT_SHOW_UNICODE` | `output.showUnicode` | Enable Unicode |
| `CLAUDE_TODO_ARCHIVE_ENABLED` | `archive.enabled` | Enable archiving |
| `CLAUDE_TODO_ARCHIVE_DAYS_UNTIL_ARCHIVE` | `archive.daysUntilArchive` | Archive threshold |
| `CLAUDE_TODO_LOGGING_LEVEL` | `logging.level` | Log verbosity |
| `CLAUDE_TODO_VALIDATION_STRICT_MODE` | `validation.strictMode` | Strict validation |
| `CLAUDE_TODO_SESSION_REQUIRE_SESSION_NOTE` | `session.requireSessionNote` | Require notes |
| `CLAUDE_TODO_DEBUG` | `cli.debug.enabled` | Debug mode |

## JSON Output

When using `--format json`, output follows the standard envelope:

```json
{
  "$schema": "https://claude-todo.dev/schemas/output.schema.json",
  "_meta": {
    "format": "json",
    "version": "0.17.0",
    "command": "config",
    "timestamp": "2025-12-17T12:00:00Z",
    "scope": "project"
  },
  "success": true,
  "config": {
    "output": {
      "defaultFormat": "text",
      "showColor": true
    }
  }
}
```

For `set` operations:

```json
{
  "$schema": "https://claude-todo.dev/schemas/output.schema.json",
  "_meta": {
    "format": "json",
    "version": "0.17.0",
    "command": "config set",
    "timestamp": "2025-12-17T12:00:00Z",
    "scope": "project"
  },
  "success": true,
  "path": "output.defaultFormat",
  "previous": "text",
  "value": "json"
}
```

## Configuration Sections

### output

Output formatting preferences.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `defaultFormat` | string | `text` | Default output format |
| `showColor` | boolean | `true` | Enable colored output |
| `showUnicode` | boolean | `true` | Use Unicode symbols |
| `showProgressBars` | boolean | `true` | Show progress bars |
| `dateFormat` | string | `iso8601` | Date format |
| `showCompactTitles` | boolean | `false` | Truncate long titles |
| `maxTitleLength` | integer | `80` | Max title length |

### archive

Task archiving behavior.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `true` | Enable archiving |
| `daysUntilArchive` | integer | `7` | Days before archive eligible |
| `maxCompletedTasks` | integer | `15` | Max completed before auto-archive |
| `preserveRecentCount` | integer | `3` | Recent tasks to preserve |
| `archiveOnSessionEnd` | boolean | `true` | Archive on session end |

### validation

Data validation rules.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `strictMode` | boolean | `false` | Strict validation |
| `checksumEnabled` | boolean | `true` | Enable checksums |
| `requireDescription` | boolean | `false` | Require task descriptions |
| `maxActiveTasks` | integer | `1` | Max concurrent active tasks |

### session

Session behavior.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `requireSessionNote` | boolean | `true` | Require session notes |
| `warnOnNoFocus` | boolean | `true` | Warn if no focus set |
| `autoStartSession` | boolean | `true` | Auto-start sessions |
| `sessionTimeoutHours` | integer | `24` | Session timeout |

### defaults

Default values for new tasks.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `priority` | string | `medium` | Default priority |
| `phase` | string | `core` | Default phase |
| `labels` | array | `[]` | Default labels |

## Examples

### LLM Agent Configuration

Set up claude-todo for automated agent use:

```bash
# Force JSON output globally
claude-todo config set output.defaultFormat json --global

# Or use environment variable
export CLAUDE_TODO_FORMAT=json
```

### Disable Colors for CI/CD

```bash
# Disable colors in global config
claude-todo config set output.showColor false --global

# Or use NO_COLOR standard
export NO_COLOR=1
```

### Check Configuration in Scripts

```bash
#!/usr/bin/env bash

# Get current format
current_format=$(claude-todo config get output.defaultFormat)

# Check if strict mode is on
if [[ $(ct config get validation.strictMode) == "true" ]]; then
  echo "Running with strict validation"
fi

# Show config as JSON for processing
ct config show --format json | jq '.config.archive'
```

### Interactive Configuration

```bash
# Launch the menu-based editor
claude-todo config edit

# Edit global settings
claude-todo config edit --global
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 2 | Invalid input (missing argument) |
| 3 | File error (config not found) |
| 6 | Validation error |

## See Also

- [Configuration Reference](../reference/configuration.md) - Full configuration documentation
- [LLM-Agent-First Spec](../specs/LLM-AGENT-FIRST-SPEC.md) - Agent optimization
- [init](init.md) - Initialize project configuration

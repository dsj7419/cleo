# init Command

Initialize a new claude-todo project or update existing configuration.

## Usage

```bash
claude-todo init [PROJECT_NAME] [OPTIONS]
```

## Description

The `init` command sets up a new project for claude-todo by creating the `.claude/` directory structure and required JSON files. It can also update an existing project's CLAUDE.md injection to the latest version.

**Safeguard**: Running `init` on an already-initialized project will NOT overwrite data. Reinitializing requires explicit double confirmation with `--force --confirm-wipe`.

## Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `PROJECT_NAME` | Optional project name (for display) | No |

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--force` | Signal intent to reinitialize (requires `--confirm-wipe`) | `false` |
| `--confirm-wipe` | Confirm destructive data wipe (used with `--force`) | `false` |
| `--no-claude-md` | Skip CLAUDE.md integration | `false` |
| `--update-claude-md` | Only update CLAUDE.md injection (no other changes) | `false` |
| `-f, --format FMT` | Output format: `text`, `json` | auto-detect |
| `--json` | Force JSON output | |
| `--human` | Force human-readable text output | |
| `-q, --quiet` | Suppress non-essential output | `false` |
| `-h, --help` | Show help message | |

## Exit Codes

| Code | Constant | Meaning |
|------|----------|---------|
| 0 | `EXIT_SUCCESS` | Success |
| 2 | `EXIT_INVALID_INPUT` | `--force` provided without `--confirm-wipe` |
| 3 | `EXIT_FILE_ERROR` | Failed to create safety backup |
| 101 | `EXIT_ALREADY_EXISTS` | Project already initialized (use `--force --confirm-wipe`) |

## Examples

### New Project Setup

```bash
# Initialize in current directory
cd my-project
claude-todo init

# Initialize with project name
claude-todo init "my-project"
```

Output:
```
[INFO] Initializing claude-todo in /path/to/project
[INFO] Created .claude/ directory
[INFO] Created .claude/todo.json
[INFO] Created .claude/todo-config.json
[INFO] Created .claude/todo-archive.json
[INFO] Created .claude/todo-log.json
[INFO] Updated CLAUDE.md with task management injection

claude-todo initialized successfully!
```

### Update CLAUDE.md Injection

```bash
# Update CLAUDE.md injection to latest version
claude-todo init --update-claude-md
```

### Attempt to Reinitialize (Blocked)

```bash
# Without --force: exits with code 101
claude-todo init
# [WARN] Project already initialized at .claude/todo.json
# [WARN] Found 4 data file(s) that would be WIPED:
# [WARN]   - .claude/todo.json
# [WARN]   - .claude/todo-archive.json
# [WARN]   - .claude/todo-config.json
# [WARN]   - .claude/todo-log.json
# [WARN] To reinitialize, use BOTH flags: --force --confirm-wipe
```

### Attempt with --force Only (Blocked)

```bash
# With --force but no --confirm-wipe: exits with code 2
claude-todo init --force
# [ERROR] --force requires --confirm-wipe for destructive reinitialize
# [WARN] ⚠️  DESTRUCTIVE OPERATION WARNING ⚠️
# [WARN] This will PERMANENTLY WIPE 4 data file(s)
# [WARN] A safety backup will be created at: .claude/backups/safety/
```

### Full Reinitialize (With Safety Backup)

```bash
# Both flags required - creates backup before wiping
claude-todo init --force --confirm-wipe
# [INFO] Creating safety backup before reinitialize...
# [INFO] Safety backup created at: .claude/backups/safety/safety_20251223_120000_init_reinitialize
# [WARN] Proceeding with DESTRUCTIVE reinitialize - wiping existing data...
# [INFO] Initializing CLAUDE-TODO for project: my-project
# ...
```

## JSON Output

### Already Initialized (Exit 101)

```json
{
  "$schema": "https://claude-todo.dev/schemas/v1/error.schema.json",
  "_meta": {
    "format": "json",
    "version": "0.32.1",
    "command": "init",
    "timestamp": "2025-12-23T12:00:00Z"
  },
  "success": false,
  "error": {
    "code": "E_ALREADY_INITIALIZED",
    "message": "Project already initialized at .claude/todo.json",
    "exitCode": 101,
    "recoverable": true,
    "suggestion": "Use --force --confirm-wipe to reinitialize (DESTRUCTIVE: will wipe all existing data after creating safety backup)",
    "context": {
      "existingFiles": 4,
      "dataDirectory": ".claude",
      "affectedFiles": ["todo.json", "todo-archive.json", "todo-config.json", "todo-log.json"]
    }
  }
}
```

### Missing --confirm-wipe (Exit 2)

```json
{
  "$schema": "https://claude-todo.dev/schemas/v1/error.schema.json",
  "_meta": {
    "format": "json",
    "version": "0.32.1",
    "command": "init",
    "timestamp": "2025-12-23T12:00:00Z"
  },
  "success": false,
  "error": {
    "code": "E_CONFIRMATION_REQUIRED",
    "message": "--force requires --confirm-wipe to proceed with destructive reinitialize",
    "exitCode": 2,
    "recoverable": true,
    "suggestion": "Add --confirm-wipe to confirm you want to WIPE all existing data (a safety backup will be created first)",
    "context": {
      "existingFiles": 4,
      "safetyBackupLocation": ".claude/backups/safety/"
    }
  }
}
```

## Files Created

| File | Description |
|------|-------------|
| `.claude/todo.json` | Active tasks with metadata |
| `.claude/todo-config.json` | Project configuration |
| `.claude/todo-archive.json` | Archived completed tasks |
| `.claude/todo-log.json` | Audit log of all operations |
| `.claude/schemas/` | JSON Schema files for validation |
| `.claude/backups/` | Backup directories (safety, snapshot, etc.) |
| `CLAUDE.md` (updated) | Task management injection added |

## Directory Structure

```
project/
├── .claude/
│   ├── todo.json          # Active tasks
│   ├── todo-config.json   # Configuration
│   ├── todo-archive.json  # Archived tasks
│   ├── todo-log.json      # Audit log
│   ├── schemas/           # JSON Schema files
│   └── backups/
│       ├── safety/        # Pre-operation backups
│       ├── snapshot/      # Point-in-time snapshots
│       ├── incremental/   # Version history
│       ├── archive/       # Long-term archives
│       └── migration/     # Schema migration backups
└── CLAUDE.md              # Updated with injection
```

## Safety Backup on Reinitialize

When reinitializing with `--force --confirm-wipe`, a safety backup is automatically created:

**Location**: `.claude/backups/safety/safety_YYYYMMDD_HHMMSS_init_reinitialize/`

**Files Backed Up**:
- `todo.json` - All active tasks
- `todo-archive.json` - All archived tasks
- `todo-config.json` - Configuration
- `todo-log.json` - Audit log

**Metadata**: Includes `metadata.json` with backup timestamp, file count, and total size.

## CLAUDE.md Injection

The init command adds a task management section to CLAUDE.md:

```markdown
<!-- CLAUDE-TODO:START v0.32.1 -->
## Task Management (claude-todo)

Use `ct` (alias for `claude-todo`) for all task operations.
...
<!-- CLAUDE-TODO:END -->
```

This section:
- Provides essential command reference for AI assistants
- Auto-updates when `--update-claude-md` is run
- Preserves content outside the markers

## Behavior Summary

| Scenario | Behavior | Exit Code |
|----------|----------|-----------|
| Fresh directory | Creates all files | 0 |
| Already initialized (no flags) | Warns, exits | 101 |
| `--force` only | Warns about missing `--confirm-wipe`, exits | 2 |
| `--force --confirm-wipe` | Creates backup, wipes, reinitializes | 0 |
| `--update-claude-md` | Only updates CLAUDE.md injection | 0 |

## See Also

- [validate](validate.md) - Check project integrity
- [backup](backup.md) - Backup management
- [restore](restore.md) - Restore from backup
- [migrate](migrate.md) - Schema version migration
- [session](session.md) - Start working

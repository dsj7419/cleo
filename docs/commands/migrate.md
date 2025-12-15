# migrate Command

Schema version migration for claude-todo files.

## Usage

```bash
claude-todo migrate <command> [OPTIONS]
```

## Description

The `migrate` command handles schema version upgrades for claude-todo JSON files. When claude-todo is updated, your project files may need migration to work with new features.

Migration is safe and creates backups automatically before making changes.

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `status` | Show version status of all files |
| `check` | Check if migration is needed (exit code 1 if needed) |
| `run` | Execute migration for all files |
| `file <path> <type>` | Migrate specific file |

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--dir PATH` | Project directory | Current directory |
| `--auto` | Auto-migrate without confirmation | `false` |
| `--backup` | Create backup before migration | `true` |
| `--no-backup` | Skip backup creation | |
| `--force` | Force migration even if versions match | `false` |
| `--help`, `-h` | Show help message | |

## Examples

### Check Migration Status

```bash
# Show version status of all files
claude-todo migrate status
```

Output:
```
Schema Migration Status
=======================

File                    Current    Expected   Status
----                    -------    --------   ------
todo.json               2.0.0      2.0.0      ✓ Current
todo-config.json        1.5.0      2.0.0      ⚠ Upgrade needed
todo-archive.json       2.0.0      2.0.0      ✓ Current
todo-log.json           2.0.0      2.0.0      ✓ Current

1 file(s) need migration
```

### Check Migration Needed

```bash
# Check if migration needed (useful in scripts)
if ! claude-todo migrate check; then
  echo "Migration needed"
  claude-todo migrate run --auto
fi
```

### Run Migration

```bash
# Interactive migration (confirms before changes)
claude-todo migrate run

# Automatic migration (no confirmation)
claude-todo migrate run --auto
```

Output:
```
Schema Migration
================

Project: /path/to/project
Target versions:
  todo:    2.0.0
  config:  2.0.0
  archive: 2.0.0
  log:     2.0.0

This will migrate your todo files to the latest schema versions.

Continue? (y/N) y

Creating project backup...
✓ Backup created: .claude/backups/migration/pre-migration-20251213-100000

Migrating config...
  - Added _meta.version field
  - Restructured archive settings
✓ config migrated successfully

✓ Migration completed successfully
```

### Migrate Specific File

```bash
# Migrate only the config file
claude-todo migrate file .claude/todo-config.json config

# Migrate todo file
claude-todo migrate file .claude/todo.json todo
```

### Force Re-migration

```bash
# Force migration even if versions match
claude-todo migrate run --force
```

## File Types

| Type | File | Description |
|------|------|-------------|
| `todo` | `todo.json` | Active tasks |
| `config` | `todo-config.json` | Configuration |
| `archive` | `todo-archive.json` | Archived tasks |
| `log` | `todo-log.json` | Audit log |

## Migration Safety

1. **Pre-migration backup**: Created automatically in `.claude/backups/migration/`
2. **Validation**: Migrated files are validated before saving
3. **Atomic writes**: All-or-nothing updates prevent corruption
4. **Rollback possible**: Restore from backup if migration fails

## Version Compatibility

| Status | Meaning |
|--------|---------|
| `✓ Current` | File is at expected version |
| `⚠ Upgrade needed` | Migration available |
| `✗ Incompatible` | Major version mismatch (manual intervention) |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success / No migration needed |
| `1` | Migration needed (for `check` command) |
| `1` | Migration failed (for `run` command) |

## See Also

- [validate](validate.md) - Check file integrity
- [backup](backup.md) - Create manual backups
- [restore](restore.md) - Restore from backups
- [migrate-backups](migrate-backups.md) - Migrate legacy backup structure

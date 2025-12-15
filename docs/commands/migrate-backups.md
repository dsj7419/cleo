# migrate-backups Command

Migrate legacy backups to new unified taxonomy.

## Usage

```bash
claude-todo migrate-backups <option>
```

## Description

The `migrate-backups` command migrates backups from the old `.claude/.backups/` location to the new unified taxonomy at `.claude/backups/`. This is a one-time migration for projects that were using claude-todo before the backup taxonomy was standardized.

## Options

| Option | Description |
|--------|-------------|
| `--detect` | List detected legacy backups with classification |
| `--dry-run` | Preview migration without making changes |
| `--run` | Perform actual migration |
| `--cleanup` | Remove old `.backups` directory after migration |
| `--help`, `-h` | Show help message |

## Examples

### Detect Legacy Backups

```bash
# List detected legacy backups
claude-todo migrate-backups --detect
```

Output:
```
Detected 5 legacy backup(s):

[snapshot backups]
  .claude/.backups/backup_1702492800/
    Timestamp: 2023-12-13T10:00:00Z
    Size: 4096 bytes

[safety backups]
  .claude/.backups/todo.json.20231213_100000
    Timestamp: 2023-12-13T10:00:00Z
    Size: 2048 bytes

[migration backups]
  .claude/.backups/pre-migration-20231212/
    Timestamp: 2023-12-12T15:30:00Z
    Size: 8192 bytes

Classification:
  snapshot   - Complete system state captures
  safety     - Pre-operation safety backups
  archive    - Long-term archive backups
  migration  - Schema migration backups
  unknown    - Unrecognized backup patterns (will be skipped)
```

### Preview Migration

```bash
# See what would happen without making changes
claude-todo migrate-backups --dry-run
```

Output:
```
DRY RUN MODE - No changes will be made

Found 5 legacy backup(s) to migrate

WOULD MIGRATE: .claude/.backups/backup_1702492800/ -> .claude/backups/snapshot/snapshot_20231213_100000_migrated/
WOULD MIGRATE: .claude/.backups/todo.json.20231213_100000 -> .claude/backups/safety/safety_20231213_100000_migration_todo/
WOULD MIGRATE: .claude/.backups/pre-migration-20231212/ -> .claude/backups/migration/migration_legacy_20231213_100000/

Migration summary:
  Migrated: 3
  Failed: 0
  Skipped (unknown): 2
```

### Perform Migration

```bash
# Actually migrate the backups
claude-todo migrate-backups --run
```

Output:
```
Found 5 legacy backup(s) to migrate

MIGRATED: .claude/.backups/backup_1702492800/ -> .claude/backups/snapshot/snapshot_20231213_100000_migrated/
MIGRATED: .claude/.backups/todo.json.20231213_100000 -> .claude/backups/safety/safety_20231213_100000_migration_todo/
MIGRATED: .claude/.backups/pre-migration-20231212/ -> .claude/backups/migration/migration_legacy_20231213_100000/

Migration summary:
  Migrated: 3
  Failed: 0
  Skipped (unknown): 2
  Log: .claude/backup-migration.log
```

### Cleanup After Migration

```bash
# Remove legacy backup directory after successful migration
claude-todo migrate-backups --cleanup
```

Output:
```
WARNING: 0 legacy backup(s) still present
Removing legacy backup directory: .claude/.backups
Cleanup complete
```

## Backup Taxonomy

The new unified backup taxonomy organizes backups by type:

```
.claude/backups/
├── snapshot/      # Point-in-time complete snapshots
├── safety/        # Pre-operation safety backups
├── incremental/   # Delta-based incremental backups
├── archive/       # Long-term archive backups
└── migration/     # Schema migration backups
```

### Backup Type Classification

| Pattern | Classified As | Description |
|---------|--------------|-------------|
| `pre-migration-*` | migration | Schema migration backups |
| `backup_TIMESTAMP/` | snapshot | Point-in-time snapshots |
| `*.backup.*` | archive | Archive-related backups |
| `*.YYYYMMDD_HHMMSS` | safety | Pre-operation safety backups |
| `*.N` (numbered) | safety | Numbered safety backups |
| Other | unknown | Skipped during migration |

## Migration Metadata

Migrated backups include metadata indicating their origin:

```json
{
  "backupType": "snapshot",
  "timestamp": "2023-12-13T10:00:00Z",
  "version": "0.12.0",
  "trigger": "migration",
  "operation": "migrate_legacy",
  "migrated": true,
  "originalTimestamp": "2023-12-13T10:00:00Z",
  "originalPath": ".claude/.backups/backup_1702492800/"
}
```

## Safety Features

- **Verification**: Validates files after migration
- **Logging**: All migrations logged to `.claude/backup-migration.log`
- **Preservation**: Original files retained until explicit cleanup
- **Skipping**: Unknown patterns skipped (not lost)

## See Also

- [backup](backup.md) - Create backups
- [restore](restore.md) - Restore from backups
- [migrate](migrate.md) - Schema version migration

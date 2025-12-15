# backup Command

Create timestamped backups of all todo system files with optional compression and retention management.

## Usage

```bash
claude-todo backup [OPTIONS]
```

## Description

The `backup` command creates a complete snapshot of your todo system by copying all critical files to a timestamped backup directory. Each backup includes metadata tracking what was backed up, when, and validation status.

This command is essential for:
- Creating restore points before major changes
- Protecting against data loss or corruption
- Migrating data between systems
- Auditing historical task states
- Testing experimental workflows safely

All backups are validated during creation to ensure integrity, and automatic retention policies prevent unlimited storage consumption.

## Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--destination DIR` | | Custom backup location | `.claude/backups` |
| `--compress` | | Create compressed tarball (.tar.gz) | `false` |
| `--name NAME` | `-n` | Custom name appended to timestamp | (none) |
| `--list` | `-l` | **List all available backups** | `false` |
| `--verbose` | | **Show detailed debug output** | `false` |
| `--help` | `-h` | Show help message | |

## Backed Up Files

Each backup includes:

- `todo.json` - Active tasks and focus state
- `todo-archive.json` - Completed and archived tasks
- `todo-config.json` - Configuration and settings
- `todo-log.json` - Audit trail and session history
- `backup-metadata.json` - Backup metadata (timestamp, file count, size)

## Backup Structure

### Standard Backup (Directory)

```
.claude/.backups/
├── backup_20251213_120000/
│   ├── todo.json
│   ├── todo-archive.json
│   ├── todo-config.json
│   ├── todo-log.json
│   └── backup-metadata.json
```

### Compressed Backup (Tarball)

```
.claude/.backups/
└── backup_20251213_120000.tar.gz
```

### Named Backup

```
.claude/.backups/
└── backup_20251213_120000_before-refactor/
    ├── todo.json
    ├── ...
```

## Examples

### Basic Backup

```bash
# Create standard timestamped backup
claude-todo backup
```

Output:
```
[INFO] Creating backup: backup_20251213_120000
[INFO] Backing up files...
[INFO] Validating backup integrity...
[INFO] Backup validation successful

╔══════════════════════════════════════════════════════════╗
║              BACKUP COMPLETED SUCCESSFULLY               ║
╚══════════════════════════════════════════════════════════╝

  Backup Location:
    .claude/.backups/backup_20251213_120000

  Files Included:
    ✓ todo.json
    ✓ todo-archive.json
    ✓ todo-config.json
    ✓ todo-log.json

  Total Size: 12.4KiB
```

### Named Backup

```bash
# Create backup with custom name for context
claude-todo backup --name "before-refactor"
```

Creates: `.claude/.backups/backup_20251213_120000_before-refactor/`

Use cases:
- Before major refactoring
- Before archiving large batches
- Pre-migration snapshots
- Experimental workflow checkpoints

### Compressed Backup

```bash
# Create space-saving compressed tarball
claude-todo backup --compress
```

Output:
```
[INFO] Creating backup: backup_20251213_120000
[INFO] Backing up files...
[INFO] Validating backup integrity...
[INFO] Backup validation successful
[INFO] Compressing backup...
[INFO] Created compressed archive: .claude/.backups/backup_20251213_120000.tar.gz (3.2KiB)

╔══════════════════════════════════════════════════════════╗
║              BACKUP COMPLETED SUCCESSFULLY               ║
╚══════════════════════════════════════════════════════════╝

  Backup Location:
    .claude/.backups/backup_20251213_120000.tar.gz

  Files Included:
    ✓ todo.json
    ✓ todo-archive.json
    ✓ todo-config.json
    ✓ todo-log.json

  Total Size: 12.4KiB
```

**Note**: Compressed backups save 60-80% disk space and are ideal for archival storage.

### List Available Backups

```bash
# Show all backups with metadata
claude-todo backup --list
```

Output:
```
╔══════════════════════════════════════════════════════════════════════════════╗
║                           AVAILABLE BACKUPS                                  ║
╚══════════════════════════════════════════════════════════════════════════════╝

  ▸ backup_20251213_120000
    Timestamp: 2025-12-13T12:00:00Z
    Files: 4 | Size: 12.4KiB
    Path: .claude/.backups/backup_20251213_120000

  ▸ backup_20251213_093000_before-refactor
    Timestamp: 2025-12-13T09:30:00Z
    Files: 4 | Size: 11.8KiB
    Path: .claude/.backups/backup_20251213_093000_before-refactor

  ▸ backup_20251212_180000.tar.gz (compressed)
    Modified: 2025-12-12 18:00:00
    Size: 3.2KiB
    Path: .claude/.backups/backup_20251212_180000.tar.gz
```

**Use cases**:
- Find restore points by date or name
- Verify backup sizes and contents
- Audit backup history
- Identify old backups for cleanup

### Verbose Output

```bash
# Show detailed debug information
claude-todo backup --verbose
```

Output:
```
[INFO] Creating backup: backup_20251213_120000
[DEBUG] Created backup directory: .claude/.backups
[DEBUG] Created backup path: .claude/.backups/backup_20251213_120000
[INFO] Backing up files...
[DEBUG] todo.json validated successfully
[DEBUG] Backed up todo.json (4.2KiB)
[DEBUG] todo-archive.json validated successfully
[DEBUG] Backed up todo-archive.json (3.8KiB)
[DEBUG] todo-config.json validated successfully
[DEBUG] Backed up todo-config.json (1.1KiB)
[DEBUG] todo-log.json validated successfully
[DEBUG] Backed up todo-log.json (3.3KiB)
[DEBUG] Created metadata file
[INFO] Validating backup integrity...
[INFO] Backup validation successful
[DEBUG] Checking backup retention (max: 10)
[DEBUG] Removed old backup: backup_20251203_140000

╔══════════════════════════════════════════════════════════╗
║              BACKUP COMPLETED SUCCESSFULLY               ║
╚══════════════════════════════════════════════════════════╝
```

**Use cases**:
- Troubleshooting backup failures
- Understanding retention behavior
- Verifying file validation logic
- Debugging custom backup scripts

### Combined Options

```bash
# Named, compressed, verbose backup to custom location
claude-todo backup \
  --name "migration-snapshot" \
  --compress \
  --destination ~/backups/claude-todo \
  --verbose
```

## Restore Procedures

### Restore from Directory Backup

```bash
# 1. List available backups
claude-todo backup --list

# 2. Copy files from backup to restore
BACKUP_DIR=".claude/.backups/backup_20251213_120000"
cp "$BACKUP_DIR/todo.json" .claude/
cp "$BACKUP_DIR/todo-archive.json" .claude/
cp "$BACKUP_DIR/todo-config.json" .claude/
cp "$BACKUP_DIR/todo-log.json" .claude/

# 3. Validate restored files
claude-todo validate
```

### Restore from Compressed Backup

```bash
# 1. Extract tarball
cd .claude/.backups
tar -xzf backup_20251213_120000.tar.gz

# 2. Copy extracted files
cp backup_20251213_120000/*.json ../

# 3. Validate
claude-todo validate
```

### Selective Restore

```bash
# Restore only specific files
BACKUP_DIR=".claude/.backups/backup_20251213_120000"

# Restore just active tasks
cp "$BACKUP_DIR/todo.json" .claude/

# Restore just config
cp "$BACKUP_DIR/todo-config.json" .claude/

# Validate after partial restore
claude-todo validate
```

### Emergency Recovery

```bash
# If current files are corrupted, restore last good backup
LATEST_BACKUP=$(ls -td .claude/.backups/backup_* | head -1)
cp "$LATEST_BACKUP"/*.json .claude/
claude-todo validate
```

## Retention Policy

Automatic cleanup of old backups is controlled by configuration:

```bash
# View current retention setting
jq '.backups.maxBackups' .claude/todo-config.json
# Output: 10 (default)
```

### Configure Retention

```bash
# Update max backups kept
claude-todo config set backups.maxBackups 20

# Disable automatic cleanup (keep all backups)
claude-todo config set backups.maxBackups 0
```

### Retention Behavior

- **maxBackups > 0**: Keep only N most recent backups, auto-delete oldest
- **maxBackups = 0**: Keep all backups (manual cleanup required)
- **Default**: 10 backups

When retention limit is exceeded:
1. Counts all backups (directories + tarballs)
2. Sorts by modification time (oldest first)
3. Removes excess backups beyond maxBackups
4. Logs each removal with `--verbose`

**Example**:
```
maxBackups = 5
Current backups = 7

Action: Remove 2 oldest backups
Result: 5 backups remain
```

## Validation

Every backup performs two validation passes:

### Pre-Backup Validation

Validates source files before copying:
- Checks file exists
- Validates JSON syntax with `jq`
- Skips invalid files with warning
- Tracks validation errors in metadata

### Post-Backup Validation

Validates backed-up files after copying:
- Ensures all JSON files are well-formed
- Fails entire backup if corruption detected
- Prevents corrupt backups from being kept

**Validation Errors**:
```
[ERROR] todo.json has invalid JSON syntax
[ERROR] Backup validation failed for todo.json
[ERROR] Backup validation failed with 1 errors
```

## Metadata Format

Each backup includes `backup-metadata.json`:

```json
{
  "timestamp": "2025-12-13T12:00:00Z",
  "backupName": "backup_20251213_120000_before-refactor",
  "customName": "before-refactor",
  "files": [
    "todo.json",
    "todo-archive.json",
    "todo-config.json",
    "todo-log.json"
  ],
  "totalSize": 12688,
  "validationErrors": 0,
  "compressed": false,
  "hostname": "dev-machine",
  "user": "developer"
}
```

**Fields**:
- `timestamp`: ISO 8601 UTC timestamp of backup creation
- `backupName`: Full backup directory/tarball name
- `customName`: Optional custom name (if `--name` used)
- `files`: Array of successfully backed up files
- `totalSize`: Total bytes of uncompressed data
- `validationErrors`: Count of source validation failures
- `compressed`: Whether backup was compressed
- `hostname`: Machine where backup was created
- `user`: User who created backup

## Use Cases

### Pre-Operation Checkpoints

```bash
# Before risky operations
claude-todo backup --name "before-bulk-delete"
# ... perform bulk operations ...
# Restore if needed
```

### Daily Snapshots

```bash
# Add to cron or systemd timer
0 0 * * * cd ~/projects/myapp && claude-todo backup --compress
```

### Migration Workflows

```bash
# Export from old system
claude-todo backup --compress --destination ~/export

# Transfer tarball to new system
scp ~/export/backup_*.tar.gz newhost:~/import/

# Import on new system
cd ~/new-project
tar -xzf ~/import/backup_*.tar.gz -C .claude/.backups/
# Restore as needed
```

### Development Workflow

```bash
# Create restore point before experimental changes
alias ct-save='claude-todo backup --name "checkpoint"'
alias ct-restore='cp .claude/.backups/backup_*_checkpoint/*.json .claude/'

# Work session
ct-save
# ... make experimental changes ...
# Didn't work out? Restore
ct-restore
```

### Backup Verification

```bash
# List backups and verify integrity
claude-todo backup --list

# Check metadata for corruption indicators
jq '.validationErrors' .claude/.backups/*/backup-metadata.json
# Should output 0 for all backups
```

## Troubleshooting

### Backup Fails with Validation Errors

```bash
# Use verbose mode to identify problematic files
claude-todo backup --verbose

# Output shows:
# [WARN] todo-archive.json not found, skipping
# [ERROR] todo.json has invalid JSON syntax
```

**Solution**: Fix source files before backup
```bash
# Validate current files
claude-todo validate --fix

# Retry backup
claude-todo backup
```

### Insufficient Disk Space

```bash
# Check backup directory size
du -sh .claude/.backups

# Reduce retention or use compression
claude-todo config set backups.maxBackups 5
claude-todo backup --compress
```

### Restore Doesn't Work

```bash
# Verify backup integrity
jq empty .claude/.backups/backup_20251213_120000/*.json

# Check metadata
jq '.validationErrors' .claude/.backups/backup_20251213_120000/backup-metadata.json

# If corrupted, try older backup
claude-todo backup --list
```

### Cannot Find Backups

```bash
# Check backup directory exists
ls -la .claude/.backups/

# Verify correct directory
echo "$BACKUP_DIR"  # Should be .claude/.backups

# List with absolute path
claude-todo backup --list
```

## Automation Examples

### Pre-Commit Hook

```bash
#!/usr/bin/env bash
# .git/hooks/pre-commit

# Backup before committing todo changes
if git diff --cached --name-only | grep -q '.claude/'; then
  echo "Backing up todo system..."
  claude-todo backup --name "pre-commit" --compress
fi
```

### Session Wrapper

```bash
#!/usr/bin/env bash
# ct-session - Wrapper for safe todo sessions

# Backup at session start
claude-todo backup --name "session-start-$(date +%H%M)" --compress

# Start session
claude-todo session start

# Interactive work
$SHELL

# Backup at session end
claude-todo backup --name "session-end-$(date +%H%M)" --compress
claude-todo session end
```

### Scheduled Rotation

```bash
#!/usr/bin/env bash
# Daily backup with rotation

# Create compressed daily backup
claude-todo backup --compress --name "daily-$(date +%A)"

# Keep only last 7 days (one per weekday)
find .claude/.backups -name "backup_*_daily-*" -mtime +7 -delete
```

## Color Output

The backup command respects standard color controls:

```bash
# Disable colors
NO_COLOR=1 claude-todo backup

# Force colors even in pipes
FORCE_COLOR=1 claude-todo backup | tee backup.log
```

## Related Commands

- `claude-todo validate` - Validate current todo system files
- `claude-todo archive` - Archive completed tasks (creates auto-backup)
- `claude-todo session start` - Begin work session (recommended to backup first)
- `claude-todo export` - Export tasks to other formats

## Tips

1. **Backup Before Major Changes**: Always create a named backup before bulk operations
2. **Use Compression for Archival**: Compressed backups save 60-80% disk space
3. **Set Appropriate Retention**: Balance disk space vs. recovery window needs
4. **Name Critical Backups**: Use `--name` for important restore points
5. **Verify After Restore**: Always run `claude-todo validate` after restoring
6. **Automate Daily Backups**: Set up cron/systemd timers for regular snapshots
7. **Test Restore Procedures**: Periodically practice restoring from backups
8. **Use Verbose for Debugging**: Enable `--verbose` when troubleshooting issues

## Best Practices

### Backup Frequency

| Scenario | Frequency | Method |
|----------|-----------|--------|
| Active development | Before each session | `backup --name "session-start"` |
| Daily operations | Once per day | Automated cron job with `--compress` |
| Before bulk changes | Immediately before | `backup --name "before-X"` |
| Long-term archival | Weekly/monthly | `backup --compress --destination external` |

### Naming Conventions

Use descriptive names for easy identification:

```bash
# Good naming
backup --name "before-refactor"
backup --name "migration-v1-to-v2"
backup --name "pre-archive-cleanup"

# Avoid generic names
backup --name "backup"
backup --name "temp"
```

### Storage Management

```bash
# Monitor backup disk usage
du -sh .claude/.backups

# Aggressive retention for space-constrained systems
claude-todo config set backups.maxBackups 3

# External backup location for critical data
claude-todo backup --compress --destination ~/Dropbox/claude-todo-backups
```

## Version History

- **v0.8.0**: Initial implementation with basic backup/restore
- **v0.8.2**: Added `--list` and `--verbose` options, metadata tracking
- **v0.9.0**: Enhanced list output with formatted display and size calculation

## Security Considerations

Backups contain all task data including potentially sensitive information:

- **File Permissions**: Backups inherit source file permissions
- **Storage Location**: Default `.claude/.backups` in project directory
- **Compression**: `.tar.gz` files are not encrypted
- **Metadata**: Includes hostname and username

**Recommendations**:
- Set restrictive permissions: `chmod 700 .claude/.backups`
- Use encrypted external storage for sensitive projects
- Exclude `.claude/.backups/` from version control (add to `.gitignore`)
- Consider encrypting compressed backups for archival storage

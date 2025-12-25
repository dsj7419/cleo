#!/usr/bin/env bash
# =============================================================================
# common_setup.bash - Shared setup/teardown for BATS tests
# =============================================================================
# Single source of truth for test configuration and environment setup.
# All test files should load this for consistent behavior.
# =============================================================================

# Load external BATS libraries
_load_libs() {
    local lib_dir="${BATS_TEST_DIRNAME}/../libs"

    # bats-support must be loaded first (provides common functions)
    load "${lib_dir}/bats-support/load"
    load "${lib_dir}/bats-assert/load"
    load "${lib_dir}/bats-file/load"
}

# Project paths - single source of truth
_setup_paths() {
    export PROJECT_ROOT="${BATS_TEST_DIRNAME}/../.."
    export SCRIPTS_DIR="${PROJECT_ROOT}/scripts"
    export LIB_DIR="${PROJECT_ROOT}/lib"
    export FIXTURES_DIR="${BATS_TEST_DIRNAME}/../fixtures"

    # Use BATS auto-cleaned temp directories
    export TEST_TEMP_DIR="${BATS_TEST_TMPDIR}"
    export TEST_FILE_TEMP_DIR="${BATS_FILE_TMPDIR:-$BATS_TEST_TMPDIR}"
}

# Create standard test project structure in temp directory
_create_test_project() {
    local base_dir="${1:-$TEST_TEMP_DIR}"

    # Create both old and new backup directory structures for test compatibility
    mkdir -p "${base_dir}/.claude/.backups"
    mkdir -p "${base_dir}/.claude/backups/operational"
    mkdir -p "${base_dir}/.claude/backups/safety"
    mkdir -p "${base_dir}/.claude/backups/snapshot"
    mkdir -p "${base_dir}/.claude/backups/archive"

    export TODO_FILE="${base_dir}/.claude/todo.json"
    export CONFIG_FILE="${base_dir}/.claude/todo-config.json"
    export LOG_FILE="${base_dir}/.claude/todo-log.json"
    export ARCHIVE_FILE="${base_dir}/.claude/todo-archive.json"
    # Use new backup path (Tier 1 operational backups)
    export BACKUPS_DIR="${base_dir}/.claude/backups/operational"
    export SAFETY_BACKUPS_DIR="${base_dir}/.claude/backups/safety"

    # Create minimal config (version must match SCHEMA_VERSION_CONFIG in lib/migrate.sh)
    cat > "$CONFIG_FILE" << 'EOF'
{
  "version": "2.2.0",
  "validation": {
    "strictMode": false,
    "requireDescription": false
  }
}
EOF

    # Create empty log
    echo '{"entries": [], "_meta": {"version": "2.1.0"}}' > "$LOG_FILE"

    # Change to test directory so scripts find .claude/
    cd "$base_dir"
}

# Export script paths for easy access
_setup_scripts() {
    export BLOCKERS_SCRIPT="${SCRIPTS_DIR}/blockers-command.sh"
    export DEPS_SCRIPT="${SCRIPTS_DIR}/deps-command.sh"
    export ADD_SCRIPT="${SCRIPTS_DIR}/add-task.sh"
    export UPDATE_SCRIPT="${SCRIPTS_DIR}/update-task.sh"
    export COMPLETE_SCRIPT="${SCRIPTS_DIR}/complete-task.sh"
    export VALIDATE_SCRIPT="${SCRIPTS_DIR}/validate.sh"
    export LIST_SCRIPT="${SCRIPTS_DIR}/list-tasks.sh"
    export INIT_SCRIPT="${SCRIPTS_DIR}/init.sh"
    export ARCHIVE_SCRIPT="${SCRIPTS_DIR}/archive.sh"
    export SESSION_SCRIPT="${SCRIPTS_DIR}/session.sh"
    export FOCUS_SCRIPT="${SCRIPTS_DIR}/focus.sh"
    export LOG_SCRIPT="${SCRIPTS_DIR}/log.sh"
    export EXPORT_SCRIPT="${SCRIPTS_DIR}/export.sh"
    export DASH_SCRIPT="${SCRIPTS_DIR}/dash.sh"
    export NEXT_SCRIPT="${SCRIPTS_DIR}/next.sh"
    export LABELS_SCRIPT="${SCRIPTS_DIR}/labels.sh"
    export STATS_SCRIPT="${SCRIPTS_DIR}/stats.sh"
    export MIGRATE_SCRIPT="${SCRIPTS_DIR}/migrate.sh"
    export BACKUP_SCRIPT="${SCRIPTS_DIR}/backup.sh"
    export RESTORE_SCRIPT="${SCRIPTS_DIR}/restore.sh"
    export PHASE_SCRIPT="${SCRIPTS_DIR}/phase.sh"
    export FIND_SCRIPT="${SCRIPTS_DIR}/find.sh"
    export SHOW_SCRIPT="${SCRIPTS_DIR}/show.sh"
    export EXISTS_SCRIPT="${SCRIPTS_DIR}/exists.sh"
    # Dispatcher (install.sh wrapper script)
    export DISPATCHER_SCRIPT="${PROJECT_ROOT}/install.sh"
}

# Standard setup every test file uses
common_setup() {
    _load_libs
    _setup_paths
    _setup_scripts
    _create_test_project

    # Force text output format for tests (LLM-Agent-First defaults to JSON in non-TTY)
    export CLAUDE_TODO_FORMAT="text"
}

# Optional: common teardown
common_teardown() {
    # Return to original directory
    cd "${PROJECT_ROOT}" 2>/dev/null || true
}

# File-level setup (runs once per test file)
common_setup_file() {
    _setup_paths
    _setup_scripts
}

# File-level teardown
common_teardown_file() {
    :  # BATS auto-cleans BATS_FILE_TMPDIR
}

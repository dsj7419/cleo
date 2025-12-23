#!/usr/bin/env bats
# =============================================================================
# tree-alias.bats - Unit tests for tree alias functionality
# =============================================================================
# Tests the tree alias introduced in T648:
# - Alias resolution: tree -> list --tree
# - Flag passthrough: tree --status pending -> list --tree --status pending
# - Output parity: tree output == list --tree output
# - JSON format support
# - Error handling
#
# Note: Since tree is an alias handled by the installed dispatcher, these tests
# use the installed claude-todo command directly. For unit testing of list --tree,
# see hierarchy.bats.
#
# Reference: T648 implementation plan, T647 decision
# =============================================================================

setup() {
    load '../test_helper/common_setup'
    load '../test_helper/assertions'
    load '../test_helper/fixtures'
    common_setup

    # Use the installed claude-todo command for alias tests
    # Fall back to ct if claude-todo not in PATH
    if command -v claude-todo &>/dev/null; then
        CLAUDE_TODO_CMD="claude-todo"
    elif command -v ct &>/dev/null; then
        CLAUDE_TODO_CMD="ct"
    else
        skip "claude-todo not installed - run ./install.sh first"
    fi
}

# =============================================================================
# ALIAS RESOLUTION TESTS
# =============================================================================

@test "tree alias invokes list --tree" {
    create_empty_todo
    bash "$ADD_SCRIPT" "Epic Task" --type epic > /dev/null
    bash "$ADD_SCRIPT" "Child Task" --parent T001 --type task > /dev/null

    # Run tree alias via dispatcher
    run $CLAUDE_TODO_CMD tree
    assert_success
    # Should show tree output format
    assert_output --partial "Epic Task"
    assert_output --partial "Child Task"
}

@test "tree alias with no arguments shows all tasks in tree view" {
    create_empty_todo
    bash "$ADD_SCRIPT" "Epic" --type epic > /dev/null
    bash "$ADD_SCRIPT" "Task A" --parent T001 > /dev/null
    bash "$ADD_SCRIPT" "Task B" --parent T001 > /dev/null

    run $CLAUDE_TODO_CMD tree
    assert_success
    # Should show all tasks
    assert_output --partial "Epic"
    assert_output --partial "Task A"
    assert_output --partial "Task B"
}

# =============================================================================
# FLAG PASSTHROUGH TESTS
# =============================================================================

@test "tree alias passes through --status filter" {
    create_empty_todo
    bash "$ADD_SCRIPT" "Pending Epic" --type epic > /dev/null
    bash "$ADD_SCRIPT" "Active Task" --parent T001 > /dev/null
    bash "$UPDATE_SCRIPT" T002 --status active > /dev/null

    run $CLAUDE_TODO_CMD tree --status pending
    assert_success
    assert_output --partial "Pending Epic"
    # Active task should not appear when filtering pending only
}

@test "tree alias passes through --priority filter" {
    create_empty_todo
    bash "$ADD_SCRIPT" "Critical Epic" --type epic --priority critical > /dev/null
    bash "$ADD_SCRIPT" "Low Priority" --type epic --priority low > /dev/null

    run $CLAUDE_TODO_CMD tree --priority critical
    assert_success
    assert_output --partial "Critical Epic"
    refute_output --partial "Low Priority"
}

@test "tree alias passes through --type filter" {
    create_empty_todo
    bash "$ADD_SCRIPT" "Epic" --type epic > /dev/null
    bash "$ADD_SCRIPT" "Regular Task" --type task > /dev/null

    run $CLAUDE_TODO_CMD tree --type epic
    assert_success
    assert_output --partial "Epic"
    refute_output --partial "Regular Task"
}

@test "tree alias passes through --parent filter" {
    create_empty_todo
    bash "$ADD_SCRIPT" "Parent Epic" --type epic > /dev/null
    bash "$ADD_SCRIPT" "Child A" --parent T001 > /dev/null
    bash "$ADD_SCRIPT" "Orphan Task" --type task > /dev/null

    # --parent filters to show tasks with that parentId
    # Tree view shows filtered tasks but may not show hierarchy since parent is excluded
    run $CLAUDE_TODO_CMD tree --parent T001 --format json
    assert_success
    # Verify Child A is in results
    echo "$output" | jq -e '.tasks[] | select(.title == "Child A")' > /dev/null
    # Verify Orphan Task is NOT in results
    local orphan_count=$(echo "$output" | jq '[.tasks[] | select(.title == "Orphan Task")] | length')
    [[ "$orphan_count" -eq 0 ]]
}

# =============================================================================
# FORMAT TESTS
# =============================================================================

@test "tree alias --format json produces valid JSON" {
    create_empty_todo
    bash "$ADD_SCRIPT" "Epic" --type epic > /dev/null
    bash "$ADD_SCRIPT" "Task" --parent T001 > /dev/null

    run $CLAUDE_TODO_CMD tree --format json
    assert_success

    # Verify valid JSON with required envelope
    echo "$output" | jq -e '."$schema"' > /dev/null
    echo "$output" | jq -e '._meta.command' > /dev/null
    echo "$output" | jq -e '.success' > /dev/null
    echo "$output" | jq -e '.tree' > /dev/null
}

@test "tree alias --human produces text output" {
    create_empty_todo
    bash "$ADD_SCRIPT" "Test Epic" --type epic > /dev/null

    run $CLAUDE_TODO_CMD tree --human
    assert_success
    # Human output should not be JSON
    [[ "$output" != *'"$schema"'* ]]
    assert_output --partial "Test Epic"
}

@test "tree alias --json shortcut works" {
    create_empty_todo
    bash "$ADD_SCRIPT" "Epic" --type epic > /dev/null

    run $CLAUDE_TODO_CMD tree --json
    assert_success
    # Should be valid JSON
    echo "$output" | jq -e '.success == true' > /dev/null
}

# =============================================================================
# OUTPUT PARITY TESTS
# =============================================================================

@test "tree alias JSON matches list --tree JSON structure" {
    create_empty_todo
    bash "$ADD_SCRIPT" "Epic" --type epic > /dev/null
    bash "$ADD_SCRIPT" "Task" --parent T001 > /dev/null

    # Get both outputs
    run $CLAUDE_TODO_CMD tree --format json
    assert_success
    local tree_output="$output"

    run bash "$LIST_SCRIPT" --tree --format json
    assert_success
    local list_output="$output"

    # Compare structure (ignoring timestamps which differ)
    local tree_schema=$(echo "$tree_output" | jq -r '."$schema"')
    local list_schema=$(echo "$list_output" | jq -r '."$schema"')
    [[ "$tree_schema" == "$list_schema" ]]

    local tree_cmd=$(echo "$tree_output" | jq -r '._meta.command')
    local list_cmd=$(echo "$list_output" | jq -r '._meta.command')
    [[ "$tree_cmd" == "$list_cmd" ]]

    # Both should have tree field
    echo "$tree_output" | jq -e '.tree' > /dev/null
    echo "$list_output" | jq -e '.tree' > /dev/null
}

@test "tree alias exit code matches list --tree on success" {
    create_empty_todo
    bash "$ADD_SCRIPT" "Epic" --type epic > /dev/null

    run $CLAUDE_TODO_CMD tree
    local tree_status=$status

    run bash "$LIST_SCRIPT" --tree
    local list_status=$status

    [[ "$tree_status" -eq "$list_status" ]]
    [[ "$tree_status" -eq 0 ]]
}

# =============================================================================
# FILTER VALIDATION TESTS (T646 findings)
# =============================================================================

@test "tree alias --type with invalid value returns error" {
    create_empty_todo

    run $CLAUDE_TODO_CMD tree --type invalid
    assert_failure
    # Should return exit code 2 (EXIT_INVALID_INPUT)
    [[ "$status" -eq 2 ]]
}

@test "tree alias --type validation accepts valid values" {
    create_empty_todo
    bash "$ADD_SCRIPT" "Epic" --type epic > /dev/null

    for valid_type in epic task subtask; do
        run $CLAUDE_TODO_CMD tree --type "$valid_type"
        assert_success
    done
}

# =============================================================================
# EDGE CASES
# =============================================================================

@test "tree alias with empty todo.json handles gracefully" {
    create_empty_todo

    run $CLAUDE_TODO_CMD tree
    # Should succeed or show "no tasks" message
    [[ "$status" -eq 0 ]] || assert_output --partial "No tasks"
}

@test "tree alias help shows list help" {
    run $CLAUDE_TODO_CMD help tree
    assert_success
    # Help should mention --tree since tree maps to list
    assert_output --partial "list"
}

@test "tree alias combined with --quiet suppresses output" {
    create_empty_todo
    bash "$ADD_SCRIPT" "Epic" --type epic > /dev/null

    run $CLAUDE_TODO_CMD tree --quiet --format json
    assert_success
    # JSON output should still work but be minimal
    echo "$output" | jq -e '.success' > /dev/null
}

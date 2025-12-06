#!/usr/bin/env bash
# test-focus.sh - Focus management tests
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

PASSED=0
FAILED=0

test_result() {
  local name="$1"
  local expected="$2"
  local actual="$3"

  if [[ "$expected" == "$actual" ]]; then
    echo "  ✅ $name"
    PASSED=$((PASSED + 1))
  else
    echo "  ❌ $name (expected: $expected, got: $actual)"
    FAILED=$((FAILED + 1))
  fi
}

# Setup test environment using actual init
setup_test_env() {
  TEST_DIR=$(mktemp -d)
  cd "$TEST_DIR"

  # Use actual init command
  "$PROJECT_ROOT/scripts/init.sh" test-project >/dev/null 2>&1

  # Add test tasks
  "$PROJECT_ROOT/scripts/add-task.sh" "Test task one" >/dev/null 2>&1
  "$PROJECT_ROOT/scripts/add-task.sh" "Test task two" >/dev/null 2>&1

  echo "$TEST_DIR"
}

cleanup_test_env() {
  local test_dir="$1"
  if [[ -d "$test_dir" ]]; then
    rm -rf "$test_dir"
  fi
}

echo "=== Focus Management Tests ==="
echo ""

# Test 1: Focus script exists
echo "Testing focus script presence..."
if [[ -f "$PROJECT_ROOT/scripts/focus.sh" ]]; then
  test_result "Focus script exists" "true" "true"
else
  test_result "Focus script exists" "true" "false"
fi

# Test 2: Focus script is executable
if [[ -x "$PROJECT_ROOT/scripts/focus.sh" ]]; then
  test_result "Focus script executable" "true" "true"
else
  test_result "Focus script executable" "true" "false"
fi

# Test 3: Focus script has required commands
echo "Testing focus script commands..."
help_output=$("$PROJECT_ROOT/scripts/focus.sh" --help 2>/dev/null || true)
if echo "$help_output" | grep -q "set"; then
  test_result "Focus has 'set' command" "true" "true"
else
  test_result "Focus has 'set' command" "true" "false"
fi

if echo "$help_output" | grep -q "clear"; then
  test_result "Focus has 'clear' command" "true" "true"
else
  test_result "Focus has 'clear' command" "true" "false"
fi

if echo "$help_output" | grep -q "show"; then
  test_result "Focus has 'show' command" "true" "true"
else
  test_result "Focus has 'show' command" "true" "false"
fi

# Test 4: Focus set functional test
echo "Testing focus workflow..."
TEST_DIR=$(setup_test_env)
cd "$TEST_DIR"

# Test setting focus
if "$PROJECT_ROOT/scripts/focus.sh" set T001 >/dev/null 2>&1; then
  focused_id=$(jq -r '.focus.currentTask // empty' .claude/todo.json)
  if [[ "$focused_id" == "T001" ]]; then
    test_result "Focus set works" "pass" "pass"
  else
    test_result "Focus set works" "pass" "fail"
  fi
else
  test_result "Focus set works" "pass" "fail"
fi

# Test that setting focus marks task active
task_status=$(jq -r '.tasks[] | select(.id == "T001") | .status' .claude/todo.json)
if [[ "$task_status" == "active" ]]; then
  test_result "Focus set marks task active" "pass" "pass"
else
  test_result "Focus set marks task active" "pass" "fail"
fi

# Test focus show
show_output=$("$PROJECT_ROOT/scripts/focus.sh" show 2>/dev/null || true)
if echo "$show_output" | grep -qE "(T001|Test task one)"; then
  test_result "Focus show displays current focus" "pass" "pass"
else
  test_result "Focus show displays current focus" "pass" "fail"
fi

# Test focus clear
if "$PROJECT_ROOT/scripts/focus.sh" clear >/dev/null 2>&1; then
  focused_id=$(jq -r '.focus.currentTask // "null"' .claude/todo.json)
  if [[ "$focused_id" == "null" ]]; then
    test_result "Focus clear works" "pass" "pass"
  else
    test_result "Focus clear works" "pass" "fail"
  fi
else
  test_result "Focus clear works" "pass" "fail"
fi

cleanup_test_env "$TEST_DIR"
cd "$SCRIPT_DIR"

echo ""
echo "=== Results ==="
echo "Passed: $PASSED"
echo "Failed: $FAILED"

[[ $FAILED -eq 0 ]] && exit 0 || exit 1

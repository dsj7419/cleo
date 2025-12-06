#!/usr/bin/env bash
# test-session.sh - Session management tests
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

  # Use actual init command to create proper structure
  "$PROJECT_ROOT/scripts/init.sh" test-project >/dev/null 2>&1

  # Add a test task
  "$PROJECT_ROOT/scripts/add-task.sh" "Test task" >/dev/null 2>&1

  echo "$TEST_DIR"
}

cleanup_test_env() {
  local test_dir="$1"
  if [[ -d "$test_dir" ]]; then
    rm -rf "$test_dir"
  fi
}

echo "=== Session Management Tests ==="
echo ""

# Test 1: Session script exists
echo "Testing session script presence..."
if [[ -f "$PROJECT_ROOT/scripts/session.sh" ]]; then
  test_result "Session script exists" "true" "true"
else
  test_result "Session script exists" "true" "false"
fi

# Test 2: Session script is executable
if [[ -x "$PROJECT_ROOT/scripts/session.sh" ]]; then
  test_result "Session script executable" "true" "true"
else
  test_result "Session script executable" "true" "false"
fi

# Test 3: Session script has required commands
echo "Testing session script commands..."
help_output=$("$PROJECT_ROOT/scripts/session.sh" --help 2>/dev/null || true)
if echo "$help_output" | grep -q "start"; then
  test_result "Session has 'start' command" "true" "true"
else
  test_result "Session has 'start' command" "true" "false"
fi

if echo "$help_output" | grep -q "end"; then
  test_result "Session has 'end' command" "true" "true"
else
  test_result "Session has 'end' command" "true" "false"
fi

if echo "$help_output" | grep -q "status"; then
  test_result "Session has 'status' command" "true" "true"
else
  test_result "Session has 'status' command" "true" "false"
fi

# Test 4: Session start/end functional test
echo "Testing session workflow..."
TEST_DIR=$(setup_test_env)
cd "$TEST_DIR"

# Test session start
if "$PROJECT_ROOT/scripts/session.sh" start >/dev/null 2>&1; then
  # Verify session is now active (check _meta.activeSession)
  active_session=$(jq -r '._meta.activeSession // empty' .claude/todo.json)
  if [[ -n "$active_session" ]]; then
    test_result "Session start works" "pass" "pass"
  else
    test_result "Session start works" "pass" "fail"
  fi
else
  test_result "Session start works" "pass" "fail"
fi

# Test session end
# Note: session end may exit non-zero but still work
"$PROJECT_ROOT/scripts/session.sh" end >/dev/null 2>&1 || true
active_session=$(jq -r '._meta.activeSession // empty' .claude/todo.json)
if [[ -z "$active_session" || "$active_session" == "null" ]]; then
  test_result "Session end works" "pass" "pass"
else
  test_result "Session end works" "pass" "fail"
fi

cleanup_test_env "$TEST_DIR"
cd "$SCRIPT_DIR"

echo ""
echo "=== Results ==="
echo "Passed: $PASSED"
echo "Failed: $FAILED"

[[ $FAILED -eq 0 ]] && exit 0 || exit 1

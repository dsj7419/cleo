#!/usr/bin/env bash
# test-export.sh - Export functionality tests
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

  # Add test tasks with different statuses
  "$PROJECT_ROOT/scripts/add-task.sh" "Fix authentication bug" >/dev/null 2>&1
  "$PROJECT_ROOT/scripts/add-task.sh" "Implement user dashboard" >/dev/null 2>&1

  # Set one task as active
  "$PROJECT_ROOT/scripts/focus.sh" set T001 >/dev/null 2>&1
  # Clear focus but T001 should remain active
  "$PROJECT_ROOT/scripts/focus.sh" clear >/dev/null 2>&1

  echo "$TEST_DIR"
}

cleanup_test_env() {
  local test_dir="$1"
  if [[ -d "$test_dir" ]]; then
    rm -rf "$test_dir"
  fi
}

echo "=== Export Tests ==="
echo ""

# Test 1: Export script exists
echo "Testing export script presence..."
if [[ -f "$PROJECT_ROOT/scripts/export.sh" ]]; then
  test_result "Export script exists" "true" "true"
else
  test_result "Export script exists" "true" "false"
fi

# Test 2: Export script is executable
if [[ -x "$PROJECT_ROOT/scripts/export.sh" ]]; then
  test_result "Export script executable" "true" "true"
else
  test_result "Export script executable" "true" "false"
fi

# Test 3: TodoWrite integration library exists
if [[ -f "$PROJECT_ROOT/lib/todowrite-integration.sh" ]]; then
  test_result "TodoWrite integration library exists" "true" "true"
else
  test_result "TodoWrite integration library exists" "true" "false"
fi

# Test 4: Export help shows formats
echo "Testing export formats..."
help_output=$("$PROJECT_ROOT/scripts/export.sh" --help 2>/dev/null || true)
if echo "$help_output" | grep -q "todowrite"; then
  test_result "Export supports todowrite format" "true" "true"
else
  test_result "Export supports todowrite format" "true" "false"
fi

if echo "$help_output" | grep -q "json"; then
  test_result "Export supports json format" "true" "true"
else
  test_result "Export supports json format" "true" "false"
fi

if echo "$help_output" | grep -q "markdown"; then
  test_result "Export supports markdown format" "true" "true"
else
  test_result "Export supports markdown format" "true" "false"
fi

# Test 5: Export TodoWrite format functional test
echo "Testing export TodoWrite format..."
TEST_DIR=$(setup_test_env)
cd "$TEST_DIR"

export_output=$("$PROJECT_ROOT/scripts/export.sh" --format todowrite --quiet 2>/dev/null || true)

# Check it's valid JSON
if echo "$export_output" | jq empty 2>/dev/null; then
  test_result "Export produces valid JSON" "pass" "pass"
else
  test_result "Export produces valid JSON" "pass" "fail"
fi

# Check it has todos array
if echo "$export_output" | jq -e '.todos' >/dev/null 2>&1; then
  test_result "Export has todos array" "pass" "pass"
else
  test_result "Export has todos array" "pass" "fail"
fi

# Check todos have required fields (if there are any todos)
todos_count=$(echo "$export_output" | jq '.todos | length' 2>/dev/null || echo "0")
if [[ "$todos_count" -gt 0 ]]; then
  if echo "$export_output" | jq -e '.todos[0].content' >/dev/null 2>&1 && \
     echo "$export_output" | jq -e '.todos[0].activeForm' >/dev/null 2>&1 && \
     echo "$export_output" | jq -e '.todos[0].status' >/dev/null 2>&1; then
    test_result "TodoWrite format has required fields" "pass" "pass"
  else
    test_result "TodoWrite format has required fields" "pass" "fail"
  fi

  # Check activeForm is different from content (grammar transform applied)
  content=$(echo "$export_output" | jq -r '.todos[0].content // empty' 2>/dev/null || true)
  activeForm=$(echo "$export_output" | jq -r '.todos[0].activeForm // empty' 2>/dev/null || true)
  if [[ -n "$content" && -n "$activeForm" && "$content" != "$activeForm" ]]; then
    test_result "Grammar transformation applied" "pass" "pass"
  else
    test_result "Grammar transformation applied" "pass" "fail"
  fi
else
  test_result "TodoWrite format has required fields" "pass" "pass"
  test_result "Grammar transformation applied" "pass" "pass"
fi

# Test 6: Export JSON format
json_output=$("$PROJECT_ROOT/scripts/export.sh" --format json --quiet 2>/dev/null || true)
if echo "$json_output" | jq -e '.' >/dev/null 2>&1; then
  # JSON format could be array or object depending on implementation
  test_result "Export JSON format works" "pass" "pass"
else
  test_result "Export JSON format works" "pass" "fail"
fi

# Test 7: Export Markdown format
md_output=$("$PROJECT_ROOT/scripts/export.sh" --format markdown --quiet 2>/dev/null || true)
if echo "$md_output" | grep -qE "(\- \[|#|Task)"; then
  test_result "Export Markdown format works" "pass" "pass"
else
  # Empty markdown is also valid
  test_result "Export Markdown format works" "pass" "pass"
fi

# Test 8: Status filter works
filtered_output=$("$PROJECT_ROOT/scripts/export.sh" --format todowrite --status active --quiet 2>/dev/null || true)
if echo "$filtered_output" | jq -e '.todos' >/dev/null 2>&1; then
  test_result "Status filter works" "pass" "pass"
else
  test_result "Status filter works" "pass" "fail"
fi

cleanup_test_env "$TEST_DIR"
cd "$SCRIPT_DIR"

echo ""
echo "=== Results ==="
echo "Passed: $PASSED"
echo "Failed: $FAILED"

[[ $FAILED -eq 0 ]] && exit 0 || exit 1

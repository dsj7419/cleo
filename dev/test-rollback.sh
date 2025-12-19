#!/usr/bin/env bash
# test-rollback.sh - Manual test script for phase rollback feature
# Usage: ./dev/test-rollback.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PHASE_SCRIPT="$PROJECT_ROOT/scripts/phase.sh"
DEV_LIB_DIR="$SCRIPT_DIR/lib"

# ============================================================================
# LIBRARY SOURCING
# ============================================================================
# Source shared dev library for colors and output
if [[ -d "$DEV_LIB_DIR" ]] && [[ -f "$DEV_LIB_DIR/dev-output.sh" ]]; then
    source "$DEV_LIB_DIR/dev-output.sh"
fi

echo "===== Phase Rollback Detection Tests ====="
echo

# Save initial state
initial_phase=$(cd "$PROJECT_ROOT" && "$PHASE_SCRIPT" show | grep "Current Phase:" | awk '{print $3}')
echo "Initial phase: $initial_phase"
echo

# Test 1: Forward movement (should work without --rollback)
echo "Test 1: Forward movement (setup -> core)"
cd "$PROJECT_ROOT" && "$PHASE_SCRIPT" set setup --rollback --force >/dev/null 2>&1
if cd "$PROJECT_ROOT" && "$PHASE_SCRIPT" set core 2>&1 | grep -q "Phase set to: core"; then
    echo "✓ PASS: Forward movement works without --rollback"
else
    echo "✗ FAIL: Forward movement should not require --rollback"
fi
echo

# Test 2: Rollback without --rollback flag (should error)
echo "Test 2: Rollback without --rollback flag (core -> setup)"
output=$(cd "$PROJECT_ROOT" && "$PHASE_SCRIPT" set setup 2>&1 || true)
if echo "$output" | grep -q "requires --rollback flag"; then
    echo "✓ PASS: Rollback blocked without --rollback flag"
else
    echo "✗ FAIL: Rollback should be blocked without --rollback flag"
    echo "  Output: $output"
fi
echo

# Test 3: Rollback with --rollback but cancel prompt
echo "Test 3: Rollback with --rollback, cancel at prompt"
output=$(cd "$PROJECT_ROOT" && echo "n" | "$PHASE_SCRIPT" set setup --rollback 2>&1 || true)
if echo "$output" | grep -q "Rollback cancelled"; then
    echo "✓ PASS: Rollback cancelled at prompt"
else
    echo "✗ FAIL: Should show 'Rollback cancelled'"
    echo "  Output: $output"
fi
echo

# Test 4: Rollback with --rollback and accept prompt
echo "Test 4: Rollback with --rollback, accept at prompt"
output=$(cd "$PROJECT_ROOT" && echo "y" | "$PHASE_SCRIPT" set setup --rollback 2>&1 || true)
if echo "$output" | grep -q "Phase set to: setup"; then
    echo "✓ PASS: Rollback succeeded with prompt confirmation"
else
    echo "✗ FAIL: Rollback should succeed when confirmed"
    echo "  Output: $output"
fi
echo

# Test 5: Rollback with --rollback --force (no prompt)
echo "Test 5: Rollback with --rollback --force (no prompt)"
cd "$PROJECT_ROOT" && "$PHASE_SCRIPT" set core --rollback --force >/dev/null 2>&1
if cd "$PROJECT_ROOT" && "$PHASE_SCRIPT" set setup --rollback --force 2>&1 | grep -q "Phase set to: setup"; then
    echo "✓ PASS: Rollback succeeded with --force (no prompt)"
else
    echo "✗ FAIL: Rollback --force should skip prompt"
fi
echo

# Test 6: JSON mode rollback without --force (should error)
echo "Test 6: JSON mode rollback without --force"
cd "$PROJECT_ROOT" && "$PHASE_SCRIPT" set core --rollback --force >/dev/null 2>&1
output=$(cd "$PROJECT_ROOT" && "$PHASE_SCRIPT" --json set setup --rollback 2>&1 || true)
if echo "$output" | jq -e '.error.code == "E_PHASE_ROLLBACK_REQUIRES_FORCE"' >/dev/null 2>&1; then
    echo "✓ PASS: JSON mode requires --force for rollback"
else
    echo "✗ FAIL: JSON mode should require --force"
    echo "  Output: $output"
fi
echo

# Test 7: JSON mode rollback with --force
echo "Test 7: JSON mode rollback with --force"
output=$(cd "$PROJECT_ROOT" && "$PHASE_SCRIPT" --json set setup --rollback --force 2>&1 || true)
if echo "$output" | jq -e '.success == true' >/dev/null 2>&1; then
    echo "✓ PASS: JSON mode rollback succeeds with --force"
else
    echo "✗ FAIL: JSON mode rollback --force should succeed"
    echo "  Output: $output"
fi
echo

# Restore initial state
echo "Restoring initial phase: $initial_phase"
if [[ "$initial_phase" != "setup" ]]; then
    cd "$PROJECT_ROOT" && "$PHASE_SCRIPT" set "$initial_phase" --rollback --force >/dev/null 2>&1 || \
    cd "$PROJECT_ROOT" && "$PHASE_SCRIPT" set "$initial_phase" >/dev/null 2>&1
fi

echo
echo "===== All Tests Complete ====="

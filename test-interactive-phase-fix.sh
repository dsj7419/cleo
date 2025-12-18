#!/usr/bin/env bash
# Manual test for interactive phase conflict resolution
# This script creates a test scenario and shows how the interactive prompt works

set -euo pipefail

echo "=== Interactive Phase Conflict Resolution Test ==="
echo ""
echo "This test demonstrates the interactive phase conflict fix."
echo "You will be prompted to select which phase to keep active."
echo ""

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Set up test environment
export TODO_FILE="$TEMP_DIR/.claude/todo.json"
export LOG_FILE="$TEMP_DIR/.claude/todo-log.json"
mkdir -p "$TEMP_DIR/.claude/backups/safety"

# Create todo.json with multiple active phases
cat > "$TODO_FILE" << 'EOF'
{
  "_meta": {"version": "2.2.0"},
  "project": {
    "phases": {
      "setup": {
        "name": "Initial Setup",
        "order": 1,
        "status": "active",
        "startedAt": "2025-12-01T10:00:00Z"
      },
      "core": {
        "name": "Core Development",
        "order": 2,
        "status": "active",
        "startedAt": "2025-12-05T10:00:00Z"
      },
      "polish": {
        "name": "Polish and Refinement",
        "order": 3,
        "status": "active",
        "startedAt": "2025-12-10T10:00:00Z"
      }
    },
    "currentPhase": "core"
  },
  "tasks": [
    {"id": "T001", "title": "Task in setup", "description": "D1", "status": "done", "priority": "medium", "phase": "setup", "createdAt": "2025-12-01T10:00:00Z", "completedAt": "2025-12-02T10:00:00Z"},
    {"id": "T002", "title": "Task in core", "description": "D2", "status": "active", "priority": "high", "phase": "core", "createdAt": "2025-12-05T10:00:00Z"},
    {"id": "T003", "title": "Task in polish", "description": "D3", "status": "pending", "priority": "medium", "phase": "polish", "createdAt": "2025-12-10T10:00:00Z"}
  ],
  "focus": {}
}
EOF

echo '{"entries":[]}' > "$LOG_FILE"

echo "Created test scenario with 3 active phases:"
echo "  1) setup - Initial Setup (order: 1, 1 task done)"
echo "  2) core - Core Development (order: 2, 1 task active)"
echo "  3) polish - Polish and Refinement (order: 3, 1 task pending)"
echo ""

# Run validate with --fix (interactive mode - will prompt)
echo "Running: claude-todo validate --fix"
echo ""
bash scripts/validate.sh --fix

echo ""
echo "=== Results ==="
echo ""

# Show which phase is now active
ACTIVE_PHASE=$(jq -r '.project.phases | to_entries[] | select(.value.status == "active") | .key' "$TODO_FILE")
echo "Active phase: $ACTIVE_PHASE"

# Show completed phases
COMPLETED_PHASES=$(jq -r '.project.phases | to_entries[] | select(.value.status == "completed") | .key' "$TODO_FILE" | tr '\n' ', ' | sed 's/,$//')
echo "Completed phases: $COMPLETED_PHASES"

# Show log entry
echo ""
echo "Log entry:"
jq -r '.entries[] | select(.action == "validation_run" and .details.fixType == "phase_conflict_resolution") | {fixType: .details.fixType, selectedPhase: .details.selectedPhase, resolutionMethod: .details.resolutionMethod}' "$LOG_FILE" 2>/dev/null || echo "No log entry found"

echo ""
echo "Test complete!"

#!/usr/bin/env bash
# CLAUDE-TODO Focus Management Script
# Manage task focus for single-task workflow
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_TODO_HOME="${CLAUDE_TODO_HOME:-$HOME/.claude-todo}"

# Source version
if [[ -f "$CLAUDE_TODO_HOME/VERSION" ]]; then
  VERSION="$(cat "$CLAUDE_TODO_HOME/VERSION" | tr -d '[:space:]')"
elif [[ -f "$SCRIPT_DIR/../VERSION" ]]; then
  VERSION="$(cat "$SCRIPT_DIR/../VERSION" | tr -d '[:space:]')"
else
  VERSION="0.1.0"
fi

# Source libraries
[[ -f "$CLAUDE_TODO_HOME/lib/logging.sh" ]] && source "$CLAUDE_TODO_HOME/lib/logging.sh"
[[ -f "$CLAUDE_TODO_HOME/lib/file-ops.sh" ]] && source "$CLAUDE_TODO_HOME/lib/file-ops.sh"

TODO_FILE="${TODO_FILE:-.claude/todo.json}"
# Note: LOG_FILE is set by lib/logging.sh (readonly) - don't reassign here
# If library wasn't sourced, set a fallback
if [[ -z "${LOG_FILE:-}" ]]; then
  LOG_FILE=".claude/todo-log.json"
fi

# Colors (respects NO_COLOR and FORCE_COLOR environment variables per https://no-color.org)
if declare -f should_use_color >/dev/null 2>&1 && should_use_color; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' NC=''
fi

log_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_step()    { echo -e "${BLUE}[FOCUS]${NC} $1"; }

usage() {
  cat << EOF
Usage: $(basename "$0") <command> [OPTIONS]

Manage task focus for single-task workflow.

Commands:
  set <task-id>   Set focus to a specific task (marks it active)
  clear           Clear current focus
  show            Show current focus
  note <text>     Set session note (progress/context)
  next <text>     Set suggested next action

Options:
  --json          Output in JSON format
  -h, --help      Show this help

Examples:
  $(basename "$0") set task_1733395200_abc123
  $(basename "$0") note "Completed API endpoints, working on tests"
  $(basename "$0") next "Write unit tests for auth module"
  $(basename "$0") clear
  $(basename "$0") show --json
EOF
  exit 0
}

# Check dependencies
if ! command -v jq &> /dev/null; then
  log_error "jq is required but not installed"
  exit 1
fi

# Check todo.json exists
check_todo_exists() {
  if [[ ! -f "$TODO_FILE" ]]; then
    log_error "Todo file not found: $TODO_FILE"
    log_error "Run 'claude-todo init' first"
    exit 1
  fi
}

# Get current timestamp
get_timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Log focus change
log_focus_change() {
  local old_task="$1"
  local new_task="$2"
  local action="${3:-focus_changed}"

  if [[ ! -f "$LOG_FILE" ]]; then
    return 0
  fi

  local timestamp
  timestamp=$(get_timestamp)
  local log_id
  log_id="log_$(head -c 6 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  local session_id
  session_id=$(jq -r '._meta.activeSession // ""' "$TODO_FILE")

  local before_json="null"
  local after_json="null"

  [[ -n "$old_task" ]] && before_json=$(jq -n --arg t "$old_task" '{currentTask: $t}')
  [[ -n "$new_task" ]] && after_json=$(jq -n --arg t "$new_task" '{currentTask: $t}')

  jq --arg id "$log_id" \
     --arg ts "$timestamp" \
     --arg sid "$session_id" \
     --arg action "$action" \
     --argjson before "$before_json" \
     --argjson after "$after_json" '
    .entries += [{
      id: $id,
      timestamp: $ts,
      sessionId: (if $sid == "" then null else $sid end),
      action: $action,
      actor: "claude",
      taskId: null,
      before: $before,
      after: $after,
      details: null
    }] |
    ._meta.totalEntries += 1 |
    ._meta.lastEntry = $ts
  ' "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
}

# Set focus to a task
cmd_set() {
  local task_id="${1:-}"

  if [[ -z "$task_id" ]]; then
    log_error "Task ID required"
    echo "Usage: $(basename "$0") set <task-id>"
    exit 1
  fi

  check_todo_exists

  # Verify task exists
  local task_exists
  task_exists=$(jq --arg id "$task_id" '[.tasks[] | select(.id == $id)] | length' "$TODO_FILE")

  if [[ "$task_exists" -eq 0 ]]; then
    log_error "Task not found: $task_id"
    exit 1
  fi

  # Get current focus for logging
  local old_focus
  old_focus=$(jq -r '.focus.currentTask // ""' "$TODO_FILE")

  # Check if there's already an active task (not this one)
  local active_count
  active_count=$(jq --arg id "$task_id" '[.tasks[] | select(.status == "active" and .id != $id)] | length' "$TODO_FILE")

  if [[ "$active_count" -gt 0 ]]; then
    log_warn "Another task is already active. Setting to pending first..."
    # Set other active tasks to pending
    jq --arg id "$task_id" '
      .tasks = [.tasks[] | if .status == "active" and .id != $id then .status = "pending" else . end]
    ' "$TODO_FILE" > "${TODO_FILE}.tmp" && mv "${TODO_FILE}.tmp" "$TODO_FILE"
  fi

  local timestamp
  timestamp=$(get_timestamp)

  # Set focus and mark task as active
  jq --arg id "$task_id" --arg ts "$timestamp" '
    .focus.currentTask = $id |
    ._meta.lastModified = $ts |
    .tasks = [.tasks[] | if .id == $id then .status = "active" else . end]
  ' "$TODO_FILE" > "${TODO_FILE}.tmp" && mv "${TODO_FILE}.tmp" "$TODO_FILE"

  # Log the focus change
  log_focus_change "$old_focus" "$task_id"

  # Get task title for display
  local task_title
  task_title=$(jq -r --arg id "$task_id" '.tasks[] | select(.id == $id) | .content // .title // "Unknown"' "$TODO_FILE")

  log_step "Focus set: $task_title"
  log_info "Task ID: $task_id"
  log_info "Status: active"
}

# Clear focus
cmd_clear() {
  check_todo_exists

  local old_focus
  old_focus=$(jq -r '.focus.currentTask // ""' "$TODO_FILE")

  if [[ -z "$old_focus" ]]; then
    log_info "No focus to clear"
    exit 0
  fi

  local timestamp
  timestamp=$(get_timestamp)

  # Clear focus (but don't change task status - user should complete or explicitly change)
  jq --arg ts "$timestamp" '
    .focus.currentTask = null |
    ._meta.lastModified = $ts
  ' "$TODO_FILE" > "${TODO_FILE}.tmp" && mv "${TODO_FILE}.tmp" "$TODO_FILE"

  # Log the focus change
  log_focus_change "$old_focus" ""

  log_step "Focus cleared"
  log_info "Previous focus: $old_focus"
}

# Show current focus
cmd_show() {
  local json_output=false

  while [[ $# -gt 0 ]]; do
    case $1 in
      --json) json_output=true; shift ;;
      *) shift ;;
    esac
  done

  check_todo_exists

  if [[ "$json_output" == "true" ]]; then
    jq '.focus' "$TODO_FILE"
  else
    local current_task
    local session_note
    local next_action

    current_task=$(jq -r '.focus.currentTask // ""' "$TODO_FILE")
    session_note=$(jq -r '.focus.sessionNote // ""' "$TODO_FILE")
    next_action=$(jq -r '.focus.nextAction // ""' "$TODO_FILE")

    echo ""
    echo "=== Current Focus ==="

    if [[ -n "$current_task" ]]; then
      local task_title
      local task_status
      task_title=$(jq -r --arg id "$current_task" '.tasks[] | select(.id == $id) | .content // .title // "Unknown"' "$TODO_FILE")
      task_status=$(jq -r --arg id "$current_task" '.tasks[] | select(.id == $id) | .status // "unknown"' "$TODO_FILE")
      echo -e "Task: ${GREEN}$task_title${NC}"
      echo "  ID: $current_task"
      echo "  Status: $task_status"
    else
      echo -e "Task: ${YELLOW}None${NC}"
    fi

    echo ""
    if [[ -n "$session_note" ]]; then
      echo "Session Note: $session_note"
    else
      echo "Session Note: (not set)"
    fi

    if [[ -n "$next_action" ]]; then
      echo "Next Action: $next_action"
    else
      echo "Next Action: (not set)"
    fi
    echo ""
  fi
}

# Set session note
cmd_note() {
  local note="${1:-}"

  if [[ -z "$note" ]]; then
    log_error "Note text required"
    echo "Usage: $(basename "$0") note \"Your progress note\""
    exit 1
  fi

  check_todo_exists

  local timestamp
  timestamp=$(get_timestamp)

  jq --arg note "$note" --arg ts "$timestamp" '
    .focus.sessionNote = $note |
    ._meta.lastModified = $ts
  ' "$TODO_FILE" > "${TODO_FILE}.tmp" && mv "${TODO_FILE}.tmp" "$TODO_FILE"

  log_step "Session note updated"
  log_info "$note"
}

# Set next action
cmd_next() {
  local action="${1:-}"

  if [[ -z "$action" ]]; then
    log_error "Action text required"
    echo "Usage: $(basename "$0") next \"Suggested next action\""
    exit 1
  fi

  check_todo_exists

  local timestamp
  timestamp=$(get_timestamp)

  jq --arg action "$action" --arg ts "$timestamp" '
    .focus.nextAction = $action |
    ._meta.lastModified = $ts
  ' "$TODO_FILE" > "${TODO_FILE}.tmp" && mv "${TODO_FILE}.tmp" "$TODO_FILE"

  log_step "Next action set"
  log_info "$action"
}

# Main command dispatch
COMMAND="${1:-show}"
shift || true

case "$COMMAND" in
  set)    cmd_set "$@" ;;
  clear)  cmd_clear "$@" ;;
  show)   cmd_show "$@" ;;
  note)   cmd_note "$@" ;;
  next)   cmd_next "$@" ;;
  -h|--help|help) usage ;;
  *)
    log_error "Unknown command: $COMMAND"
    echo "Run '$(basename "$0") --help' for usage"
    exit 1
    ;;
esac

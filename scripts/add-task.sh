#!/usr/bin/env bash
# CLAUDE-TODO Add Task Script
# Add new task to todo.json with validation and logging
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TODO_FILE="${TODO_FILE:-.claude/todo.json}"
CONFIG_FILE="${CONFIG_FILE:-.claude/todo-config.json}"
LOG_FILE="${LOG_FILE:-.claude/todo-log.json}"

# Source logging library for should_use_color function
LIB_DIR="${SCRIPT_DIR}/../lib"
if [[ -f "$LIB_DIR/logging.sh" ]]; then
  # shellcheck source=../lib/logging.sh
  source "$LIB_DIR/logging.sh"
fi

# Colors (respects NO_COLOR and FORCE_COLOR environment variables per https://no-color.org)
if declare -f should_use_color >/dev/null 2>&1 && should_use_color; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' NC=''
fi

# Defaults
STATUS="pending"
PRIORITY="medium"
DESCRIPTION=""
LABELS=""
PHASE=""
FILES=""
ACCEPTANCE=""
DEPENDS=""
NOTES=""
QUIET=false

usage() {
  cat << 'EOF'
Usage: add-task.sh "Task Title" [OPTIONS]

Add a new task to todo.json with validation.

Arguments:
  TITLE                 Task title (required, action-oriented)

Options:
  -s, --status STATUS       Task status (pending|active|blocked|done)
                            Default: pending
  -p, --priority PRIORITY   Task priority (critical|high|medium|low)
                            Default: medium
  -d, --description DESC    Detailed description
  -l, --labels LABELS       Comma-separated labels (e.g., bug,security)
  -P, --phase PHASE         Phase slug (must exist in phases)
      --files FILES         Comma-separated file paths
      --acceptance CRITERIA Comma-separated acceptance criteria
  -D, --depends IDS         Comma-separated task IDs (e.g., T001,T002)
      --notes NOTE          Initial note entry
  -q, --quiet               Suppress messages, output only task ID
  -h, --help                Show this help

Examples:
  add-task.sh "Implement authentication"
  add-task.sh "Fix login bug" -p high -l bug,security
  add-task.sh "Add tests" -D T001,T002 -P testing
  add-task.sh "Implement auth" --acceptance "User can login,Session persists"
  add-task.sh "Quick task" -q  # Outputs only: T042

Exit Codes:
  0 = Success
  1 = Invalid arguments or validation failure
  2 = File operation failure
EOF
  exit 0
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_warn() {
  if [[ "$QUIET" != "true" ]]; then
    echo -e "${YELLOW}[WARN]${NC} $1"
  fi
}

log_info() {
  if [[ "$QUIET" != "true" ]]; then
    echo -e "${GREEN}[INFO]${NC} $1"
  fi
}

check_deps() {
  if ! command -v jq &> /dev/null; then
    log_error "jq is required but not installed"
    echo "Install: sudo apt-get install jq  # Debian/Ubuntu" >&2
    echo "         brew install jq          # macOS" >&2
    exit 1
  fi
}

# Generate unique task ID
generate_task_id() {
  local existing_ids
  existing_ids=$(jq -r '[.tasks[].id] | @json' "$TODO_FILE" 2>/dev/null || echo '[]')

  local max_id
  max_id=$(echo "$existing_ids" | jq -r '.[] | ltrimstr("T") | tonumber' | sort -n | tail -1)

  if [[ -z "$max_id" ]] || [[ "$max_id" == "null" ]]; then
    max_id=0
  fi

  local next_id=$((max_id + 1))
  printf "T%03d" "$next_id"
}

# Validate task title
validate_title() {
  local title="$1"

  if [[ -z "$title" ]]; then
    log_error "Task title cannot be empty"
    return 1
  fi

  if [[ ${#title} -gt 120 ]]; then
    log_error "Task title too long (max 120 chars, got ${#title})"
    return 1
  fi

  # Check for duplicate title (warning only)
  if [[ -f "$TODO_FILE" ]]; then
    local duplicate_count
    duplicate_count=$(jq --arg title "$title" '[.tasks[] | select(.title == $title)] | length' "$TODO_FILE")
    if [[ "$duplicate_count" -gt 0 ]]; then
      log_warn "Duplicate title detected: '$title' already exists"
    fi
  fi

  return 0
}

# Validate status
validate_status() {
  local status="$1"
  case "$status" in
    pending|active|blocked|done)
      return 0
      ;;
    *)
      log_error "Invalid status: $status (must be pending|active|blocked|done)"
      return 1
      ;;
  esac
}

# Validate priority
validate_priority() {
  local priority="$1"
  case "$priority" in
    critical|high|medium|low)
      return 0
      ;;
    *)
      log_error "Invalid priority: $priority (must be critical|high|medium|low)"
      return 1
      ;;
  esac
}

# Validate phase exists
validate_phase() {
  local phase="$1"

  if [[ -z "$phase" ]]; then
    return 0  # Phase is optional
  fi

  if ! [[ "$phase" =~ ^[a-z][a-z0-9-]*$ ]]; then
    log_error "Invalid phase format: $phase (must be lowercase alphanumeric with hyphens)"
    return 1
  fi

  # Check if phase exists in todo.json
  if [[ -f "$TODO_FILE" ]]; then
    local phase_exists
    phase_exists=$(jq --arg phase "$phase" '.phases | has($phase)' "$TODO_FILE")
    if [[ "$phase_exists" != "true" ]]; then
      log_error "Phase '$phase' not found in phases definition"
      return 1
    fi
  fi

  return 0
}

# Validate labels format
validate_labels() {
  local labels="$1"

  if [[ -z "$labels" ]]; then
    return 0
  fi

  IFS=',' read -ra label_array <<< "$labels"
  for label in "${label_array[@]}"; do
    label=$(echo "$label" | xargs)  # Trim whitespace
    if ! [[ "$label" =~ ^[a-z][a-z0-9.-]*$ ]]; then
      log_error "Invalid label format: '$label' (must be lowercase alphanumeric with hyphens/periods, e.g., bug, v0.5.0)"
      return 1
    fi
  done

  return 0
}

# Validate dependency IDs exist
validate_depends() {
  local depends="$1"

  if [[ -z "$depends" ]]; then
    return 0
  fi

  if [[ ! -f "$TODO_FILE" ]]; then
    log_error "Cannot validate dependencies: $TODO_FILE not found"
    return 1
  fi

  IFS=',' read -ra dep_array <<< "$depends"
  local existing_ids
  existing_ids=$(jq -r '[.tasks[].id] | @json' "$TODO_FILE")

  for dep_id in "${dep_array[@]}"; do
    dep_id=$(echo "$dep_id" | xargs)  # Trim whitespace

    if ! [[ "$dep_id" =~ ^T[0-9]{3,}$ ]]; then
      log_error "Invalid dependency ID format: '$dep_id' (must be T### format)"
      return 1
    fi

    local exists
    exists=$(echo "$existing_ids" | jq --arg id "$dep_id" 'index($id) != null')
    if [[ "$exists" != "true" ]]; then
      log_error "Dependency task not found: $dep_id"
      return 1
    fi
  done

  return 0
}

# Atomic file write with backup
atomic_write() {
  local file="$1"
  local content="$2"
  local backup_dir=".claude/.backups"

  # Create backup directory if needed
  if [[ ! -d "$backup_dir" ]]; then
    mkdir -p "$backup_dir" || {
      log_error "Failed to create backup directory: $backup_dir"
      return 1
    }
  fi

  # Backup existing file
  if [[ -f "$file" ]]; then
    local backup_file="${backup_dir}/$(basename "$file").$(date +%s).bak"
    cp "$file" "$backup_file" || {
      log_error "Failed to create backup: $backup_file"
      return 1
    }

    # Keep only last 10 backups
    local backup_count
    backup_count=$(find "$backup_dir" -name "$(basename "$file").*.bak" | wc -l)
    if [[ "$backup_count" -gt 10 ]]; then
      find "$backup_dir" -name "$(basename "$file").*.bak" -type f | sort | head -n -10 | xargs rm -f
    fi
  fi

  # Write to temp file
  local temp_file="${file}.tmp"
  echo "$content" > "$temp_file" || {
    log_error "Failed to write temp file: $temp_file"
    return 1
  }

  # Validate JSON
  if ! jq empty "$temp_file" 2>/dev/null; then
    log_error "Generated invalid JSON"
    rm -f "$temp_file"
    return 1
  fi

  # Atomic move
  mv "$temp_file" "$file" || {
    log_error "Failed to move temp file to $file"
    rm -f "$temp_file"
    return 1
  }

  return 0
}

# Update checksum
update_checksum() {
  local file="$1"
  local checksum
  checksum=$(jq -c '.tasks' "$file" | sha256sum | cut -c1-16)

  local updated_content
  updated_content=$(jq --arg cs "$checksum" '._meta.checksum = $cs' "$file")

  atomic_write "$file" "$updated_content"
}

# Log operation to todo-log.json
log_operation() {
  local operation="$1"
  local task_id="$2"
  local details="$3"

  if [[ ! -f "$LOG_FILE" ]]; then
    echo '{"entries":[]}' > "$LOG_FILE"
  fi

  local log_id
  log_id="log-$(date +%s)-$(openssl rand -hex 3 2>/dev/null || echo $RANDOM)"

  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local log_entry
  log_entry=$(jq -n \
    --arg id "$log_id" \
    --arg ts "$timestamp" \
    --arg op "$operation" \
    --arg task_id "$task_id" \
    --argjson details "$details" \
    '{
      id: $id,
      timestamp: $ts,
      operation: $op,
      task_id: $task_id,
      user: "system",
      details: $details,
      before: null,
      after: $details
    }')

  local updated_log
  updated_log=$(jq --argjson entry "$log_entry" '.entries += [$entry]' "$LOG_FILE")

  echo "$updated_log" > "$LOG_FILE"
}

# Parse arguments
TITLE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    -s|--status)
      STATUS="$2"
      shift 2
      ;;
    -p|--priority)
      PRIORITY="$2"
      shift 2
      ;;
    -d|--description)
      DESCRIPTION="$2"
      shift 2
      ;;
    -l|--labels)
      LABELS="$2"
      shift 2
      ;;
    -P|--phase)
      PHASE="$2"
      shift 2
      ;;
    --files)
      FILES="$2"
      shift 2
      ;;
    --acceptance)
      ACCEPTANCE="$2"
      shift 2
      ;;
    -D|--depends)
      DEPENDS="$2"
      shift 2
      ;;
    --notes)
      NOTES="$2"
      shift 2
      ;;
    -q|--quiet)
      QUIET=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    -*)
      log_error "Unknown option: $1"
      echo "Use --help for usage information" >&2
      exit 1
      ;;
    *)
      if [[ -z "$TITLE" ]]; then
        TITLE="$1"
      else
        log_error "Multiple titles provided. Quote the title if it contains spaces."
        exit 1
      fi
      shift
      ;;
  esac
done

# Main execution
check_deps

# Validate required arguments
if [[ -z "$TITLE" ]]; then
  log_error "Task title is required"
  echo "Usage: add-task.sh \"Task Title\" [OPTIONS]" >&2
  echo "Use --help for more information" >&2
  exit 1
fi

# Validate inputs
validate_title "$TITLE" || exit 1
validate_status "$STATUS" || exit 1
validate_priority "$PRIORITY" || exit 1
validate_phase "$PHASE" || exit 1
validate_labels "$LABELS" || exit 1
validate_depends "$DEPENDS" || exit 1

# Check if blocked status has blocker reason
if [[ "$STATUS" == "blocked" ]] && [[ -z "$DESCRIPTION" ]]; then
  log_error "Blocked tasks require --description to specify blocker reason"
  exit 1
fi

# Check if todo.json exists
if [[ ! -f "$TODO_FILE" ]]; then
  log_error "Todo file not found: $TODO_FILE"
  echo "Run init.sh first to initialize the todo system" >&2
  exit 1
fi

# Check if active status and there's already an active task
if [[ "$STATUS" == "active" ]]; then
  active_count=$(jq '[.tasks[] | select(.status == "active")] | length' "$TODO_FILE")
  if [[ "$active_count" -gt 0 ]]; then
    log_error "Cannot create active task: only ONE active task allowed"
    echo "Current active task: $(jq -r '[.tasks[] | select(.status == "active")][0].id' "$TODO_FILE")" >&2
    exit 1
  fi
fi

# Generate task ID
TASK_ID=$(generate_task_id)
log_info "Generated task ID: $TASK_ID"

# Create timestamp
CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Build task object
TASK_JSON=$(jq -n \
  --arg id "$TASK_ID" \
  --arg title "$TITLE" \
  --arg status "$STATUS" \
  --arg priority "$PRIORITY" \
  --arg created "$CREATED_AT" \
  '{
    id: $id,
    title: $title,
    status: $status,
    priority: $priority,
    createdAt: $created
  }')

# Add optional fields
if [[ -n "$PHASE" ]]; then
  TASK_JSON=$(echo "$TASK_JSON" | jq --arg phase "$PHASE" '.phase = $phase')
fi

if [[ -n "$DESCRIPTION" ]]; then
  TASK_JSON=$(echo "$TASK_JSON" | jq --arg desc "$DESCRIPTION" '.description = $desc')
fi

if [[ -n "$LABELS" ]]; then
  IFS=',' read -ra label_array <<< "$LABELS"
  labels_json=$(printf '%s\n' "${label_array[@]}" | jq -R . | jq -s 'map(gsub("^\\s+|\\s+$";""))')
  TASK_JSON=$(echo "$TASK_JSON" | jq --argjson labels "$labels_json" '.labels = $labels')
fi

if [[ -n "$FILES" ]]; then
  IFS=',' read -ra files_array <<< "$FILES"
  files_json=$(printf '%s\n' "${files_array[@]}" | jq -R . | jq -s 'map(gsub("^\\s+|\\s+$";""))')
  TASK_JSON=$(echo "$TASK_JSON" | jq --argjson files "$files_json" '.files = $files')
fi

if [[ -n "$ACCEPTANCE" ]]; then
  IFS=',' read -ra acc_array <<< "$ACCEPTANCE"
  acc_json=$(printf '%s\n' "${acc_array[@]}" | jq -R . | jq -s 'map(gsub("^\\s+|\\s+$";""))')
  TASK_JSON=$(echo "$TASK_JSON" | jq --argjson acc "$acc_json" '.acceptance = $acc')
fi

if [[ -n "$DEPENDS" ]]; then
  IFS=',' read -ra dep_array <<< "$DEPENDS"
  dep_json=$(printf '%s\n' "${dep_array[@]}" | jq -R . | jq -s 'map(gsub("^\\s+|\\s+$";""))')
  TASK_JSON=$(echo "$TASK_JSON" | jq --argjson deps "$dep_json" '.depends = $deps')
fi

if [[ -n "$NOTES" ]]; then
  timestamp_note="$(date -u +"%Y-%m-%d %H:%M:%S UTC"): $NOTES"
  TASK_JSON=$(echo "$TASK_JSON" | jq --arg note "$timestamp_note" '.notes = [$note]')
fi

if [[ "$STATUS" == "blocked" ]]; then
  TASK_JSON=$(echo "$TASK_JSON" | jq --arg reason "$DESCRIPTION" '.blockedBy = $reason')
fi

if [[ "$STATUS" == "done" ]]; then
  TASK_JSON=$(echo "$TASK_JSON" | jq --arg completed "$CREATED_AT" '.completedAt = $completed')
fi

# Add task to todo.json
UPDATED_TODO=$(jq --argjson task "$TASK_JSON" '.tasks += [$task] | .lastUpdated = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))' "$TODO_FILE")

# Write atomically
if ! atomic_write "$TODO_FILE" "$UPDATED_TODO"; then
  log_error "Failed to write todo file"
  exit 2
fi

# Update checksum
update_checksum "$TODO_FILE"

# Log operation
task_details=$(jq -n \
  --arg title "$TITLE" \
  --arg status "$STATUS" \
  --arg priority "$PRIORITY" \
  '{title: $title, status: $status, priority: $priority}')
log_operation "create" "$TASK_ID" "$task_details"

# Success output
if [[ "$QUIET" == "true" ]]; then
  echo "$TASK_ID"
else
  log_info "Task added successfully"
  echo ""
  echo "Task ID: $TASK_ID"
  echo "Title: $TITLE"
  echo "Status: $STATUS"
  echo "Priority: $PRIORITY"
  [[ -n "$PHASE" ]] && echo "Phase: $PHASE"
  [[ -n "$LABELS" ]] && echo "Labels: $LABELS"
  [[ -n "$DEPENDS" ]] && echo "Depends: $DEPENDS"
  echo ""
  echo "View with: jq '.tasks[] | select(.id == \"$TASK_ID\")' $TODO_FILE"
fi

exit 0

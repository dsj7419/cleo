#!/bin/bash
# =============================================================================
# export.sh - Export tasks to various formats
# =============================================================================
# Exports claude-todo tasks to different formats, primarily TodoWrite format
# for Claude Code integration.
#
# Usage:
#   claude-todo export --format todowrite
#   claude-todo export --format todowrite --status active,pending
#   claude-todo export --format json
# =============================================================================

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(dirname "$SCRIPT_DIR")/lib"

# Source required libraries
source "$LIB_DIR/logging.sh"
source "$LIB_DIR/todowrite-integration.sh"

# Colors (respects NO_COLOR and FORCE_COLOR environment variables per https://no-color.org)
if declare -f should_use_color >/dev/null 2>&1 && should_use_color; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' NC=''
fi

# -----------------------------------------------------------------------------
# Default values
# -----------------------------------------------------------------------------
FORMAT="todowrite"
STATUS_FILTER="pending,active"
MAX_TASKS=10
TODO_FILE=".claude/todo.json"
OUTPUT_FILE=""
QUIET=false
DELIMITER=","
INCLUDE_HEADER=true

# -----------------------------------------------------------------------------
# Help text
# -----------------------------------------------------------------------------
show_help() {
    cat << 'EOF'
export.sh - Export tasks to various formats

USAGE
    claude-todo export [OPTIONS]

DESCRIPTION
    Exports claude-todo tasks to different formats for integration with
    external tools. Primary use case is exporting to TodoWrite format for
    Claude Code integration.

OPTIONS
    --format FORMAT      Output format: todowrite, json, markdown, csv, tsv (default: todowrite)
    --status STATUS      Comma-separated status filter (default: pending,active)
    --max N              Maximum tasks to export (default: 10)
    --output FILE        Write to file instead of stdout
    --delimiter CHAR     Custom delimiter for CSV (default: comma)
    --no-header          Skip header row in CSV/TSV output
    --quiet              Suppress informational messages
    -h, --help           Show this help

FORMATS
    todowrite    Claude Code TodoWrite format with content, activeForm, status
    json         Raw JSON array of tasks
    markdown     Markdown checklist format
    csv          RFC 4180 compliant CSV with quoted fields
    tsv          Tab-separated values (paste-friendly)

EXAMPLES
    # Export active tasks to TodoWrite format
    claude-todo export --format todowrite

    # Export only active tasks
    claude-todo export --format todowrite --status active

    # Export all pending/active tasks as markdown
    claude-todo export --format markdown --status pending,active

    # Export to file
    claude-todo export --format todowrite --output .claude/todowrite-tasks.json

    # Export as CSV
    claude-todo export --format csv --status pending,active,done

    # Export as TSV without header
    claude-todo export --format tsv --no-header

    # Custom CSV delimiter
    claude-todo export --format csv --delimiter ';'

STATUS VALUES
    pending     Ready to start
    active      Currently in progress
    blocked     Waiting on dependency
    done        Completed

TODOWRITE FORMAT
    The TodoWrite format is designed for Claude Code's ephemeral task tracking:

    {
      "todos": [
        {
          "content": "Implement authentication",
          "activeForm": "Implementing authentication",
          "status": "in_progress"
        }
      ]
    }

    Status mapping:
      pending  → pending
      active   → in_progress
      blocked  → pending (downgraded)
      done     → completed

GRAMMAR TRANSFORMATION
    The activeForm is automatically derived from the task title using
    grammar rules:

      "Implement X" → "Implementing X"
      "Fix bug"     → "Fixing bug"
      "Add feature" → "Adding feature"
      "Setup env"   → "Setting up env"

CSV/TSV FORMATS
    CSV Format (RFC 4180 compliant):
      - Header: id,status,priority,phase,title,createdAt,completedAt,labels
      - Fields are quoted to handle commas and special characters
      - Internal quotes escaped by doubling ("" for ")
      - Empty fields shown as ""
      - Labels joined with commas inside quotes

    Example CSV output:
      "T001","done","high","setup","Setup database","2025-12-08T10:00:00Z","2025-12-09T15:30:00Z","backend,db"
      "T002","active","high","core","Create user model","2025-12-09T11:00:00Z","","backend,api"

    TSV Format (tab-separated):
      - Tab character as delimiter
      - No quoting needed
      - Tabs in content replaced with spaces
      - Paste-friendly for spreadsheets

    Example TSV output:
      T001	done	high	setup	Setup database	2025-12-08T10:00:00Z	2025-12-09T15:30:00Z	backend,db
      T002	active	high	core	Create user model	2025-12-09T11:00:00Z		backend,api

EOF
}

# -----------------------------------------------------------------------------
# Parse arguments
# -----------------------------------------------------------------------------
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --format)
                FORMAT="${2:-todowrite}"
                shift 2
                ;;
            --status)
                STATUS_FILTER="${2:-pending,active}"
                shift 2
                ;;
            --max)
                MAX_TASKS="${2:-10}"
                shift 2
                ;;
            --output)
                OUTPUT_FILE="${2:-}"
                shift 2
                ;;
            --delimiter)
                DELIMITER="${2:-,}"
                shift 2
                ;;
            --no-header)
                INCLUDE_HEADER=false
                shift
                ;;
            --quiet)
                QUIET=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                echo -e "${RED}[ERROR]${NC} Unknown option: $1" >&2
                echo "Run 'claude-todo export --help' for usage." >&2
                exit 1
                ;;
        esac
    done
}

# -----------------------------------------------------------------------------
# Export to TodoWrite format
# -----------------------------------------------------------------------------
export_todowrite() {
    local todo_file="$1"
    local status_filter="$2"
    local max_tasks="$3"

    # Build jq filter for status
    local jq_status_filter=""
    IFS=',' read -ra statuses <<< "$status_filter"
    for s in "${statuses[@]}"; do
        s=$(echo "$s" | xargs)  # trim whitespace
        if [[ -n "$jq_status_filter" ]]; then
            jq_status_filter="${jq_status_filter} or "
        fi
        jq_status_filter="${jq_status_filter}.status == \"$s\""
    done

    # Extract matching tasks
    local tasks
    tasks=$(jq -c "[.tasks[] | select($jq_status_filter)] | .[0:$max_tasks]" "$todo_file")

    # Convert each task
    local todowrite_tasks="[]"
    while IFS= read -r task; do
        [[ -z "$task" ]] && continue

        local title=$(echo "$task" | jq -r '.title // ""')
        local status=$(echo "$task" | jq -r '.status // "pending"')

        local active_form=$(convert_to_active_form "$title")
        local todowrite_status=$(map_status_to_todowrite "$status")

        local todo_item=$(jq -n \
            --arg content "$title" \
            --arg activeForm "$active_form" \
            --arg status "$todowrite_status" \
            '{content: $content, activeForm: $activeForm, status: $status}')

        todowrite_tasks=$(echo "$todowrite_tasks" | jq --argjson item "$todo_item" '. + [$item]')
    done < <(echo "$tasks" | jq -c '.[]')

    # Output final format
    jq -n --argjson todos "$todowrite_tasks" '{todos: $todos}'
}

# -----------------------------------------------------------------------------
# Export to JSON format (raw tasks)
# -----------------------------------------------------------------------------
export_json() {
    local todo_file="$1"
    local status_filter="$2"
    local max_tasks="$3"

    # Build jq filter for status
    local jq_status_filter=""
    IFS=',' read -ra statuses <<< "$status_filter"
    for s in "${statuses[@]}"; do
        s=$(echo "$s" | xargs)
        if [[ -n "$jq_status_filter" ]]; then
            jq_status_filter="${jq_status_filter} or "
        fi
        jq_status_filter="${jq_status_filter}.status == \"$s\""
    done

    jq "[.tasks[] | select($jq_status_filter)] | .[0:$max_tasks]" "$todo_file"
}

# -----------------------------------------------------------------------------
# Export to Markdown format
# -----------------------------------------------------------------------------
export_markdown() {
    local todo_file="$1"
    local status_filter="$2"
    local max_tasks="$3"

    # Build jq filter for status
    local jq_status_filter=""
    IFS=',' read -ra statuses <<< "$status_filter"
    for s in "${statuses[@]}"; do
        s=$(echo "$s" | xargs)
        if [[ -n "$jq_status_filter" ]]; then
            jq_status_filter="${jq_status_filter} or "
        fi
        jq_status_filter="${jq_status_filter}.status == \"$s\""
    done

    # Extract matching tasks
    local tasks
    tasks=$(jq -c "[.tasks[] | select($jq_status_filter)] | .[0:$max_tasks]" "$todo_file")

    echo "## Tasks"
    echo ""

    while IFS= read -r task; do
        [[ -z "$task" ]] && continue

        local title=$(echo "$task" | jq -r '.title // ""')
        local status=$(echo "$task" | jq -r '.status // "pending"')
        local id=$(echo "$task" | jq -r '.id // ""')
        local priority=$(echo "$task" | jq -r '.priority // "medium"')

        local checkbox="[ ]"
        case "$status" in
            done) checkbox="[x]" ;;
            active) checkbox="[-]" ;;
            blocked) checkbox="[!]" ;;
        esac

        local priority_badge=""
        case "$priority" in
            critical) priority_badge=" **CRITICAL**" ;;
            high) priority_badge=" *high*" ;;
        esac

        echo "- ${checkbox} ${title}${priority_badge} (${id})"
    done < <(echo "$tasks" | jq -c '.[]')
}

# -----------------------------------------------------------------------------
# CSV Helper: Escape and quote field according to RFC 4180
# -----------------------------------------------------------------------------
csv_quote() {
    local value="$1"
    local delimiter="${2:-,}"

    # Empty value
    if [[ -z "$value" ]]; then
        echo '""'
        return
    fi

    # Check if quoting is needed (contains delimiter, quote, or newline)
    if [[ "$value" == *"$delimiter"* ]] || [[ "$value" == *'"'* ]] || [[ "$value" == *$'\n'* ]]; then
        # Escape internal quotes by doubling them
        value="${value//\"/\"\"}"
        echo "\"$value\""
    else
        # Quote anyway for consistency (RFC 4180 allows this)
        echo "\"$value\""
    fi
}

# -----------------------------------------------------------------------------
# Export to CSV format (RFC 4180 compliant)
# -----------------------------------------------------------------------------
export_csv() {
    local todo_file="$1"
    local status_filter="$2"
    local max_tasks="$3"
    local delimiter="${4:-,}"
    local include_header="${5:-true}"

    # Build jq filter for status
    local jq_status_filter=""
    IFS=',' read -ra statuses <<< "$status_filter"
    for s in "${statuses[@]}"; do
        s=$(echo "$s" | xargs)
        if [[ -n "$jq_status_filter" ]]; then
            jq_status_filter="${jq_status_filter} or "
        fi
        jq_status_filter="${jq_status_filter}.status == \"$s\""
    done

    # Extract matching tasks
    local tasks
    tasks=$(jq -c "[.tasks[] | select($jq_status_filter)] | .[0:$max_tasks]" "$todo_file")

    # Header row
    if [[ "$include_header" == "true" ]]; then
        # Quote header fields too for consistency
        printf "%s${delimiter}%s${delimiter}%s${delimiter}%s${delimiter}%s${delimiter}%s${delimiter}%s${delimiter}%s\n" \
            '"id"' '"status"' '"priority"' '"phase"' '"title"' '"createdAt"' '"completedAt"' '"labels"'
    fi

    # Data rows
    while IFS= read -r task; do
        [[ -z "$task" ]] && continue

        local id=$(echo "$task" | jq -r '.id // ""')
        local status=$(echo "$task" | jq -r '.status // ""')
        local priority=$(echo "$task" | jq -r '.priority // ""')
        local phase=$(echo "$task" | jq -r '.phase // ""')
        local title=$(echo "$task" | jq -r '.title // ""')
        local created_at=$(echo "$task" | jq -r '.createdAt // ""')
        local completed_at=$(echo "$task" | jq -r '.completedAt // ""')
        local labels=$(echo "$task" | jq -r '.labels // [] | join(",")')

        # Quote each field
        local id_quoted=$(csv_quote "$id" "$delimiter")
        local status_quoted=$(csv_quote "$status" "$delimiter")
        local priority_quoted=$(csv_quote "$priority" "$delimiter")
        local phase_quoted=$(csv_quote "$phase" "$delimiter")
        local title_quoted=$(csv_quote "$title" "$delimiter")
        local created_at_quoted=$(csv_quote "$created_at" "$delimiter")
        local completed_at_quoted=$(csv_quote "$completed_at" "$delimiter")
        local labels_quoted=$(csv_quote "$labels" "$delimiter")

        echo "${id_quoted}${delimiter}${status_quoted}${delimiter}${priority_quoted}${delimiter}${phase_quoted}${delimiter}${title_quoted}${delimiter}${created_at_quoted}${delimiter}${completed_at_quoted}${delimiter}${labels_quoted}"
    done < <(echo "$tasks" | jq -c '.[]')
}

# -----------------------------------------------------------------------------
# Export to TSV format (Tab-separated values)
# -----------------------------------------------------------------------------
export_tsv() {
    local todo_file="$1"
    local status_filter="$2"
    local max_tasks="$3"
    local include_header="${4:-true}"

    # Build jq filter for status
    local jq_status_filter=""
    IFS=',' read -ra statuses <<< "$status_filter"
    for s in "${statuses[@]}"; do
        s=$(echo "$s" | xargs)
        if [[ -n "$jq_status_filter" ]]; then
            jq_status_filter="${jq_status_filter} or "
        fi
        jq_status_filter="${jq_status_filter}.status == \"$s\""
    done

    # Extract matching tasks
    local tasks
    tasks=$(jq -c "[.tasks[] | select($jq_status_filter)] | .[0:$max_tasks]" "$todo_file")

    # Header row
    if [[ "$include_header" == "true" ]]; then
        printf "id\tstatus\tpriority\tphase\ttitle\tcreatedAt\tcompletedAt\tlabels\n"
    fi

    # Data rows
    while IFS= read -r task; do
        [[ -z "$task" ]] && continue

        local id=$(echo "$task" | jq -r '.id // ""')
        local status=$(echo "$task" | jq -r '.status // ""')
        local priority=$(echo "$task" | jq -r '.priority // ""')
        local phase=$(echo "$task" | jq -r '.phase // ""')
        local title=$(echo "$task" | jq -r '.title // ""')
        local created_at=$(echo "$task" | jq -r '.createdAt // ""')
        local completed_at=$(echo "$task" | jq -r '.completedAt // ""')
        local labels=$(echo "$task" | jq -r '.labels // [] | join(",")')

        # Replace tabs in content with spaces to avoid breaking TSV structure
        title="${title//$'\t'/ }"

        printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" \
            "$id" "$status" "$priority" "$phase" "$title" "$created_at" "$completed_at" "$labels"
    done < <(echo "$tasks" | jq -c '.[]')
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    parse_args "$@"

    # Check todo.json exists
    if [[ ! -f "$TODO_FILE" ]]; then
        echo -e "${RED}[ERROR]${NC} $TODO_FILE not found. Run 'claude-todo init' first." >&2
        exit 1
    fi

    # Validate format
    case "$FORMAT" in
        todowrite|json|markdown|csv|tsv) ;;
        *)
            echo -e "${RED}[ERROR]${NC} Unknown format: $FORMAT" >&2
            echo "Valid formats: todowrite, json, markdown, csv, tsv" >&2
            exit 1
            ;;
    esac

    # Count matching tasks
    local task_count
    local jq_status_filter=""
    IFS=',' read -ra statuses <<< "$STATUS_FILTER"
    for s in "${statuses[@]}"; do
        s=$(echo "$s" | xargs)
        if [[ -n "$jq_status_filter" ]]; then
            jq_status_filter="${jq_status_filter} or "
        fi
        jq_status_filter="${jq_status_filter}.status == \"$s\""
    done
    task_count=$(jq "[.tasks[] | select($jq_status_filter)] | length" "$TODO_FILE")

    if [[ "$QUIET" != "true" ]]; then
        echo -e "${BLUE}[EXPORT]${NC} Format: $FORMAT, Status: $STATUS_FILTER, Found: $task_count tasks" >&2
    fi

    # Generate output
    local output=""
    case "$FORMAT" in
        todowrite)
            output=$(export_todowrite "$TODO_FILE" "$STATUS_FILTER" "$MAX_TASKS")
            ;;
        json)
            output=$(export_json "$TODO_FILE" "$STATUS_FILTER" "$MAX_TASKS")
            ;;
        markdown)
            output=$(export_markdown "$TODO_FILE" "$STATUS_FILTER" "$MAX_TASKS")
            ;;
        csv)
            output=$(export_csv "$TODO_FILE" "$STATUS_FILTER" "$MAX_TASKS" "$DELIMITER" "$INCLUDE_HEADER")
            ;;
        tsv)
            output=$(export_tsv "$TODO_FILE" "$STATUS_FILTER" "$MAX_TASKS" "$INCLUDE_HEADER")
            ;;
    esac

    # Output to file or stdout
    if [[ -n "$OUTPUT_FILE" ]]; then
        echo "$output" > "$OUTPUT_FILE"
        if [[ "$QUIET" != "true" ]]; then
            echo -e "${GREEN}[INFO]${NC} Exported to $OUTPUT_FILE" >&2
        fi
    else
        echo "$output"
    fi
}

main "$@"

#!/usr/bin/env bash
# lib/output-format.sh - Shared output formatting functions
#
# Provides centralized output formatting utilities for claude-todo CLI:
# - Color and Unicode support detection
# - Terminal width detection
# - Format resolution with priority hierarchy
# - Status and priority formatting (colors, symbols)
# - Progress bars and box-drawing characters
# - Output helpers for colored text and formatted headers
#
# Version: 0.7.0
# Part of: claude-todo CLI Output Enhancement (Phase 1)

# ============================================================================
# FEATURE DETECTION
# ============================================================================

# detect_color_support - Check if color output is supported
#
# Priority order:
# 1. NO_COLOR env var -> disable colors (respects standard)
# 2. FORCE_COLOR env var -> enable colors
# 3. TTY check + tput colors >= 8 -> enable colors
#
# Returns: 0 if colors supported, 1 if not
detect_color_support() {
  # NO_COLOR standard takes precedence
  [[ -n "${NO_COLOR:-}" ]] && return 1

  # FORCE_COLOR override
  [[ -n "${FORCE_COLOR:-}" ]] && return 0

  # Check if stdout is a terminal and tput supports colors
  if [[ -t 1 ]] && command -v tput &>/dev/null; then
    local num_colors
    num_colors=$(tput colors 2>/dev/null || echo 0)
    [[ "$num_colors" -ge 8 ]] && return 0
  fi

  return 1
}

# detect_unicode_support - Check if Unicode/UTF-8 is supported
#
# Checks LANG and LC_ALL environment variables for UTF-8 encoding
#
# Returns: 0 if Unicode supported, 1 if not
detect_unicode_support() {
  [[ "${LANG:-}" =~ UTF-8 ]] || [[ "${LC_ALL:-}" =~ UTF-8 ]]
}

# get_terminal_width - Get current terminal width
#
# Priority order:
# 1. COLUMNS env var
# 2. tput cols
# 3. Default 80
#
# Returns: Terminal width in columns
get_terminal_width() {
  local width="${COLUMNS:-}"

  if [[ -z "$width" ]] && command -v tput &>/dev/null; then
    width=$(tput cols 2>/dev/null || echo "")
  fi

  # Default to 80 if still empty
  [[ -z "$width" ]] && width=80

  echo "$width"
}

# ============================================================================
# FORMAT RESOLUTION
# ============================================================================

# resolve_format - Determine output format with priority hierarchy
#
# Priority order (CLI > env > config > default):
# 1. CLI argument (highest priority)
# 2. CLAUDE_TODO_FORMAT environment variable
# 3. config.output.defaultFormat from todo-config.json
# 4. Default: "text"
#
# Args:
#   $1 - CLI format argument (optional)
#
# Returns: Resolved format name
resolve_format() {
  local cli_format="${1:-}"

  # CLI argument takes precedence
  [[ -n "$cli_format" ]] && echo "$cli_format" && return

  # Environment variable
  [[ -n "${CLAUDE_TODO_FORMAT:-}" ]] && echo "$CLAUDE_TODO_FORMAT" && return

  # Config file setting (if jq available and config exists)
  if command -v jq &>/dev/null && [[ -f ".claude/todo-config.json" ]]; then
    local config_format
    config_format=$(jq -r '.output.defaultFormat // empty' .claude/todo-config.json 2>/dev/null)
    [[ -n "$config_format" ]] && echo "$config_format" && return
  fi

  # Default fallback
  echo "text"
}

# ============================================================================
# STATUS FORMATTING
# ============================================================================

# status_color - Get ANSI color code for task status
#
# Color mapping:
# - pending: 37 (dim white)
# - active: 96 (bright cyan)
# - blocked: 33 (yellow)
# - done: 32 (green)
#
# Args:
#   $1 - Status value (pending|active|blocked|done)
#
# Returns: ANSI color code number
status_color() {
  local status="$1"

  case "$status" in
    pending) echo "37" ;;  # dim white
    active)  echo "96" ;;  # bright cyan
    blocked) echo "33" ;;  # yellow
    done)    echo "32" ;;  # green
    *)       echo "0"  ;;  # default/reset
  esac
}

# status_symbol - Get symbol for task status
#
# Unicode symbols:
# - pending: ○ (white circle)
# - active: ◉ (fisheye)
# - blocked: ⊗ (circled times)
# - done: ✓ (check mark)
#
# ASCII fallback:
# - pending: -
# - active: *
# - blocked: x
# - done: +
#
# Args:
#   $1 - Status value (pending|active|blocked|done)
#   $2 - Use unicode (true|false, default: true)
#
# Returns: Status symbol character
status_symbol() {
  local status="$1"
  local unicode="${2:-true}"

  if [[ "$unicode" == "true" ]]; then
    case "$status" in
      pending) echo "○" ;;
      active)  echo "◉" ;;
      blocked) echo "⊗" ;;
      done)    echo "✓" ;;
      *)       echo "?" ;;
    esac
  else
    case "$status" in
      pending) echo "-" ;;
      active)  echo "*" ;;
      blocked) echo "x" ;;
      done)    echo "+" ;;
      *)       echo "?" ;;
    esac
  fi
}

# ============================================================================
# PRIORITY FORMATTING
# ============================================================================

# priority_color - Get ANSI color code for task priority
#
# Color mapping:
# - critical: 91 (bright red)
# - high: 93 (bright yellow)
# - medium: 94 (bright blue)
# - low: 90 (bright black/dim gray)
#
# Args:
#   $1 - Priority value (critical|high|medium|low)
#
# Returns: ANSI color code number
priority_color() {
  local priority="$1"

  case "$priority" in
    critical) echo "91" ;;  # bright red
    high)     echo "93" ;;  # bright yellow
    medium)   echo "94" ;;  # bright blue
    low)      echo "90" ;;  # bright black (dim gray)
    *)        echo "0"  ;;  # default/reset
  esac
}

# priority_symbol - Get symbol for task priority
#
# Emoji symbols:
# - critical: 🔴 (red circle)
# - high: 🟡 (yellow circle)
# - medium: 🔵 (blue circle)
# - low: ⚪ (white circle)
#
# ASCII fallback:
# - critical: !
# - high: H
# - medium: M
# - low: L
#
# Args:
#   $1 - Priority value (critical|high|medium|low)
#   $2 - Use unicode (true|false, default: true)
#
# Returns: Priority symbol character(s)
priority_symbol() {
  local priority="$1"
  local unicode="${2:-true}"

  if [[ "$unicode" == "true" ]]; then
    case "$priority" in
      critical) echo "🔴" ;;
      high)     echo "🟡" ;;
      medium)   echo "🔵" ;;
      low)      echo "⚪" ;;
      *)        echo "⚫" ;;
    esac
  else
    case "$priority" in
      critical) echo "!" ;;
      high)     echo "H" ;;
      medium)   echo "M" ;;
      low)      echo "L" ;;
      *)        echo "?" ;;
    esac
  fi
}

# ============================================================================
# PROGRESS VISUALIZATION
# ============================================================================

# progress_bar - Generate ASCII progress bar
#
# Generates a progress bar like: [████████░░] 80%
#
# Uses:
# - Unicode filled: █ (U+2588 FULL BLOCK)
# - Unicode empty: ░ (U+2591 LIGHT SHADE)
# - ASCII fallback: = for filled, - for empty
#
# Args:
#   $1 - Current value
#   $2 - Total value
#   $3 - Bar width in characters (default: 20)
#   $4 - Use unicode (true|false, default: true)
#
# Returns: Formatted progress bar string
progress_bar() {
  local current="$1"
  local total="$2"
  local width="${3:-20}"
  local unicode="${4:-true}"

  # Avoid division by zero
  if [[ "$total" -eq 0 ]]; then
    if [[ "$unicode" == "true" ]]; then
      printf "[%s] %3d%%" "$(printf '░%.0s' $(seq 1 "$width"))" 0
    else
      printf "[%s] %3d%%" "$(printf -- '-%.0s' $(seq 1 "$width"))" 0
    fi
    return
  fi

  local percent=$((current * 100 / total))
  local filled=$((current * width / total))

  # Cap filled at width (prevents overflow at 100%)
  [[ "$filled" -gt "$width" ]] && filled=$width

  local empty=$((width - filled))

  # Ensure at least 0 and no negative values
  [[ "$filled" -lt 0 ]] && filled=0
  [[ "$empty" -lt 0 ]] && empty=0

  # Generate filled and empty portions
  local filled_str=""
  local empty_str=""

  if [[ "$unicode" == "true" ]]; then
    [[ "$filled" -gt 0 ]] && filled_str=$(printf '█%.0s' $(seq 1 "$filled"))
    [[ "$empty" -gt 0 ]] && empty_str=$(printf '░%.0s' $(seq 1 "$empty"))
    printf "[%s%s] %3d%%" "$filled_str" "$empty_str" "$percent"
  else
    [[ "$filled" -gt 0 ]] && filled_str=$(printf '=%.0s' $(seq 1 "$filled"))
    [[ "$empty" -gt 0 ]] && empty_str=$(printf -- '-%.0s' $(seq 1 "$empty"))
    printf "[%s%s] %3d%%" "$filled_str" "$empty_str" "$percent"
  fi
}

# ============================================================================
# BOX DRAWING
# ============================================================================

# draw_box - Return box-drawing characters
#
# Unicode box-drawing:
# - TL: ╭ (U+256D BOX DRAWINGS LIGHT ARC DOWN AND RIGHT)
# - TR: ╮ (U+256E BOX DRAWINGS LIGHT ARC DOWN AND LEFT)
# - BL: ╰ (U+2570 BOX DRAWINGS LIGHT ARC UP AND RIGHT)
# - BR: ╯ (U+256F BOX DRAWINGS LIGHT ARC UP AND LEFT)
# - H: ─ (U+2500 BOX DRAWINGS LIGHT HORIZONTAL)
# - V: │ (U+2502 BOX DRAWINGS LIGHT VERTICAL)
#
# ASCII fallback:
# - Corners: +
# - Horizontal: -
# - Vertical: |
#
# Args:
#   $1 - Character type: TL|TR|BL|BR|H|V
#   $2 - Use unicode (true|false, default: true)
#
# Returns: Box-drawing character
draw_box() {
  local type="$1"
  local unicode="${2:-true}"

  if [[ "$unicode" == "true" ]]; then
    case "$type" in
      TL) echo "╭" ;;
      TR) echo "╮" ;;
      BL) echo "╰" ;;
      BR) echo "╯" ;;
      H)  echo "─" ;;
      V)  echo "│" ;;
      *)  echo "?" ;;
    esac
  else
    case "$type" in
      TL|TR|BL|BR) echo "+" ;;
      H)           echo "-" ;;
      V)           echo "|" ;;
      *)           echo "?" ;;
    esac
  fi
}

# ============================================================================
# OUTPUT HELPERS
# ============================================================================

# print_colored - Print text with ANSI color if supported
#
# Args:
#   $1 - Color code (ANSI number, e.g., 32 for green)
#   $2 - Text to print
#   $3 - Newline (true|false, default: true)
#
# Returns: Colored text (or plain if colors disabled)
print_colored() {
  local color="$1"
  local text="$2"
  local newline="${3:-true}"

  local output=""

  if detect_color_support; then
    output="\033[${color}m${text}\033[0m"
  else
    output="$text"
  fi

  if [[ "$newline" == "true" ]]; then
    echo -e "$output"
  else
    echo -ne "$output"
  fi
}

# print_header - Print section header with box drawing
#
# Generates a header like:
# ╭─────────────────────────╮
# │  📊 Section Title       │
# ╰─────────────────────────╯
#
# Args:
#   $1 - Header text
#   $2 - Width (default: terminal width or 60)
#   $3 - Use unicode (true|false, default: auto-detect)
#
# Returns: Formatted header block
print_header() {
  local text="$1"
  local width="${2:-}"
  local unicode="${3:-}"

  # Auto-detect width
  if [[ -z "$width" ]]; then
    width=$(get_terminal_width)
    # Cap at reasonable max
    [[ "$width" -gt 80 ]] && width=80
  fi

  # Auto-detect unicode
  if [[ -z "$unicode" ]]; then
    detect_unicode_support && unicode="true" || unicode="false"
  fi

  # Get box characters
  local TL=$(draw_box TL "$unicode")
  local TR=$(draw_box TR "$unicode")
  local BL=$(draw_box BL "$unicode")
  local BR=$(draw_box BR "$unicode")
  local H=$(draw_box H "$unicode")
  local V=$(draw_box V "$unicode")

  # Calculate padding
  local text_len=${#text}
  local inner_width=$((width - 4))  # Account for borders and padding
  local padding_total=$((inner_width - text_len))
  local padding_right=$padding_total

  # Ensure non-negative padding
  [[ "$padding_right" -lt 0 ]] && padding_right=0

  # Build horizontal line
  local hline=""
  for ((i=0; i<width-2; i++)); do
    hline="${hline}${H}"
  done

  # Print header
  echo "${TL}${hline}${TR}"
  printf "%s  %s%*s%s\n" "$V" "$text" "$padding_right" "" "$V"
  echo "${BL}${hline}${BR}"
}

# print_task_line - Format single task line with status and colors
#
# Generates output like:
# ◉ [T003] Implement authentication (high)
#
# Args:
#   $1 - Task ID
#   $2 - Task status
#   $3 - Task priority
#   $4 - Task title
#   $5 - Use unicode (true|false, default: auto-detect)
#
# Returns: Formatted task line
print_task_line() {
  local task_id="$1"
  local status="$2"
  local priority="$3"
  local title="$4"
  local unicode="${5:-}"

  # Auto-detect unicode
  if [[ -z "$unicode" ]]; then
    detect_unicode_support && unicode="true" || unicode="false"
  fi

  # Get symbols and colors
  local status_sym=$(status_symbol "$status" "$unicode")
  local status_col=$(status_color "$status")
  local priority_col=$(priority_color "$priority")

  # Build output
  local output=""

  if detect_color_support; then
    # Colored output
    output="\033[${status_col}m${status_sym}\033[0m "
    output+="[\033[1m${task_id}\033[0m] "
    output+="\033[${priority_col}m${title}\033[0m"
    output+=" (\033[${priority_col}m${priority}\033[0m)"
  else
    # Plain output
    output="${status_sym} [${task_id}] ${title} (${priority})"
  fi

  echo -e "$output"
}

# ============================================================================
# EXPORTS
# ============================================================================

# Export all functions for sourcing by other scripts
export -f detect_color_support
export -f detect_unicode_support
export -f get_terminal_width
export -f resolve_format
export -f status_color
export -f status_symbol
export -f priority_color
export -f priority_symbol
export -f progress_bar
export -f draw_box
export -f print_colored
export -f print_header
export -f print_task_line

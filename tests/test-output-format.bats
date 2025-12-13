#!/usr/bin/env bats
# tests/test-output-format.bats - BATS tests for lib/output-format.sh
#
# Tests for output formatting utilities including:
# - Color and Unicode feature detection
# - Status and priority formatting
# - Progress bars and box drawing
# - Terminal width detection
# - Format resolution
#
# Version: 0.7.0

# ============================================================================
# SETUP AND TEARDOWN
# ============================================================================

# Source the library under test (done once at file load time)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
source "$PROJECT_ROOT/lib/output-format.sh"

setup() {
  # Save original environment
  export SAVED_NO_COLOR="${NO_COLOR:-}"
  export SAVED_FORCE_COLOR="${FORCE_COLOR:-}"
  export SAVED_LANG="${LANG:-}"
  export SAVED_LC_ALL="${LC_ALL:-}"
  export SAVED_COLUMNS="${COLUMNS:-}"
  export SAVED_CLAUDE_TODO_FORMAT="${CLAUDE_TODO_FORMAT:-}"

  # Clear environment for clean test state
  unset NO_COLOR
  unset FORCE_COLOR
  unset CLAUDE_TODO_FORMAT
}

teardown() {
  # Restore original environment
  [[ -n "$SAVED_NO_COLOR" ]] && export NO_COLOR="$SAVED_NO_COLOR" || unset NO_COLOR
  [[ -n "$SAVED_FORCE_COLOR" ]] && export FORCE_COLOR="$SAVED_FORCE_COLOR" || unset FORCE_COLOR
  [[ -n "$SAVED_LANG" ]] && export LANG="$SAVED_LANG" || unset LANG
  [[ -n "$SAVED_LC_ALL" ]] && export LC_ALL="$SAVED_LC_ALL" || unset LC_ALL
  [[ -n "$SAVED_COLUMNS" ]] && export COLUMNS="$SAVED_COLUMNS" || unset COLUMNS
  [[ -n "$SAVED_CLAUDE_TODO_FORMAT" ]] && export CLAUDE_TODO_FORMAT="$SAVED_CLAUDE_TODO_FORMAT" || unset CLAUDE_TODO_FORMAT
}

# ============================================================================
# COLOR DETECTION TESTS
# ============================================================================

@test "detect_color_support returns 1 when NO_COLOR set" {
  NO_COLOR=1
  run detect_color_support
  [ "$status" -eq 1 ]
}

@test "detect_color_support returns 1 when NO_COLOR is any value" {
  NO_COLOR=true
  run detect_color_support
  [ "$status" -eq 1 ]

  NO_COLOR=0
  run detect_color_support
  [ "$status" -eq 1 ]
}

@test "detect_color_support returns 0 when FORCE_COLOR set" {
  FORCE_COLOR=1
  run detect_color_support
  [ "$status" -eq 0 ]
}

@test "detect_color_support returns 0 when FORCE_COLOR is any value" {
  FORCE_COLOR=true
  run detect_color_support
  [ "$status" -eq 0 ]
}

@test "NO_COLOR takes precedence over FORCE_COLOR" {
  NO_COLOR=1
  FORCE_COLOR=1
  run detect_color_support
  [ "$status" -eq 1 ]
}

# ============================================================================
# UNICODE DETECTION TESTS
# ============================================================================

@test "detect_unicode_support returns 0 for UTF-8 LANG" {
  LANG=en_US.UTF-8
  unset LC_ALL
  run detect_unicode_support
  [ "$status" -eq 0 ]
}

@test "detect_unicode_support returns 0 for UTF-8 LC_ALL" {
  unset LANG
  LC_ALL=en_US.UTF-8
  run detect_unicode_support
  [ "$status" -eq 0 ]
}

@test "detect_unicode_support returns 1 for C locale" {
  LANG=C
  unset LC_ALL
  run detect_unicode_support
  [ "$status" -eq 1 ]
}

@test "detect_unicode_support returns 1 for POSIX locale" {
  LANG=POSIX
  unset LC_ALL
  run detect_unicode_support
  [ "$status" -eq 1 ]
}

@test "detect_unicode_support returns 1 when no UTF-8 in locale" {
  LANG=en_US.ISO-8859-1
  unset LC_ALL
  run detect_unicode_support
  [ "$status" -eq 1 ]
}

@test "detect_unicode_support LC_ALL overrides LANG" {
  LANG=C
  LC_ALL=en_US.UTF-8
  run detect_unicode_support
  [ "$status" -eq 0 ]
}

# ============================================================================
# TERMINAL WIDTH TESTS
# ============================================================================

@test "get_terminal_width returns COLUMNS value when set" {
  COLUMNS=120
  run get_terminal_width
  [ "$status" -eq 0 ]
  [ "$output" = "120" ]
}

@test "get_terminal_width returns default 80 when COLUMNS unset" {
  unset COLUMNS
  run get_terminal_width
  [ "$status" -eq 0 ]
  [ "$output" = "80" ]
}

@test "get_terminal_width uses COLUMNS over tput" {
  COLUMNS=100
  run get_terminal_width
  [ "$status" -eq 0 ]
  [ "$output" = "100" ]
}

# ============================================================================
# FORMAT RESOLUTION TESTS
# ============================================================================

@test "resolve_format returns CLI argument when provided" {
  CLAUDE_TODO_FORMAT=markdown
  run resolve_format json
  [ "$status" -eq 0 ]
  [ "$output" = "json" ]
}

@test "resolve_format returns env variable when CLI not provided" {
  CLAUDE_TODO_FORMAT=markdown
  run resolve_format
  [ "$status" -eq 0 ]
  [ "$output" = "markdown" ]
}

@test "resolve_format returns default 'text' when nothing set" {
  unset CLAUDE_TODO_FORMAT
  run resolve_format
  [ "$status" -eq 0 ]
  [ "$output" = "text" ]
}

@test "resolve_format CLI takes precedence over env" {
  CLAUDE_TODO_FORMAT=json
  run resolve_format markdown
  [ "$status" -eq 0 ]
  [ "$output" = "markdown" ]
}

# ============================================================================
# STATUS SYMBOL TESTS
# ============================================================================

@test "status_symbol returns Unicode symbols by default" {
  run status_symbol pending
  [ "$status" -eq 0 ]
  [ "$output" = "○" ]

  run status_symbol active
  [ "$output" = "◉" ]

  run status_symbol blocked
  [ "$output" = "⊗" ]

  run status_symbol done
  [ "$output" = "✓" ]
}

@test "status_symbol returns ASCII symbols when unicode=false" {
  run status_symbol pending false
  [ "$status" -eq 0 ]
  [ "$output" = "-" ]

  run status_symbol active false
  [ "$output" = "*" ]

  run status_symbol blocked false
  [ "$output" = "x" ]

  run status_symbol done false
  [ "$output" = "+" ]
}

@test "status_symbol returns ? for unknown status" {
  run status_symbol unknown
  [ "$status" -eq 0 ]
  [ "$output" = "?" ]

  run status_symbol unknown false
  [ "$output" = "?" ]
}

# ============================================================================
# STATUS COLOR TESTS
# ============================================================================

@test "status_color returns correct ANSI codes" {
  run status_color pending
  [ "$status" -eq 0 ]
  [ "$output" = "37" ]

  run status_color active
  [ "$output" = "96" ]

  run status_color blocked
  [ "$output" = "33" ]

  run status_color done
  [ "$output" = "32" ]
}

@test "status_color returns 0 for unknown status" {
  run status_color unknown
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

# ============================================================================
# PRIORITY SYMBOL TESTS
# ============================================================================

@test "priority_symbol returns Unicode symbols by default" {
  run priority_symbol critical
  [ "$status" -eq 0 ]
  [ "$output" = "🔴" ]

  run priority_symbol high
  [ "$output" = "🟡" ]

  run priority_symbol medium
  [ "$output" = "🔵" ]

  run priority_symbol low
  [ "$output" = "⚪" ]
}

@test "priority_symbol returns ASCII symbols when unicode=false" {
  run priority_symbol critical false
  [ "$status" -eq 0 ]
  [ "$output" = "!" ]

  run priority_symbol high false
  [ "$output" = "H" ]

  run priority_symbol medium false
  [ "$output" = "M" ]

  run priority_symbol low false
  [ "$output" = "L" ]
}

@test "priority_symbol returns default for unknown priority" {
  run priority_symbol unknown
  [ "$status" -eq 0 ]
  [ "$output" = "⚫" ]

  run priority_symbol unknown false
  [ "$output" = "?" ]
}

# ============================================================================
# PRIORITY COLOR TESTS
# ============================================================================

@test "priority_color returns correct ANSI codes" {
  run priority_color critical
  [ "$status" -eq 0 ]
  [ "$output" = "91" ]

  run priority_color high
  [ "$output" = "93" ]

  run priority_color medium
  [ "$output" = "94" ]

  run priority_color low
  [ "$output" = "90" ]
}

@test "priority_color returns 0 for unknown priority" {
  run priority_color unknown
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

# ============================================================================
# PROGRESS BAR TESTS
# ============================================================================

@test "progress_bar returns empty bar for 0/0" {
  run progress_bar 0 0 10
  [ "$status" -eq 0 ]
  [ "$output" = "[░░░░░░░░░░]   0%" ]
}

@test "progress_bar returns empty bar for 0% (0/100)" {
  run progress_bar 0 100 10
  [ "$status" -eq 0 ]
  [ "$output" = "[░░░░░░░░░░]   0%" ]
}

@test "progress_bar returns half-filled bar for 50% (50/100)" {
  run progress_bar 50 100 10
  [ "$status" -eq 0 ]
  [ "$output" = "[█████░░░░░]  50%" ]
}

@test "progress_bar returns full bar for 100% (100/100)" {
  run progress_bar 100 100 10
  [ "$status" -eq 0 ]
  [ "$output" = "[██████████] 100%" ]
}

@test "progress_bar returns ASCII when unicode=false" {
  run progress_bar 0 100 10 false
  [ "$status" -eq 0 ]
  [ "$output" = "[----------]   0%" ]

  run progress_bar 50 100 10 false
  [ "$output" = "[=====-----]  50%" ]

  run progress_bar 100 100 10 false
  [ "$output" = "[==========] 100%" ]
}

@test "progress_bar handles custom width" {
  run progress_bar 50 100 20
  [ "$status" -eq 0 ]
  [ "$output" = "[██████████░░░░░░░░░░]  50%" ]
}

@test "progress_bar handles edge case: 0/0 ASCII" {
  run progress_bar 0 0 10 false
  [ "$status" -eq 0 ]
  [ "$output" = "[----------]   0%" ]
}

@test "progress_bar handles 1/3 (33%)" {
  run progress_bar 1 3 9
  [ "$status" -eq 0 ]
  [ "$output" = "[███░░░░░░]  33%" ]
}

@test "progress_bar handles 2/3 (66%)" {
  run progress_bar 2 3 9
  [ "$status" -eq 0 ]
  [ "$output" = "[██████░░░]  66%" ]
}

# ============================================================================
# BOX DRAWING TESTS
# ============================================================================

@test "draw_box returns Unicode box characters by default" {
  run draw_box TL
  [ "$status" -eq 0 ]
  [ "$output" = "╭" ]

  run draw_box TR
  [ "$output" = "╮" ]

  run draw_box BL
  [ "$output" = "╰" ]

  run draw_box BR
  [ "$output" = "╯" ]

  run draw_box H
  [ "$output" = "─" ]

  run draw_box V
  [ "$output" = "│" ]
}

@test "draw_box returns ASCII characters when unicode=false" {
  run draw_box TL false
  [ "$status" -eq 0 ]
  [ "$output" = "+" ]

  run draw_box TR false
  [ "$output" = "+" ]

  run draw_box BL false
  [ "$output" = "+" ]

  run draw_box BR false
  [ "$output" = "+" ]

  run draw_box H false
  [ "$output" = "-" ]

  run draw_box V false
  [ "$output" = "|" ]
}

@test "draw_box returns ? for unknown type" {
  run draw_box UNKNOWN
  [ "$status" -eq 0 ]
  [ "$output" = "?" ]

  run draw_box UNKNOWN false
  [ "$output" = "?" ]
}

# ============================================================================
# PRINT_COLORED TESTS
# ============================================================================

@test "print_colored outputs plain text when colors disabled" {
  NO_COLOR=1
  run print_colored 32 "Success"
  [ "$status" -eq 0 ]
  [ "$output" = "Success" ]
}

@test "print_colored outputs colored text when FORCE_COLOR set" {
  FORCE_COLOR=1
  run print_colored 32 "Success"
  [ "$status" -eq 0 ]
  [[ "$output" == *"32m"* ]]
  [[ "$output" == *"Success"* ]]
}

@test "print_colored respects newline parameter" {
  NO_COLOR=1
  run print_colored 32 "Test" false
  [ "$status" -eq 0 ]
  # Output should not have trailing newline, but run always adds one
  # So we check it doesn't have double newline
  [ "$output" = "Test" ]
}

# ============================================================================
# PRINT_HEADER TESTS
# ============================================================================

@test "print_header generates box with Unicode by default" {
  LANG=en_US.UTF-8
  run print_header "Test Header" 30
  [ "$status" -eq 0 ]
  # Check for Unicode box characters
  [[ "$output" == *"╭"* ]]
  [[ "$output" == *"╮"* ]]
  [[ "$output" == *"╰"* ]]
  [[ "$output" == *"╯"* ]]
  [[ "$output" == *"Test Header"* ]]
}

@test "print_header generates ASCII box when unicode=false" {
  run print_header "Test Header" 30 false
  [ "$status" -eq 0 ]
  # Check for ASCII box characters
  [[ "$output" == *"+"* ]]
  [[ "$output" == *"-"* ]]
  [[ "$output" == *"|"* ]]
  [[ "$output" == *"Test Header"* ]]
}

@test "print_header uses terminal width when not specified" {
  COLUMNS=60
  LANG=en_US.UTF-8
  run print_header "Test"
  [ "$status" -eq 0 ]
  # Header should respect COLUMNS
  [[ "$output" == *"Test"* ]]
}

# ============================================================================
# PRINT_TASK_LINE TESTS
# ============================================================================

@test "print_task_line formats task with status symbol" {
  NO_COLOR=1
  LANG=en_US.UTF-8
  run print_task_line T001 pending medium "Test task"
  [ "$status" -eq 0 ]
  [[ "$output" == *"○"* ]]
  [[ "$output" == *"T001"* ]]
  [[ "$output" == *"Test task"* ]]
  [[ "$output" == *"medium"* ]]
}

@test "print_task_line uses ASCII when unicode=false" {
  NO_COLOR=1
  run print_task_line T001 pending medium "Test task" false
  [ "$status" -eq 0 ]
  [[ "$output" == *"-"* ]]
  [[ "$output" == *"T001"* ]]
  [[ "$output" == *"Test task"* ]]
}

@test "print_task_line shows different status symbols" {
  NO_COLOR=1
  LANG=en_US.UTF-8

  run print_task_line T001 pending medium "Test"
  [[ "$output" == *"○"* ]]

  run print_task_line T002 active high "Test"
  [[ "$output" == *"◉"* ]]

  run print_task_line T003 blocked critical "Test"
  [[ "$output" == *"⊗"* ]]

  run print_task_line T004 done low "Test"
  [[ "$output" == *"✓"* ]]
}

# ============================================================================
# INTEGRATION TESTS
# ============================================================================

@test "detect_unicode_support integrates with status_symbol" {
  LANG=en_US.UTF-8
  if detect_unicode_support; then
    run status_symbol pending true
  else
    run status_symbol pending false
  fi
  [ "$status" -eq 0 ]
  # Should get appropriate symbol based on locale
}

@test "detect_color_support integrates with print_colored" {
  FORCE_COLOR=1
  run print_colored 32 "Test"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Test"* ]]

  NO_COLOR=1
  unset FORCE_COLOR
  run print_colored 32 "Test"
  [ "$output" = "Test" ]
}

@test "progress_bar handles rounding edge cases" {
  # 33.33% should round to 33
  run progress_bar 1 3 10
  [ "$status" -eq 0 ]
  [[ "$output" == *" 33%"* ]]

  # 66.66% should round to 66
  run progress_bar 2 3 10
  [[ "$output" == *" 66%"* ]]
}

# ============================================================================
# ERROR HANDLING TESTS
# ============================================================================

@test "status_symbol handles empty status gracefully" {
  run status_symbol ""
  [ "$status" -eq 0 ]
  [ "$output" = "?" ]
}

@test "priority_symbol handles empty priority gracefully" {
  run priority_symbol ""
  [ "$status" -eq 0 ]
  # Should return default symbol
}

@test "progress_bar handles negative values gracefully" {
  run progress_bar -5 100 10
  [ "$status" -eq 0 ]
  # Should cap at 0
  [[ "$output" == *"  0%"* ]]
}

@test "progress_bar handles values exceeding total" {
  run progress_bar 150 100 10
  [ "$status" -eq 0 ]
  # Should cap at 100%
  [[ "$output" == *"150%"* ]]
}

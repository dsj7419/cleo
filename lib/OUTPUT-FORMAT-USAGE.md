# Output Format Library Usage

Quick reference for using `lib/output-format.sh` in claude-todo scripts.

## Sourcing the Library

```bash
#!/usr/bin/env bash
source "$(dirname "$0")/../lib/output-format.sh"

# All functions are now available
```

## Feature Detection

### Color Support

```bash
if detect_color_support; then
  echo "Terminal supports colors"
else
  echo "No color support (NO_COLOR set or not a TTY)"
fi
```

**Respects:**
- `NO_COLOR` environment variable (disables colors)
- `FORCE_COLOR` environment variable (forces colors)
- TTY detection
- `tput colors` capability

### Unicode Support

```bash
if detect_unicode_support; then
  echo "UTF-8 encoding available"
else
  echo "Use ASCII fallbacks"
fi
```

**Checks:** `LANG` and `LC_ALL` for UTF-8

### Terminal Width

```bash
width=$(get_terminal_width)
echo "Terminal is $width columns wide"
```

**Priority:** `COLUMNS` env var → `tput cols` → default 80

## Format Resolution

```bash
# Resolves: CLI > env > config > default
format=$(resolve_format "$cli_arg")

# Examples:
resolve_format ""        # → "text" (default)
resolve_format "json"    # → "json" (CLI takes precedence)

export CLAUDE_TODO_FORMAT="csv"
resolve_format ""        # → "csv" (env var)
resolve_format "json"    # → "json" (CLI still wins)
```

## Status Formatting

### Status Colors

```bash
# Get ANSI color code
color=$(status_color "active")  # → "96" (bright cyan)

# Available statuses:
#   pending → 37 (dim white)
#   active  → 96 (bright cyan)
#   blocked → 33 (yellow)
#   done    → 32 (green)
```

### Status Symbols

```bash
# Unicode symbols
sym=$(status_symbol "active" true)   # → "◉"

# ASCII fallback
sym=$(status_symbol "active" false)  # → "*"

# Symbol mapping:
#   pending: ○ / -
#   active:  ◉ / *
#   blocked: ⊗ / x
#   done:    ✓ / +
```

## Priority Formatting

### Priority Colors

```bash
color=$(priority_color "high")  # → "93" (bright yellow)

# Available priorities:
#   critical → 91 (bright red)
#   high     → 93 (bright yellow)
#   medium   → 94 (bright blue)
#   low      → 90 (bright black/dim gray)
```

### Priority Symbols

```bash
# Emoji symbols
sym=$(priority_symbol "critical" true)   # → "🔴"

# ASCII fallback
sym=$(priority_symbol "critical" false)  # → "!"

# Symbol mapping:
#   critical: 🔴 / !
#   high:     🟡 / H
#   medium:   🔵 / M
#   low:      ⚪ / L
```

## Progress Bars

```bash
# progress_bar <current> <total> <width> <unicode>

# Unicode progress bar
progress_bar 7 10 20 true
# → [██████████████░░░░░]  70%

# ASCII progress bar
progress_bar 7 10 20 false
# → [==============------]  70%

# Edge cases handled:
progress_bar 0 0 20 true    # → [░░░░░░░░░░░░░░░░░░░░]   0%
progress_bar 10 10 20 true  # → [████████████████████] 100%
```

## Box Drawing

```bash
# draw_box <type> <unicode>
# Types: TL, TR, BL, BR, H, V

# Unicode box
TL=$(draw_box TL true)  # → "╭"
H=$(draw_box H true)    # → "─"
V=$(draw_box V true)    # → "│"

# ASCII box
TL=$(draw_box TL false) # → "+"
H=$(draw_box H false)   # → "-"
V=$(draw_box V false)   # → "|"

# Building a box:
TL=$(draw_box TL true)
TR=$(draw_box TR true)
BL=$(draw_box BL true)
BR=$(draw_box BR true)
H=$(draw_box H true)
V=$(draw_box V true)

echo "${TL}${H}${H}${H}${TR}"
echo "${V}   ${V}"
echo "${BL}${H}${H}${H}${BR}"
```

## Output Helpers

### Colored Text

```bash
# print_colored <color> <text> <newline>

print_colored 32 "Success!" true     # Green with newline
print_colored 91 "Error!" true       # Bright red with newline
print_colored 33 "Warning" false     # Yellow without newline

# Respects NO_COLOR - automatically disables if not supported
```

### Headers

```bash
# print_header <text> <width> <unicode>

print_header "My Section" 60 true
# Output:
# ╭──────────────────────────────────────────────────────────╮
# │  My Section                                              │
# ╰──────────────────────────────────────────────────────────╯

# Auto-detect width and unicode:
print_header "Auto Header"
# Uses terminal width (capped at 80) and detects unicode support
```

### Task Lines

```bash
# print_task_line <id> <status> <priority> <title> <unicode>

print_task_line "T001" "active" "high" "Implement auth" true
# Output (with colors if supported):
# ◉ [T001] Implement auth (high)

# Auto-detect unicode:
print_task_line "T002" "pending" "medium" "Add tests"
# Uses detect_unicode_support() automatically
```

## Complete Example

```bash
#!/usr/bin/env bash
source lib/output-format.sh

# Print header
print_header "📊 Task Summary" 70

echo ""

# Print tasks with symbols and colors
print_task_line "T001" "done" "high" "Setup database"
print_task_line "T002" "active" "high" "Implement auth"
print_task_line "T003" "pending" "medium" "Add tests"
print_task_line "T004" "blocked" "low" "Documentation"

echo ""

# Show progress
echo -n "Overall progress: "
progress_bar 15 20 30 true
echo ""

# Box with custom content
unicode=$(detect_unicode_support && echo true || echo false)
TL=$(draw_box TL "$unicode")
TR=$(draw_box TR "$unicode")
BL=$(draw_box BL "$unicode")
BR=$(draw_box BR "$unicode")
H=$(draw_box H "$unicode")
V=$(draw_box V "$unicode")

# Build horizontal line
hline=""
for i in {1..40}; do hline="${hline}${H}"; done

echo ""
echo "${TL}${hline}${TR}"
echo "${V} Summary: 15/20 tasks completed (75%)     ${V}"
echo "${BL}${hline}${BR}"
```

## Environment Variables

| Variable | Effect |
|----------|--------|
| `NO_COLOR` | Disable all ANSI colors |
| `FORCE_COLOR` | Force enable colors even if not TTY |
| `CLAUDE_TODO_FORMAT` | Default output format (text/json/csv/etc) |
| `COLUMNS` | Override terminal width detection |
| `LANG` / `LC_ALL` | Used for UTF-8 detection |

## Testing Your Output

```bash
# Test without colors
NO_COLOR=1 ./your-script.sh

# Test with forced colors
FORCE_COLOR=1 ./your-script.sh

# Test with narrow terminal
COLUMNS=40 ./your-script.sh

# Test ASCII-only mode
LANG=C ./your-script.sh
```

## Error Handling

All functions handle edge cases:
- Division by zero in progress bars
- Negative values clamped to 0
- Missing config files (defaults used)
- Missing jq (fallback behavior)
- Non-UTF8 environments (ASCII fallback)

## Performance Notes

- Feature detection results are not cached (call once and store if needed)
- Box drawing character generation is fast (simple case statements)
- Progress bar uses shell arithmetic (no external commands)
- Format resolution calls jq only if file exists (minimal overhead)

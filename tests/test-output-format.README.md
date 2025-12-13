# Output Format Library Tests

BATS test suite for `lib/output-format.sh` - comprehensive tests for output formatting utilities.

## Prerequisites

Install BATS (Bash Automated Testing System):

```bash
# Fedora/RHEL
sudo dnf install bats

# Ubuntu/Debian
sudo apt-get install bats

# macOS
brew install bats-core

# Manual installation
git clone https://github.com/bats-core/bats-core.git
cd bats-core
sudo ./install.sh /usr/local
```

## Running Tests

```bash
# Run all output-format tests
bats tests/test-output-format.bats

# Run with verbose output
bats -t tests/test-output-format.bats

# Run specific test
bats -f "detect_color_support" tests/test-output-format.bats
```

## Test Coverage

### 1. Color Detection Tests (6 tests)
- `detect_color_support returns 1 when NO_COLOR set`
- `detect_color_support returns 1 when NO_COLOR is any value`
- `detect_color_support returns 0 when FORCE_COLOR set`
- `detect_color_support returns 0 when FORCE_COLOR is any value`
- `NO_COLOR takes precedence over FORCE_COLOR`

### 2. Unicode Detection Tests (6 tests)
- `detect_unicode_support returns 0 for UTF-8 LANG`
- `detect_unicode_support returns 0 for UTF-8 LC_ALL`
- `detect_unicode_support returns 1 for C locale`
- `detect_unicode_support returns 1 for POSIX locale`
- `detect_unicode_support returns 1 when no UTF-8 in locale`
- `detect_unicode_support LC_ALL overrides LANG`

### 3. Terminal Width Tests (3 tests)
- `get_terminal_width returns COLUMNS value when set`
- `get_terminal_width returns default 80 when COLUMNS unset`
- `get_terminal_width uses COLUMNS over tput`

### 4. Format Resolution Tests (4 tests)
- `resolve_format returns CLI argument when provided`
- `resolve_format returns env variable when CLI not provided`
- `resolve_format returns default 'text' when nothing set`
- `resolve_format CLI takes precedence over env`

### 5. Status Symbol Tests (3 tests)
- `status_symbol returns Unicode symbols by default`
- `status_symbol returns ASCII symbols when unicode=false`
- `status_symbol returns ? for unknown status`

### 6. Status Color Tests (2 tests)
- `status_color returns correct ANSI codes`
- `status_color returns 0 for unknown status`

### 7. Priority Symbol Tests (3 tests)
- `priority_symbol returns Unicode symbols by default`
- `priority_symbol returns ASCII symbols when unicode=false`
- `priority_symbol returns default for unknown priority`

### 8. Priority Color Tests (2 tests)
- `priority_color returns correct ANSI codes`
- `priority_color returns 0 for unknown priority`

### 9. Progress Bar Tests (11 tests)
- `progress_bar returns empty bar for 0/0`
- `progress_bar returns empty bar for 0% (0/100)`
- `progress_bar returns half-filled bar for 50% (50/100)`
- `progress_bar returns full bar for 100% (100/100)`
- `progress_bar returns ASCII when unicode=false`
- `progress_bar handles custom width`
- `progress_bar handles edge case: 0/0 ASCII`
- `progress_bar handles 1/3 (33%)`
- `progress_bar handles 2/3 (66%)`

### 10. Box Drawing Tests (3 tests)
- `draw_box returns Unicode box characters by default`
- `draw_box returns ASCII characters when unicode=false`
- `draw_box returns ? for unknown type`

### 11. Print Colored Tests (3 tests)
- `print_colored outputs plain text when colors disabled`
- `print_colored outputs colored text when FORCE_COLOR set`
- `print_colored respects newline parameter`

### 12. Print Header Tests (3 tests)
- `print_header generates box with Unicode by default`
- `print_header generates ASCII box when unicode=false`
- `print_header uses terminal width when not specified`

### 13. Print Task Line Tests (3 tests)
- `print_task_line formats task with status symbol`
- `print_task_line uses ASCII when unicode=false`
- `print_task_line shows different status symbols`

### 14. Integration Tests (3 tests)
- `detect_unicode_support integrates with status_symbol`
- `detect_color_support integrates with print_colored`
- `progress_bar handles rounding edge cases`

### 15. Error Handling Tests (4 tests)
- `status_symbol handles empty status gracefully`
- `priority_symbol handles empty priority gracefully`
- `progress_bar handles negative values gracefully`
- `progress_bar handles values exceeding total`

## Total Test Count: 61 tests

## Test Organization

Tests are organized by function category:
1. Feature Detection (color, unicode, terminal)
2. Format Resolution
3. Symbol Formatting (status, priority)
4. Visual Elements (progress bars, box drawing)
5. Output Helpers (colored text, headers, task lines)
6. Integration tests
7. Error handling

## Expected Output

```
 ✓ detect_color_support returns 1 when NO_COLOR set
 ✓ detect_color_support returns 1 when NO_COLOR is any value
 ✓ detect_color_support returns 0 when FORCE_COLOR set
 ...
61 tests, 0 failures
```

## Troubleshooting

### BATS not found
Ensure BATS is installed and in PATH. See Prerequisites section.

### Tests fail due to terminal capabilities
Some tests require terminal features (tput, colors). Run in actual terminal, not CI without TTY.

### Unicode tests fail
Set proper locale: `export LANG=en_US.UTF-8`

## Continuous Integration

Add to CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Install BATS
  run: |
    git clone https://github.com/bats-core/bats-core.git
    cd bats-core
    sudo ./install.sh /usr/local

- name: Run output format tests
  run: bats tests/test-output-format.bats
```

## Coverage Report

Generate coverage with shellcheck:

```bash
shellcheck lib/output-format.sh
```

## Related Files

- `lib/output-format.sh` - Library under test
- `tests/fixtures/` - Test data fixtures
- `tests/run-all-tests.sh` - Test runner script

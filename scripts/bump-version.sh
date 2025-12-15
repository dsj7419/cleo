#!/usr/bin/env bash
# bump-version.sh - Single command to bump version everywhere
#
# Usage:
#   ./scripts/bump-version.sh 0.12.6
#   ./scripts/bump-version.sh patch   # 0.12.5 -> 0.12.6
#   ./scripts/bump-version.sh minor   # 0.12.5 -> 0.13.0
#   ./scripts/bump-version.sh major   # 0.12.5 -> 1.0.0

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
VERSION_FILE="$PROJECT_ROOT/VERSION"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

usage() {
    cat << 'EOF'
Usage: bump-version.sh <version|patch|minor|major>

Arguments:
  <version>   Explicit version (e.g., 0.12.6)
  patch       Increment patch version (0.12.5 -> 0.12.6)
  minor       Increment minor version (0.12.5 -> 0.13.0)
  major       Increment major version (0.12.5 -> 1.0.0)

This script updates:
  - VERSION file (source of truth)
  - README.md badge
  - templates/CLAUDE-INJECTION.md version tag

After running, you should:
  1. Update CHANGELOG.md with changes
  2. Commit and push
  3. Run ./install.sh to install new version
EOF
    exit 1
}

# Get current version
get_current_version() {
    if [[ -f "$VERSION_FILE" ]]; then
        cat "$VERSION_FILE" | tr -d '[:space:]'
    else
        echo "0.0.0"
    fi
}

# Calculate new version based on bump type
calculate_version() {
    local current="$1"
    local bump_type="$2"

    local major minor patch
    IFS='.' read -r major minor patch <<< "$current"

    case "$bump_type" in
        patch)
            echo "$major.$minor.$((patch + 1))"
            ;;
        minor)
            echo "$major.$((minor + 1)).0"
            ;;
        major)
            echo "$((major + 1)).0.0"
            ;;
        *)
            # Explicit version provided
            echo "$bump_type"
            ;;
    esac
}

# Validate version format
validate_version() {
    local version="$1"
    if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log_error "Invalid version format: $version (expected X.Y.Z)"
        exit 1
    fi
}

# Main
if [[ $# -lt 1 ]] || [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
    usage
fi

NEW_VERSION="$1"
CURRENT_VERSION=$(get_current_version)

# Handle bump types
case "$NEW_VERSION" in
    patch|minor|major)
        NEW_VERSION=$(calculate_version "$CURRENT_VERSION" "$NEW_VERSION")
        ;;
esac

validate_version "$NEW_VERSION"

echo "Bumping version: $CURRENT_VERSION -> $NEW_VERSION"
echo ""

# 1. Update VERSION file
echo "$NEW_VERSION" > "$VERSION_FILE"
log_info "Updated VERSION file"

# 2. Update README badge
README_FILE="$PROJECT_ROOT/README.md"
if [[ -f "$README_FILE" ]]; then
    if grep -q "version-[0-9]\+\.[0-9]\+\.[0-9]\+-" "$README_FILE"; then
        sed -i "s/version-[0-9]\+\.[0-9]\+\.[0-9]\+-/version-${NEW_VERSION}-/g" "$README_FILE"
        log_info "Updated README.md badge"
    else
        log_warn "Version badge pattern not found in README.md"
    fi
fi

# 3. Update CLAUDE-INJECTION.md template
INJECTION_TEMPLATE="$PROJECT_ROOT/templates/CLAUDE-INJECTION.md"
if [[ -f "$INJECTION_TEMPLATE" ]]; then
    if grep -q "CLAUDE-TODO:START v[0-9]\+\.[0-9]\+\.[0-9]\+" "$INJECTION_TEMPLATE"; then
        sed -i "s/CLAUDE-TODO:START v[0-9]\+\.[0-9]\+\.[0-9]\+/CLAUDE-TODO:START v${NEW_VERSION}/g" "$INJECTION_TEMPLATE"
        log_info "Updated CLAUDE-INJECTION.md template"
    else
        log_warn "Version tag not found in CLAUDE-INJECTION.md"
    fi
fi

echo ""
echo "Version bumped to $NEW_VERSION"
echo ""
echo "Next steps:"
echo "  1. Update CHANGELOG.md with changes for v$NEW_VERSION"
echo "  2. git add -A && git commit -m 'chore: Bump to v$NEW_VERSION'"
echo "  3. ./install.sh --force"
echo "  4. git push origin main"

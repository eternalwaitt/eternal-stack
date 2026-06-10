#!/usr/bin/env bash
set -Eeuo pipefail

TARGET="${CLAUDE_HOME:-$HOME/.claude}"
printf 'This script does not delete files automatically.\n'
printf 'Restore a backup with: %s/scripts/rollback-local.sh <backup-dir>\n' "$TARGET"


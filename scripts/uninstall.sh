#!/usr/bin/env bash
set -Eeuo pipefail

# Intentional no-op: this script never deletes installed files.
# Removing the stack from a Claude home is an owner decision, so uninstall
# stays manual. Automatic deletion is deliberately out of scope here to avoid
# clobbering local settings, agents, rules, or skills the owner still wants.
#
# To roll back to a pre-install state, restore the backup produced by
# scripts/install.sh with scripts/rollback-local.sh (see below).
# To remove files by hand, delete the installed paths under $TARGET (Claude home)
# and $CODEX_TARGET (Codex home) yourself — install.sh writes to both.

TARGET="${CLAUDE_HOME:-$HOME/.claude}"
CODEX_TARGET="${CODEX_HOME:-$HOME/.codex}"
printf 'No-op: this script does not delete or modify any installed files.\n'
printf 'Uninstalling is a manual, owner-driven step. To roll back the last install,\n'
printf 'restore its backup with: %s/scripts/rollback-local.sh <backup-dir>\n' "$TARGET"
printf 'Installs write to both the Claude home (%s) and the Codex home (%s);\n' "$TARGET" "$CODEX_TARGET"
printf 'remove installed paths under each home to uninstall by hand.\n'


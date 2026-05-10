#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${CLAUDE_HOME:-$HOME/.claude}"
BACKUP="${1:-}"
if [[ -f "$ROOT/scripts/lib/skill-lists.sh" ]]; then
  # shellcheck source=scripts/lib/skill-lists.sh
  source "$ROOT/scripts/lib/skill-lists.sh"
else
  OWNED_AGENTS=(etrnl-adversary etrnl-browser-qa etrnl-design-reviewer etrnl-dx-reviewer etrnl-executor etrnl-investigator etrnl-quality-reviewer etrnl-scout etrnl-spec-reviewer)
fi

latest_backup() {
  local candidate latest
  latest=""
  # Compare mtimes because install and legacy backup prefixes sort differently.
  shopt -s nullglob
  for candidate in "$ROOT"/backups/control-plane-install-* "$ROOT"/backups/control-plane-*; do
    if [[ -d "$candidate" && ( -z "$latest" || "$candidate" -nt "$latest" ) ]]; then
      latest="$candidate"
    fi
  done
  shopt -u nullglob
  printf '%s\n' "$latest"
}

if [[ -z "$BACKUP" ]]; then
  BACKUP="$(latest_backup)"
fi
if [[ -z "$BACKUP" || ! -d "$BACKUP" ]]; then
  printf 'No backup directory found. Set CLAUDE_GUARD_DISABLED=1 to bypass guards manually.\n' >&2
  exit 1
fi
if [[ ! -d "$ROOT" || ! -w "$ROOT" ]]; then
  printf 'Claude home is not writable: %s\n' "$ROOT" >&2
  exit 1
fi

cleanup_restore_temps() {
  local tmp
  for tmp in "${temp_files[@]:-}"; do
    [[ -n "$tmp" ]] && rm -f -- "$tmp"
  done
}

restored=()
restored_count=0
restore_files=()
temp_files=()
restore_count=0
for file in settings.json settings.local.json CLAUDE.md AGENTS.md; do
  if [[ -f "$BACKUP/$file" ]]; then
    if [[ ! -s "$BACKUP/$file" ]]; then
      printf 'Backup file is empty: %s/%s\n' "$BACKUP" "$file" >&2
      exit 1
    fi
    restore_files+=("$file")
    restore_count=$((restore_count + 1))
  fi
done

trap cleanup_restore_temps EXIT
if (( restore_count > 0 )); then
  for file in "${restore_files[@]}"; do
    template="$ROOT/.${file}.restore.XXXXXX"
    if ! tmp="$(mktemp "$template")"; then
      printf 'Failed to create temp file for %s in %s\n' "$file" "$ROOT" >&2
      exit 1
    fi
    if [[ -z "$tmp" || ! -f "$tmp" ]]; then
      printf 'Failed to create temp file from template: %s\n' "$template" >&2
      exit 1
    fi
    if ! cp -- "$BACKUP/$file" "$tmp"; then
        printf 'Failed to restore %s from %s\n' "$file" "$BACKUP" >&2
        exit 1
    fi
    if [[ ! -s "$tmp" ]]; then
        printf 'Prepared restore file is empty: %s\n' "$tmp" >&2
        exit 1
    fi
    temp_files+=("$tmp")
  done

  for i in "${!restore_files[@]}"; do
    file="${restore_files[$i]}"
    tmp="${temp_files[$i]}"
    if ! mv -- "$tmp" "$ROOT/$file"; then
      printf 'Failed to activate restored %s\n' "$file" >&2
      exit 1
    fi
    temp_files[i]=""
    restored+=("$file")
    restored_count=$((restored_count + 1))
  done
fi
trap - EXIT

mkdir -p "$ROOT/agents"
for agent in "${OWNED_AGENTS[@]}"; do
  rm -f -- "$ROOT/agents/$agent.md"
  if [[ -f "$BACKUP/agents/$agent.md" ]]; then
    cp -- "$BACKUP/agents/$agent.md" "$ROOT/agents/$agent.md"
    restored+=("agents/$agent.md")
    restored_count=$((restored_count + 1))
  fi
done

printf 'Restored Claude config backup from %s\n' "$BACKUP"
if (( restored_count > 0 )); then
  printf 'Restored files: %s\n' "${restored[*]}"
fi
printf 'Manual emergency bypass: export CLAUDE_GUARD_DISABLED=1\n'

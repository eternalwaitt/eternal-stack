#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${CLAUDE_HOME:-$HOME/.claude}"
CODEX_TARGET="${CODEX_HOME:-$HOME/.codex}"
BACKUP=""
DRY_RUN=0

usage() {
  printf 'Usage: %s [--dry-run] [backup-dir]\n' "${0##*/}"
}

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -n "$BACKUP" ]]; then
        printf 'rollback error: multiple backup directories provided\n' >&2
        usage >&2
        exit 2
      fi
      BACKUP="$arg"
      ;;
  esac
done

if [[ ! -f "$ROOT/scripts/lib/skill-lists.sh" ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    printf 'Dry run: required skill list is missing at %s/scripts/lib/skill-lists.sh; rollback preview would require an installed control-plane root.\n' "$ROOT"
    exit 0
  fi
  printf 'Required skill list is missing: %s/scripts/lib/skill-lists.sh\n' "$ROOT" >&2
  exit 1
fi
# shellcheck source=scripts/lib/skill-lists.sh
source "$ROOT/scripts/lib/skill-lists.sh"
if [[ -z "${OWNED_AGENTS+x}" || "${#OWNED_AGENTS[@]}" -eq 0 ]]; then
  printf 'OWNED_AGENTS is missing from %s/scripts/lib/skill-lists.sh\n' "$ROOT" >&2
  exit 1
fi
if [[ -z "${OWNED_SKILLS+x}" || "${#OWNED_SKILLS[@]}" -eq 0 ]]; then
  printf 'OWNED_SKILLS is missing from %s/scripts/lib/skill-lists.sh\n' "$ROOT" >&2
  exit 1
fi
if [[ -z "${OWNED_COMMANDS+x}" || "${#OWNED_COMMANDS[@]}" -eq 0 ]]; then
  printf 'OWNED_COMMANDS is missing from %s/scripts/lib/skill-lists.sh\n' "$ROOT" >&2
  exit 1
fi
if [[ -z "${CRITICAL_HOOKS+x}" || "${#CRITICAL_HOOKS[@]}" -eq 0 ]]; then
  printf 'CRITICAL_HOOKS is missing from %s/scripts/lib/skill-lists.sh\n' "$ROOT" >&2
  exit 1
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
  if [[ "$DRY_RUN" == "1" ]]; then
    printf 'Dry run: no backup directory found; rollback would require a backup path or an existing %s/backups entry.\n' "$ROOT"
    printf 'Dry run: would remove repo-owned agents, Claude/Codex skills, commands, and hooks before restoring backed-up copies.\n'
    exit 0
  fi
  printf 'No backup directory found. Set CLAUDE_GUARD_DISABLED=1 to bypass guards manually.\n' >&2
  exit 1
fi
if [[ "$DRY_RUN" != "1" && ( ! -d "$ROOT" || ! -w "$ROOT" ) ]]; then
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

if [[ "$DRY_RUN" == "1" ]]; then
  printf 'Dry run: would restore Claude config backup from %s\n' "$BACKUP"
  if (( restore_count > 0 )); then
    printf 'Dry run: would restore files: %s\n' "${restore_files[*]}"
  fi
  printf 'Dry run: would remove repo-owned agents, Claude/Codex skills, commands, and hooks before restoring backed-up copies.\n'
  exit 0
fi

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

mkdir -p "$ROOT/skills"
for skill in "${OWNED_SKILLS[@]}"; do
  rm -rf -- "$ROOT/skills/$skill"
  if [[ -d "$BACKUP/skills/$skill" ]]; then
    cp -R -- "$BACKUP/skills/$skill" "$ROOT/skills/$skill"
    restored+=("skills/$skill")
    restored_count=$((restored_count + 1))
  fi
done

mkdir -p "$CODEX_TARGET/skills"
for skill in "${OWNED_SKILLS[@]}"; do
  rm -rf -- "$CODEX_TARGET/skills/$skill"
  if [[ -d "$BACKUP/codex-skills/$skill" ]]; then
    cp -R -- "$BACKUP/codex-skills/$skill" "$CODEX_TARGET/skills/$skill"
    restored+=("codex-skills/$skill")
    restored_count=$((restored_count + 1))
  fi
done

mkdir -p "$ROOT/commands"
for command_name in "${OWNED_COMMANDS[@]}"; do
  rm -f -- "$ROOT/commands/$command_name.md"
  if [[ -f "$BACKUP/commands/$command_name.md" ]]; then
    cp -- "$BACKUP/commands/$command_name.md" "$ROOT/commands/$command_name.md"
    restored+=("commands/$command_name.md")
    restored_count=$((restored_count + 1))
  fi
done

mkdir -p "$ROOT/hooks"
for hook_file in "${CRITICAL_HOOKS[@]}"; do
  rm -f -- "$ROOT/hooks/$hook_file"
  if [[ -f "$BACKUP/hooks/$hook_file" ]]; then
    cp -- "$BACKUP/hooks/$hook_file" "$ROOT/hooks/$hook_file"
    if ! chmod +x "$ROOT/hooks/$hook_file" 2>/dev/null; then
      printf 'warning: failed to make %s executable; restored hook may not run\n' "$ROOT/hooks/$hook_file" >&2
    fi
    restored+=("hooks/$hook_file")
    restored_count=$((restored_count + 1))
  fi
done

if [[ -f "$ROOT/settings.json" ]]; then
  if command -v jq >/dev/null 2>&1; then
    jq empty "$ROOT/settings.json"
  else
    printf 'warning: jq not found; settings JSON not verified after rollback\n' >&2
  fi
fi

printf 'Restored Claude config backup from %s\n' "$BACKUP"
if (( restored_count > 0 )); then
  printf 'Restored files: %s\n' "${restored[*]}"
fi
printf 'Manual emergency bypass: export CLAUDE_GUARD_DISABLED=1\n'

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
    printf 'Dry run: required skill list is missing at %s/scripts/lib/skill-lists.sh; rollback preview would require an installed Eternal Stack root.\n' "$ROOT"
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
if [[ -z "${INSTALL_SCRIPTS+x}" || "${#INSTALL_SCRIPTS[@]}" -eq 0 ]]; then
  printf 'INSTALL_SCRIPTS is missing from %s/scripts/lib/skill-lists.sh\n' "$ROOT" >&2
  exit 1
fi
if [[ -z "${CRITICAL_SCRIPTS+x}" || "${#CRITICAL_SCRIPTS[@]}" -eq 0 ]]; then
  printf 'CRITICAL_SCRIPTS is missing from %s/scripts/lib/skill-lists.sh\n' "$ROOT" >&2
  exit 1
fi

latest_backup() {
  local candidate latest mtime latest_mtime
  latest=""
  latest_mtime=-1
  # Compare mtimes because install and legacy backup prefixes sort differently.
  # `-nt` ties at second granularity (two backups in the same clock second —
  # e.g. a fast install right after another) would keep the first glob match,
  # which can be the OLDER backup; break mtime ties by lexically-greater name,
  # since install backup names embed a sortable timestamp.
  shopt -s nullglob
  for candidate in "$ROOT"/backups/etrnl-install-* "$ROOT"/backups/etrnl-*; do
    [[ -d "$candidate" ]] || continue
    [[ "$candidate" == "$latest" ]] && continue
    mtime="$(stat -f %m "$candidate" 2>/dev/null || stat -c %Y "$candidate" 2>/dev/null || printf '0')"
    if (( mtime > latest_mtime )) || { (( mtime == latest_mtime )) && [[ "$candidate" > "$latest" ]]; }; then
      latest="$candidate"
      latest_mtime="$mtime"
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
restored_command_names=()
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
  printf 'Dry run: would restore the eternal-saas rule pack (docs/templates/rules/ or legacy rules/) and ~/.codex startup files from backup if present.\n'
  if [[ -f "$BACKUP/new-source-paths.txt" ]]; then
    # `grep -c .` already prints `0` on a manifest with no non-empty lines, but also
    # exits 1 there — so a `|| printf '0'` fallback would APPEND a second `0`, yielding
    # a garbled `0\n0` count. Swallow the exit status with `|| true` and default an
    # empty result (e.g. grep error) to 0 instead.
    new_path_count="$(grep -c . "$BACKUP/new-source-paths.txt" 2>/dev/null || true)"
    new_path_count="${new_path_count:-0}"
    printf 'Dry run: would remove %s path(s) this install newly created (per new-source-paths.txt) to return to pre-install absence.\n' "$new_path_count"
  fi
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

# Restore command markdown once because OWNED_SKILLS, OWNED_COMMANDS, and
# Claude/Codex restore paths can overlap; restored_command_names skips
# duplicates while restored[] and restored_count record actual restorations.
restore_command_once() {
  local command_name seen
  command_name="$1"
  if (( ${#restored_command_names[@]} > 0 )); then
    for seen in "${restored_command_names[@]}"; do
      [[ "$seen" == "$command_name" ]] && return 0
    done
  fi
  restored_command_names+=("$command_name")
  rm -f -- "${ROOT:?}/commands/$command_name.md"
  if [[ -f "$BACKUP/commands/$command_name.md" ]]; then
    cp -- "$BACKUP/commands/$command_name.md" "$ROOT/commands/$command_name.md"
    restored+=("commands/$command_name.md")
    restored_count=$((restored_count + 1))
  fi
}

mkdir -p "$ROOT/agents"
for agent in "${OWNED_AGENTS[@]}"; do
  rm -f -- "${ROOT:?}/agents/$agent.md"
  if [[ -f "$BACKUP/agents/$agent.md" ]]; then
    cp -- "$BACKUP/agents/$agent.md" "$ROOT/agents/$agent.md"
    restored+=("agents/$agent.md")
    restored_count=$((restored_count + 1))
  fi
done

mkdir -p "$ROOT/skills"
for skill in "${OWNED_SKILLS[@]}"; do
  rm -rf -- "${ROOT:?}/skills/$skill"
  if [[ -d "$BACKUP/skills/$skill" ]]; then
    cp -R -- "$BACKUP/skills/$skill" "$ROOT/skills/$skill"
    restored+=("skills/$skill")
    restored_count=$((restored_count + 1))
  fi
done
for skill in "${BUNDLED_SKILLS[@]}"; do
  rm -rf -- "${ROOT:?}/skills/$skill"
  if [[ -d "$BACKUP/skills/$skill" ]]; then
    cp -R -- "$BACKUP/skills/$skill" "$ROOT/skills/$skill"
    restored+=("skills/$skill (bundled)")
    restored_count=$((restored_count + 1))
  fi
done
rm -rf -- "${ROOT:?}/skills/common"
if [[ -d "$BACKUP/skills/common" ]]; then
  cp -R -- "$BACKUP/skills/common" "$ROOT/skills/common"
  restored+=("skills/common")
  restored_count=$((restored_count + 1))
fi

mkdir -p "$ROOT/commands"
for skill in "${OWNED_SKILLS[@]}"; do
  restore_command_once "$skill"
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
for skill in "${BUNDLED_SKILLS[@]}"; do
  rm -rf -- "$CODEX_TARGET/skills/$skill"
  if [[ -d "$BACKUP/codex-skills/$skill" ]]; then
    cp -R -- "$BACKUP/codex-skills/$skill" "$CODEX_TARGET/skills/$skill"
    restored+=("codex-skills/$skill (bundled)")
    restored_count=$((restored_count + 1))
  fi
done
rm -rf -- "$CODEX_TARGET/skills/common"
if [[ -d "$BACKUP/codex-skills/common" ]]; then
  cp -R -- "$BACKUP/codex-skills/common" "$CODEX_TARGET/skills/common"
  restored+=("codex-skills/common")
  restored_count=$((restored_count + 1))
fi

mkdir -p "$CODEX_TARGET/scripts" "$CODEX_TARGET/scripts/lib"
for script in "${INSTALL_SCRIPTS[@]}"; do
  rm -f -- "$CODEX_TARGET/scripts/$script"
  if [[ -f "$BACKUP/codex-scripts/$script" ]]; then
    cp -- "$BACKUP/codex-scripts/$script" "$CODEX_TARGET/scripts/$script"
    restored+=("codex-scripts/$script")
    restored_count=$((restored_count + 1))
  fi
done
for script in "${CRITICAL_SCRIPTS[@]}"; do
  if [[ "$script" == lib/* ]]; then
    rm -f -- "$CODEX_TARGET/scripts/$script"
    if [[ -f "$BACKUP/codex-scripts/$script" ]]; then
      mkdir -p "$CODEX_TARGET/scripts/$(dirname -- "$script")"
      cp -- "$BACKUP/codex-scripts/$script" "$CODEX_TARGET/scripts/$script"
      restored+=("codex-scripts/$script")
      restored_count=$((restored_count + 1))
    fi
  fi
done
for script in doctor.sh doctor-etrnl.sh; do
  rm -f -- "$CODEX_TARGET/scripts/$script"
  if [[ -f "$BACKUP/codex-scripts/$script" || -L "$BACKUP/codex-scripts/$script" ]]; then
    cp -P -- "$BACKUP/codex-scripts/$script" "$CODEX_TARGET/scripts/$script"
    restored+=("codex-scripts/$script")
    restored_count=$((restored_count + 1))
  fi
done
rm -f -- "$CODEX_TARGET/etrnl/install.json" "$CODEX_TARGET/etrnl/update-state.json" "$CODEX_TARGET/etrnl/just-updated.json"

for command_name in "${OWNED_COMMANDS[@]}"; do
  restore_command_once "$command_name"
done

mkdir -p "$ROOT/hooks"
for hook_file in "${CRITICAL_HOOKS[@]}"; do
  # Always drop the installed hook first: one that was newly installed with no prior
  # backup must return to pre-install absence, not linger.
  rm -f -- "${ROOT:?}/hooks/$hook_file"
  # -e/-L covers both a regular backed-up file and a backed-up symlink (a symlink to
  # an existing target passes -e; a dangling one needs -L). Use cp -P so a hook that
  # was symlinked to an external file is restored as a link, not a dereferenced copy
  # that would clobber the referent — same contract as the wider-hook loop below.
  if [[ -e "$BACKUP/hooks/$hook_file" || -L "$BACKUP/hooks/$hook_file" ]]; then
    cp -P -- "$BACKUP/hooks/$hook_file" "$ROOT/hooks/$hook_file"
    # chmod follows symlinks, so only mark real .sh files executable; a restored
    # symlink keeps its target's mode.
    if [[ -f "$ROOT/hooks/$hook_file" && ! -L "$ROOT/hooks/$hook_file" ]]; then
      if ! chmod +x "$ROOT/hooks/$hook_file" 2>/dev/null; then
        printf 'warning: failed to make %s executable; restored hook may not run\n' "$ROOT/hooks/$hook_file" >&2
      fi
    fi
    restored+=("hooks/$hook_file")
    restored_count=$((restored_count + 1))
  fi
done

# Restore the wider hook set install.sh backs up beyond CRITICAL_HOOKS
# (non-critical top-level hooks and hooks/lib libraries) so a rollback returns
# every overwritten hook, not just the critical subset. Skip fixtures (restored
# from the separate hooks-fixtures backup) and the critical top-level hooks
# already restored above. Restore-only: hooks that were newly installed with no
# prior backup are left untouched so user-added hooks are never deleted.
if [[ -d "$BACKUP/hooks" ]]; then
  while IFS= read -r -d '' backup_hook; do
    hook_rel="${backup_hook#"$BACKUP/hooks/"}"
    case "$hook_rel" in
      fixtures/*) continue ;;
    esac
    if [[ "$hook_rel" != */* ]]; then
      already_restored=0
      for hook_file in "${CRITICAL_HOOKS[@]}"; do
        if [[ "$hook_rel" == "$hook_file" ]]; then
          already_restored=1
          break
        fi
      done
      (( already_restored == 1 )) && continue
    fi
    mkdir -p "$ROOT/hooks/$(dirname -- "$hook_rel")"
    # -P restores a backed-up symlink as a link (install.sh backs hooks up with
    # cp -P); remove any existing dest first so we never write through a link. Use
    # rm -rf, not rm -f: when the backup entry is a symlink but the overlay
    # materialized a real directory at that path (e.g. a pre-install hooks/lib
    # symlink replaced by a copied dir), rm -f cannot remove the dir and cp -P
    # would nest the link inside it. rm -rf clears either a file, link, or dir so
    # the restore lands the backed-up form verbatim.
    rm -rf -- "${ROOT:?}/hooks/$hook_rel"
    cp -P -- "$backup_hook" "$ROOT/hooks/$hook_rel"
    # chmod follows symlinks, so only mark real .sh files executable — a restored
    # hook symlink keeps its target's mode.
    if [[ "$hook_rel" == *.sh && -f "$ROOT/hooks/$hook_rel" && ! -L "$ROOT/hooks/$hook_rel" ]]; then
      if ! chmod +x "$ROOT/hooks/$hook_rel" 2>/dev/null; then
        printf 'warning: failed to make %s executable; restored hook may not run\n' "$ROOT/hooks/$hook_rel" >&2
      fi
    fi
    restored+=("hooks/$hook_rel")
    restored_count=$((restored_count + 1))
  done < <(find "$BACKUP/hooks" \( -type f -o -type l \) -print0)
fi

# Restore the fixture trees install.sh backs up before pruning + overlaying fresh
# source fixtures. The wider-hook loop above skips fixtures/* on the premise they
# are restored here, so a user-dropped file under hooks/fixtures or tests/fixtures
# survives rollback. Replace the installed (source) fixtures with the backed-up tree.
# `-e || -L` matches a backed-up dangling symlink (install.sh captures fixtures
# with cp -RP, so the backup can be a link); `cp -RP` restores it as the link
# rather than a dereferenced copy. `rm -rf` first clears whatever form the dest
# currently holds (dir, file, or link).
if [[ -e "$BACKUP/hooks-fixtures" || -L "$BACKUP/hooks-fixtures" ]]; then
  rm -rf -- "${ROOT:?}/hooks/fixtures"
  mkdir -p "$ROOT/hooks"
  cp -RP -- "$BACKUP/hooks-fixtures" "$ROOT/hooks/fixtures"
  restored+=("hooks/fixtures")
  restored_count=$((restored_count + 1))
fi
if [[ -e "$BACKUP/tests-fixtures" || -L "$BACKUP/tests-fixtures" ]]; then
  rm -rf -- "${ROOT:?}/tests/fixtures"
  mkdir -p "$ROOT/tests"
  cp -RP -- "$BACKUP/tests-fixtures" "$ROOT/tests/fixtures"
  restored+=("tests/fixtures")
  restored_count=$((restored_count + 1))
fi

# Restore the eternal-saas pack staged by install.sh. Backups taken before the pack moved
# out of ~/.claude/rules/ carry the legacy key, so restore whichever key the backup holds —
# rolling back to a pre-move install must put the pack back where that install had it.
restore_eternal_saas_pack() {
  local backup_src="$1"
  local dest="$2"
  local label="$3"
  local tmp old
  mkdir -p "$(dirname -- "$dest")"
  tmp="$(mktemp -d "$(dirname -- "$dest")/.eternal-saas.restore.XXXXXX")" || return 1
  old="$(mktemp -d "$(dirname -- "$dest")/.eternal-saas.previous.XXXXXX")" || {
    rm -rf -- "$tmp"
    return 1
  }
  rmdir -- "$old"
  if ! cp -R -- "$backup_src"/. "$tmp"; then
    rm -rf -- "$tmp"
    printf 'rollback error: failed to stage %s\n' "$label" >&2
    return 1
  fi
  if [[ -e "$dest" || -L "$dest" ]]; then
    if ! mv -- "$dest" "$old"; then
      rm -rf -- "$tmp"
      printf 'rollback error: failed to preserve current %s\n' "$label" >&2
      return 1
    fi
  fi
  if mv -- "$tmp" "$dest"; then
    rm -rf -- "$old"
    restored+=("$label")
    restored_count=$((restored_count + 1))
  else
    if [[ -d "$old" ]]; then
      if [[ -e "$dest" || -L "$dest" ]] || ! mv -- "$old" "$dest"; then
        rm -rf -- "$tmp"
        printf 'rollback error: failed to recover prior %s; preserved at %s\n' \
          "$label" "$old" >&2
        return 1
      fi
    fi
    rm -rf -- "$tmp"
    printf 'rollback error: failed to restore %s\n' "$label" >&2
    return 1
  fi
}
if [[ -d "$BACKUP/docs-templates-rules/eternal-saas" ]]; then
  restore_eternal_saas_pack \
    "$BACKUP/docs-templates-rules/eternal-saas" \
    "$ROOT/docs/templates/rules/eternal-saas" \
    "docs/templates/rules/eternal-saas"
fi
if [[ -d "$BACKUP/rules/eternal-saas" ]]; then
  restore_eternal_saas_pack \
    "$BACKUP/rules/eternal-saas" \
    "$ROOT/rules/eternal-saas" \
    "rules/eternal-saas"
fi

# Restore Codex startup files installed by install.sh
for codex_startup_file in AGENTS.md AGENTS.override.md; do
  if [[ -f "$BACKUP/codex-startup/$codex_startup_file" ]]; then
    cp -- "$BACKUP/codex-startup/$codex_startup_file" "$CODEX_TARGET/$codex_startup_file"
    restored+=("codex-startup/$codex_startup_file")
    restored_count=$((restored_count + 1))
  fi
done
if [[ -d "$BACKUP/codex-hooks" ]]; then
  mkdir -p "$CODEX_TARGET/hooks"
  for codex_hook in "$BACKUP/codex-hooks"/*; do
    [[ -f "$codex_hook" ]] || continue
    hook_name="$(basename -- "$codex_hook")"
    cp -- "$codex_hook" "$CODEX_TARGET/hooks/$hook_name"
    chmod +x "$CODEX_TARGET/hooks/$hook_name" 2>/dev/null || true
    restored+=("codex-hooks/$hook_name")
    restored_count=$((restored_count + 1))
  done
fi

# Remove paths this install newly created (no pre-install counterpart) so rollback
# returns to pre-install absence, not a half-reverted home. install.sh recorded them
# in new-source-paths.txt; every entry is a stack-owned relative path under the install
# home. A pre-existing path is restored from backup (and therefore never listed here),
# and a user-added file is never shipped in source (and therefore never listed), so this
# pass only deletes files this install itself created. Runs AFTER all restores so it can
# never race a restore. Older backups predate the manifest — skip silently when absent.
removed_new=()
removed_new_count=0
if [[ -f "$BACKUP/new-source-paths.txt" ]]; then
  while IFS= read -r new_rel; do
    [[ -n "$new_rel" ]] || continue
    # Defense-in-depth: only ever delete under the known stack-owned subtrees, and
    # reject any path that could traverse out of the install home.
    case "$new_rel" in
      hooks/* | tests/fixtures | tests/test-hooks.sh | tests/test-workflow-tools.sh | tests/lib/* | rules-manifest.json | docs/templates/rules/eternal-saas | docs/templates/rules/eternal-saas/*) : ;;
      *) continue ;;
    esac
    case "$new_rel" in
      *..*) continue ;;
    esac
    if [[ -e "$ROOT/$new_rel" || -L "$ROOT/$new_rel" ]]; then
      # ${ROOT:?} aborts rather than `rm -rf`-ing an absolute path if $ROOT were
      # ever empty ("/$new_rel"); the manifest is already subtree-scoped and
      # ..-rejected above, so this is defense-in-depth on the destructive call.
      rm -rf -- "${ROOT:?}/$new_rel"
      removed_new+=("$new_rel")
      removed_new_count=$((removed_new_count + 1))
    fi
  done < "$BACKUP/new-source-paths.txt"
fi

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
if (( removed_new_count > 0 )); then
  printf 'Removed install-created files (returned to pre-install absence): %s\n' "${removed_new[*]}"
fi
printf 'Manual emergency bypass: export CLAUDE_GUARD_DISABLED=1\n'

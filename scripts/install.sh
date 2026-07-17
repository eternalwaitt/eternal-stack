#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
SKILL_LISTS="$ROOT/scripts/lib/skill-lists.sh"
if [[ ! -f "$SKILL_LISTS" ]]; then
  printf 'fatal: missing %s\n' "$SKILL_LISTS" >&2
  exit 1
fi
# shellcheck source=scripts/lib/skill-lists.sh
source "$SKILL_LISTS"
# shellcheck source=scripts/lib/reset-settings.sh
source "$ROOT/scripts/lib/reset-settings.sh"
TARGET="${CLAUDE_HOME:-$HOME/.claude}"
CODEX_TARGET="${CODEX_HOME:-$HOME/.codex}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$TARGET/backups/etrnl-install-$STAMP"
# Surface the rollback path on any mid-install failure. Without this, a failure
# after the backup phase leaves a half-installed home with no pointer to $BACKUP.
# A pre-flight failure (e.g. --dry-run precondition check) fires the ERR trap
# before any backup exists, so only point at rollback when $BACKUP is real —
# otherwise the "restore your previous config" hint names a nonexistent dir.
trap 'rc=$?; if (( rc != 0 )); then if [[ -d "$BACKUP" ]]; then printf "\ninstall FAILED (exit %d). Restore your previous config with:\n  bash %s/scripts/rollback-local.sh %s\n" "$rc" "$ROOT" "$BACKUP" >&2; else printf "\ninstall FAILED (exit %d) before any backup was taken; no changes were made.\n" "$rc" >&2; fi; fi' ERR
SETTINGS_TEMPLATE="$ROOT/templates/settings.json"
legacy_rules_present=0
DRY_RUN=0
YES=0
RESET_CLAUDE_SETTINGS=1
PROFILE="${ETRNL_STACK_PROFILE:-core}"
SKIP_HINDSIGHT=0
SKIP_BEADS=0
SKIP_CODEGRAPH=0

usage() {
  cat <<EOF
Usage: ${0##*/} [--profile core|full] [--yes] [--dry-run] [options]

Options:
  --profile <name>       Install profile: core or full. Default: core.
  --yes, -y              Approve noninteractive full-profile bootstrap actions.
  --dry-run              Print planned file, tool, config, and rollback actions.
  --preserve-settings    Merge into existing settings.json instead of resetting it first.
  --skip-hindsight       Full profile: explicitly skip Hindsight plugin/config.
  --skip-beads           Full profile: explicitly skip Beads binary/project DB.
  --skip-codegraph       Full profile: explicitly skip CodeGraph binary/MCP.
  -h, --help             Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="${2:-}"
      [[ -n "$PROFILE" ]] || { printf 'install error: --profile requires core or full\n' >&2; exit 2; }
      shift 2
      ;;
    --profile=*)
      PROFILE="${1#--profile=}"
      shift
      ;;
    --yes|-y)
      YES=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --preserve-settings)
      RESET_CLAUDE_SETTINGS=0
      shift
      ;;
    --skip-hindsight)
      SKIP_HINDSIGHT=1
      shift
      ;;
    --skip-beads)
      SKIP_BEADS=1
      shift
      ;;
    --skip-codegraph)
      SKIP_CODEGRAPH=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'install error: unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$PROFILE" in
  core|full) ;;
  *)
    printf 'install error: unknown profile: %s\n' "$PROFILE" >&2
    usage >&2
    exit 2
    ;;
esac

profile_manifest_path() {
  printf '%s/templates/stack-profile.%s.json\n' "$ROOT" "$PROFILE"
}

PROFILE_MANIFEST="$(profile_manifest_path)"

if [[ "${ETRNL_ENABLE_STRICT:-0}" == "1" ]]; then
  SETTINGS_TEMPLATE="$ROOT/templates/settings.strict.json"
fi

settings_mode_for_template() {
  case "$1" in
    "$ROOT/templates/settings.json") printf 'default\n' ;;
    "$ROOT/templates/settings.strict.json") printf 'strict\n' ;;
    *)
      printf 'install warning: unknown settings template for metadata: %s\n' "$1" >&2
      printf 'unknown\n'
      ;;
  esac
}

copy_dir_contents() {
  local source_dir="$1"
  local target_dir="$2"
  local entry
  local entries=()
  local filtered=()
  if [[ ! -d "$source_dir" ]]; then
    printf 'fatal: missing directory %s\n' "$source_dir" >&2
    return 1
  fi
  mkdir -p "$target_dir"
  shopt -s nullglob dotglob
  entries=("$source_dir"/*)
  shopt -u nullglob dotglob
  for entry in "${entries[@]}"; do
    [[ "${entry##*/}" == "__pycache__" ]] && continue
    filtered+=("$entry")
  done
  if (( ${#filtered[@]} > 0 )); then
    cp -R -- "${filtered[@]}" "$target_dir/"
  fi
}

sync_owned_skills() {
  local source_dir="$1"
  local target_dir="$2"
  local backup_dir="${3:-}"
  local skill
  if [[ ! -d "$source_dir" ]]; then
    printf 'fatal: missing directory %s\n' "$source_dir" >&2
    return 1
  fi
  mkdir -p "$target_dir"
  if [[ -n "$backup_dir" ]]; then
    mkdir -p "$backup_dir"
  fi
  for skill in "${OWNED_SKILLS[@]}"; do
    if [[ -n "$backup_dir" && -d "$target_dir/$skill" ]]; then
      cp -R -- "$target_dir/${skill:?}" "$backup_dir/${skill:?}"
    fi
    rm -rf -- "$target_dir/${skill:?}"
    cp -R -- "$source_dir/${skill:?}" "$target_dir/${skill:?}"
  done
}

sync_bundled_skills() {
  local source_dir="$1"
  local target_dir="$2"
  local backup_dir="${3:-}"
  local skill
  if [[ ! -d "$source_dir" ]]; then
    printf 'fatal: missing bundled skills directory %s\n' "$source_dir" >&2
    return 1
  fi
  mkdir -p "$target_dir"
  if [[ -n "$backup_dir" ]]; then
    mkdir -p "$backup_dir"
  fi
  for skill in "${BUNDLED_SKILLS[@]}"; do
    if [[ ! -d "$source_dir/$skill" || ! -f "$source_dir/$skill/SKILL.md" ]]; then
      printf 'fatal: missing bundled skill source %s/%s\n' "$source_dir" "$skill" >&2
      return 1
    fi
    if [[ -n "$backup_dir" && -d "$target_dir/$skill" ]]; then
      cp -R -- "$target_dir/${skill:?}" "$backup_dir/${skill:?}"
    fi
    rm -rf -- "$target_dir/${skill:?}"
    cp -R -- "$source_dir/${skill:?}" "$target_dir/${skill:?}"
  done
}

sync_skill_support_dir() {
  local source_dir="$1"
  local target_dir="$2"
  local backup_dir="$3"
  local support_name="$4"
  if [[ ! -d "$source_dir/$support_name" ]]; then
    printf 'fatal: missing skill support directory %s\n' "$source_dir/$support_name" >&2
    return 1
  fi
  mkdir -p "$target_dir" "$backup_dir"
  if [[ -d "$target_dir/$support_name" ]]; then
    cp -R -- "$target_dir/${support_name:?}" "$backup_dir/${support_name:?}"
  fi
  rm -rf -- "$target_dir/${support_name:?}"
  cp -R -- "$source_dir/${support_name:?}" "$target_dir/${support_name:?}"
}

install_skill_command_shims() {
  local target_dir="$1"
  local command_file skill skill_file tmp
  mkdir -p "$target_dir"
  for skill in "${OWNED_SKILLS[@]}"; do
    skill_file="$ROOT/skills/$skill/SKILL.md"
    if [[ ! -f "$skill_file" ]]; then
      printf 'fatal: missing skill source for slash command shim: %s\n' "$skill_file" >&2
      return 1
    fi
    if [[ ! -s "$skill_file" ]]; then
      printf 'fatal: empty skill source for slash command shim: %s\n' "$skill_file" >&2
      return 1
    fi
    command_file="$target_dir/$skill.md"
    tmp="$(mktemp "$command_file.tmp.XXXXXX")"
    {
      printf '%s\n' '---'
      printf 'description: Invoke the ETRNL %s workflow.\n' "$skill"
      printf 'argument-hint: <request>\n'
      printf '%s\n' '---'
      printf '\n'
      printf '%s\n\n' "User request: \$ARGUMENTS"
      printf 'Follow this ETRNL skill contract exactly:\n\n'
      printf '<etrnl_skill_contract name="%s">\n' "$skill"
      while IFS= read -r line || [[ -n "$line" ]]; do
        printf '%s\n' "$line"
      done <"$skill_file"
      printf '</etrnl_skill_contract>\n'
    } >"$tmp"
    mv -- "$tmp" "$command_file"
  done
}

backup_removed_skills() {
  local target_dir="$1"
  local backup_dir="$2"
  local skill
  for skill in "${REMOVED_SKILLS[@]}"; do
    if [[ -d "$target_dir/$skill" ]]; then
      mkdir -p "$backup_dir"
      cp -R -- "$target_dir/${skill:?}" "$backup_dir/${skill:?}"
      removed_moved=1
    fi
  done
}

backup_removed_skill_commands() {
  local target_dir="$1"
  local backup_dir="$2"
  local skill
  for skill in "${REMOVED_SKILLS[@]}"; do
    if [[ -f "$target_dir/$skill.md" ]]; then
      mkdir -p "$backup_dir"
      cp -- "$target_dir/${skill:?}.md" "$backup_dir/${skill:?}.md"
      removed_moved=1
    fi
  done
}

# A REMOVED_SKILLS entry is safe to auto-delete only when it is stack-namespaced
# or its installed file carries a stack signature. A generic name (test, pr,
# commit, deps, …) with no stack signature is treated as a user-authored skill
# and preserved — it is still backed up, but never silently deleted.
removed_entry_is_stack_owned() {
  local file="$1" name="$2"
  case "$name" in
    etrnl-*|eternal-*) return 0 ;;
  esac
  [[ -e "$file" ]] || return 0
  # Durable stack provenance only: the Codex-startup `skill-update-prompt.mjs`
  # line that every installed stack skill carries. Do NOT infer ownership from a
  # bare "etrnl"/"eternal stack" mention — a user-authored skill that merely
  # references ETRNL in prose would then be misclassified and silently deleted.
  grep -rqE 'skill-update-prompt\.mjs' "$file" 2>/dev/null && return 0
  return 1
}

remove_removed_skills() {
  local target_dir="$1"
  local skill
  for skill in "${REMOVED_SKILLS[@]}"; do
    if [[ -d "$target_dir/$skill" ]]; then
      if removed_entry_is_stack_owned "$target_dir/$skill" "$skill"; then
        rm -rf -- "$target_dir/${skill:?}"
        printf 'install: removed legacy stack skill: %s\n' "$skill" >&2
      else
        printf 'install warning: preserved user skill (name matches a removed stack skill but is not stack-authored): %s\n' "$skill" >&2
      fi
    fi
  done
}

remove_removed_skill_commands() {
  local target_dir="$1"
  local skill
  for skill in "${REMOVED_SKILLS[@]}"; do
    if [[ -f "$target_dir/$skill.md" ]]; then
      if removed_entry_is_stack_owned "$target_dir/$skill.md" "$skill"; then
        rm -f -- "$target_dir/${skill:?}.md"
        printf 'install: removed legacy stack command: %s.md\n' "$skill" >&2
      else
        printf 'install warning: preserved user command (name matches a removed stack command but is not stack-authored): %s.md\n' "$skill" >&2
      fi
    fi
  done
}

copy_control_scripts() {
  local target_home="$1"
  local script
  mkdir -p "$target_home/scripts"
  cp -- "$ROOT/scripts/doctor.sh" "$target_home/scripts/doctor-etrnl.sh"
  ln -sf -- "doctor-etrnl.sh" "$target_home/scripts/doctor.sh"
  for script in "${INSTALL_SCRIPTS[@]}"; do
    cp -- "$ROOT/scripts/$script" "$target_home/scripts/$script"
  done
  mkdir -p "$target_home/scripts/lib"
  copy_dir_contents "$ROOT/scripts/lib" "$target_home/scripts/lib"
  # diff-triviality.mjs (Stop-verifier fast-path) resolves its taxonomy at
  # <script-dir>/../schemas, so the schemas dir must ship alongside scripts or
  # the fast-path silently never fires on an installed host.
  mkdir -p "$target_home/schemas"
  copy_dir_contents "$ROOT/schemas" "$target_home/schemas"
}

copy_profile_templates() {
  local target_home="$1"
  mkdir -p "$target_home/templates/hindsight"
  cp -- "$ROOT/templates/settings.json" "$target_home/templates/settings.json"
  cp -- "$ROOT/templates/settings.strict.json" "$target_home/templates/settings.strict.json"
  cp -- "$ROOT/templates/settings.local.example.json" "$target_home/templates/settings.local.example.json"
  cp -- "$ROOT/templates/stack-profile.core.json" "$target_home/templates/stack-profile.core.json"
  cp -- "$ROOT/templates/stack-profile.full.json" "$target_home/templates/stack-profile.full.json"
  copy_dir_contents "$ROOT/templates/hindsight" "$target_home/templates/hindsight"
}

chmod_control_scripts() {
  local target_home="$1"
  local script
  chmod +x "$target_home/scripts/"*.sh
  for script in "$target_home/scripts/"*.mjs; do
    if [[ -f "$script" ]] && IFS= read -r first_line <"$script" && [[ "$first_line" == "#!"* ]]; then
      chmod +x "$script"
    fi
  done
}

validate_source_install_inputs() {
  local missing=() preflight=() file agent command_name skill dir probe dangling stack_dir
  for file in \
    "$SETTINGS_TEMPLATE" \
    "$ROOT/templates/settings.local.example.json" \
    "$ROOT/templates/stack-profile.core.json" \
    "$ROOT/templates/stack-profile.full.json" \
    "$ROOT/templates/hindsight/claude-code.local-daemon.json" \
    "$ROOT/templates/hindsight/claude-code.external.example.json" \
    "$ROOT/templates/AGENTS.md" \
    "$ROOT/templates/CLAUDE.md" \
    "$ROOT/tests/test-hooks.sh" \
    "$ROOT/tests/test-workflow-tools.sh" \
    "$ROOT/tests/lib/harness.sh" \
    "$ROOT/tests/lib/busy-port-server.mjs"; do
    [[ -f "$file" ]] || missing+=("$file")
  done
  for file in hooks skills docs rules/etrnl tests/fixtures scripts/lib templates/hindsight schemas; do
    [[ -d "$ROOT/$file" ]] || missing+=("$ROOT/$file")
  done
  [[ -f "$ROOT/schemas/review-classification-rules-v1.json" ]] || missing+=("$ROOT/schemas/review-classification-rules-v1.json")
  for file in "${CRITICAL_HOOKS[@]}"; do
    [[ -f "$ROOT/hooks/$file" ]] || missing+=("$ROOT/hooks/$file")
  done
  for file in "${CRITICAL_SCRIPTS[@]}"; do
    [[ -f "$ROOT/scripts/$file" ]] || missing+=("$ROOT/scripts/$file")
  done
  # Every script the install copies verbatim, plus doctor.sh (copied under a
  # different name and executed post-install). Keeps dry-run honest: a missing
  # source here must fail before the real install mutates $TARGET.
  [[ -f "$ROOT/scripts/doctor.sh" ]] || missing+=("$ROOT/scripts/doctor.sh")
  for file in "${INSTALL_SCRIPTS[@]}"; do
    [[ -f "$ROOT/scripts/$file" ]] || missing+=("$ROOT/scripts/$file")
  done
  for agent in "${OWNED_AGENTS[@]}"; do
    [[ -f "$ROOT/agents/$agent.md" ]] || missing+=("$ROOT/agents/$agent.md")
  done
  for command_name in "${OWNED_COMMANDS[@]}"; do
    [[ -f "$ROOT/commands/$command_name.md" ]] || missing+=("$ROOT/commands/$command_name.md")
  done
  for skill in "${OWNED_SKILLS[@]}"; do
    [[ -d "$ROOT/skills/$skill" ]] || missing+=("$ROOT/skills/$skill")
    [[ -s "$ROOT/skills/$skill/SKILL.md" ]] || missing+=("$ROOT/skills/$skill/SKILL.md")
  done
  for skill in "${BUNDLED_SKILLS[@]}"; do
    [[ -d "$ROOT/skills/bundled/$skill" ]] || missing+=("$ROOT/skills/bundled/$skill")
    [[ -s "$ROOT/skills/bundled/$skill/SKILL.md" ]] || missing+=("$ROOT/skills/bundled/$skill/SKILL.md")
  done
  if (( ${#missing[@]} > 0 )); then
    printf 'install dry-run failed; missing source files:\n' >&2
    printf '  %s\n' "${missing[@]}" >&2
    return 1
  fi
  # A dry-run should answer "could the real install succeed here?", so assert the
  # runtime preconditions the install itself depends on: node and jq must be on
  # PATH, and each target home (or its nearest existing ancestor, for a fresh
  # install) must be writable before we would start mutating it.
  command -v node >/dev/null 2>&1 || preflight+=("required command not found: node")
  command -v jq >/dev/null 2>&1 || preflight+=("required command not found: jq")
  for dir in "$TARGET" "$CODEX_TARGET"; do
    if [[ -e "$dir" ]]; then
      # A writable regular file passes -e and -w but the install cannot create
      # subpaths under it, so a non-directory target is a hard precondition failure.
      if [[ ! -d "$dir" ]]; then
        preflight+=("target is not a directory: $dir")
      elif [[ ! -w "$dir" ]]; then
        preflight+=("target not writable: $dir")
      fi
    else
      probe="$dir"
      dangling=""
      while [[ -n "$probe" && ! -e "$probe" ]]; do
        # A path component that IS a symlink but does not resolve (`-L` yet not
        # `-e`) is dangling: `-e` reports it missing, so the walk would treat it as
        # a creatable gap, but the real install cannot mkdir through a broken link.
        if [[ -L "$probe" ]]; then
          dangling="$probe"
          break
        fi
        if [[ "$probe" == */* ]]; then
          probe="${probe%/*}"
          [[ -z "$probe" ]] && probe="/"
        else
          probe="."
        fi
      done
      # The nearest existing ancestor must be a writable directory. A writable
      # regular file passes -w but cannot hold a child path, so `/writable-file/child`
      # would otherwise pass dry-run yet fail the real install at mkdir.
      if [[ -n "$dangling" ]]; then
        preflight+=("target path component is a dangling symlink: $dangling (for $dir)")
      elif [[ ! -d "$probe" ]]; then
        preflight+=("target parent is not a directory: $probe (for $dir)")
      elif [[ ! -w "$probe" ]]; then
        preflight+=("target parent not writable: $probe (for $dir)")
      fi
    fi
  done
  # A symlinked stack subtree can't be safely overlaid: `find` skips a symlinked
  # root (no per-file backup) and the `cp -R` overlay writes THROUGH the link into
  # its external target, clobbering off-tree data that rollback never captured.
  # Reject it up front so the user resolves the link before installing. `rules` is
  # included because `rules/etrnl` and `rules/eternal-saas/*` are `cp -R` subtree
  # swaps under `$TARGET/rules` (see the atomic rules sync below), so a symlinked
  # `rules` parent is written through the same way; `agents`/`commands` are copied
  # file-by-file, so a symlinked parent there cannot swap an off-tree subtree.
  for stack_dir in "$TARGET/hooks" "$TARGET/skills" "$TARGET/rules" "$CODEX_TARGET/skills"; do
    if [[ -L "$stack_dir" ]]; then
      preflight+=("stack directory is a symlink (resolve to a real directory before installing): $stack_dir")
    fi
  done
  if (( ${#preflight[@]} > 0 )); then
    printf 'install dry-run failed; unmet preconditions:\n' >&2
    printf '  %s\n' "${preflight[@]}" >&2
    return 1
  fi
  node "$ROOT/scripts/stack-profile-check.mjs" "$PROFILE_MANIFEST"
}

# One-shot rename of the pre-Eternal-Stack runtime dir so runs/, artifacts/,
# state/, cache/, and install.json carry over without data loss. Whole-dir
# move preserves every subpath; skip if the new dir already exists.
migrate_legacy_runtime_dir() {
  local home="$1"
  if [[ -d "$home/control-plane" && ! -e "$home/etrnl" ]]; then
    mv -- "$home/control-plane" "$home/etrnl"
    printf 'Migrated legacy runtime data: %s/control-plane -> %s/etrnl\n' "$home" "$home"
  fi
}

if [[ "$DRY_RUN" == "1" ]]; then
  validate_source_install_inputs
  printf 'Dry run: profile=%s manifest=%s\n' "$PROFILE" "$PROFILE_MANIFEST"
  printf 'Dry run: would validate stack profile with scripts/stack-profile-check.mjs\n'
  printf 'Dry run: would install Eternal Stack files into %s\n' "$TARGET"
  printf 'Dry run: would install Codex skill/runtime files into %s\n' "$CODEX_TARGET"
  printf 'Dry run: would install %s/AGENTS.md from templates/AGENTS.global.md (ETRNL_INSTALL_STARTUP gated)\n' "$CODEX_TARGET"
  printf 'Dry run: would install %s/AGENTS.override.md from templates/AGENTS.override.codex.md (ETRNL_INSTALL_STARTUP gated)\n' "$CODEX_TARGET"
  printf 'Dry run: would sync rules/eternal-saas/{global,project} to %s/rules/eternal-saas/ with atomic swap\n' "$TARGET"
  printf 'Dry run: would copy settings, stack profile, and Hindsight config templates\n'
  if [[ "$RESET_CLAUDE_SETTINGS" == "1" ]]; then
    printf 'Dry run: would back up %s/settings.json and reset it to vanilla while preserving enabledPlugins and statusLine before applying stack hooks\n' "$TARGET"
  else
    printf 'Dry run: would preserve existing %s/settings.json and merge stack hooks into it\n' "$TARGET"
  fi
  if [[ "$PROFILE" == "full" ]]; then
    [[ "$SKIP_CODEGRAPH" == "1" ]] || printf 'Dry run: would install/verify CodeGraph global tool and MCP config\n'
    [[ "$SKIP_BEADS" == "1" ]] || printf 'Dry run: would install/verify Beads binary without raw Beads hooks\n'
    [[ "$SKIP_HINDSIGHT" == "1" ]] || printf 'Dry run: would install/verify Hindsight plugin and materialize token-free config\n'
    printf 'Dry run: would run Hindsight, Beads, CodeGraph, settings, and doctor canaries\n'
  else
    printf 'Dry run: core profile skips Hindsight, Beads, and CodeGraph bootstrap\n'
  fi
  printf 'Dry run: would create backup at %s\n' "$BACKUP"
  if [[ -d "$TARGET/control-plane" && ! -e "$TARGET/etrnl" ]]; then
    printf 'Dry run: would migrate legacy runtime dir %s/control-plane -> %s/etrnl\n' "$TARGET" "$TARGET"
  fi
  printf 'Dry run: would write rollback metadata into %s/etrnl/install.json\n' "$TARGET"
  printf 'Dry run: registered hooks template would be %s\n' "$SETTINGS_TEMPLATE"
  exit 0
fi

mkdir -p "$TARGET" "$BACKUP"
# Reject a symlinked stack subtree before any backup or overlay runs. `find` skips a
# symlinked root (so the per-file backup below captures nothing) and the later
# `cp -R` overlay writes THROUGH the link, clobbering an off-tree target that
# rollback never recorded. `rules` is included because `rules/etrnl` and
# `rules/eternal-saas/*` are `cp -R` subtree swaps under `$TARGET/rules` (see the
# atomic rules sync below); `agents`/`commands` are file-by-file copies and are exempt.
# Fail closed here — the user resolves the link manually. Mirrors the dry-run
# precondition in validate_source_install_inputs.
for stack_dir in "$TARGET/hooks" "$TARGET/skills" "$TARGET/rules" "$CODEX_TARGET/skills"; do
  if [[ -L "$stack_dir" ]]; then
    printf 'install error: %s is a symlink; resolve it to a real directory before installing (a symlinked stack root would be written through and its target clobbered)\n' "$stack_dir" >&2
    exit 2
  fi
done
migrate_legacy_runtime_dir "$TARGET"
migrate_legacy_runtime_dir "$CODEX_TARGET"
for file in settings.json settings.local.json CLAUDE.md AGENTS.md; do
  if [[ -f "$TARGET/$file" ]]; then
    cp -- "$TARGET/$file" "$BACKUP/$file"
  fi
done
if [[ -d "$TARGET/rules/etrnl" ]]; then
  mkdir -p "$BACKUP/rules"
  cp -R -- "$TARGET/rules/etrnl" "$BACKUP/rules/etrnl"
fi
if [[ -d "$TARGET/rules/eternal-saas" ]]; then
  mkdir -p "$BACKUP/rules"
  cp -R -- "$TARGET/rules/eternal-saas" "$BACKUP/rules/eternal-saas"
fi
if [[ -d "$TARGET/rules/eternal-control" ]]; then
  mkdir -p "$BACKUP/rules"
  cp -R -- "$TARGET/rules/eternal-control" "$BACKUP/rules/eternal-control"
  legacy_rules_present=1
fi
mkdir -p "$BACKUP/codex-startup"
for codex_startup_file in AGENTS.md AGENTS.override.md; do
  if [[ -f "$CODEX_TARGET/$codex_startup_file" ]]; then
    cp -- "$CODEX_TARGET/$codex_startup_file" "$BACKUP/codex-startup/$codex_startup_file"
  fi
done
mkdir -p "$BACKUP/hooks"
for hook_file in "${CRITICAL_HOOKS[@]}"; do
  if [[ -f "$TARGET/hooks/$hook_file" ]]; then
    cp -- "$TARGET/hooks/$hook_file" "$BACKUP/hooks/$hook_file"
  fi
done
# copy_dir_contents overlays all of hooks/ below, so every currently-installed hook
# is overwritten — not just CRITICAL_HOOKS. Back up the wider set (non-critical
# top-level hooks and hooks/lib libraries) so rollback can restore the full
# pre-install hook tree. Fixtures are backed up separately before their prune.
# Include symlinked hooks (-type l) and back them up as links (cp -P) so rollback
# can restore the original link instead of a dereferenced copy.
if [[ -d "$TARGET/hooks" ]]; then
  while IFS= read -r -d '' installed_hook; do
    hook_rel="${installed_hook#"$TARGET/hooks/"}"
    case "$hook_rel" in
      fixtures/*) continue ;;
    esac
    mkdir -p "$BACKUP/hooks/$(dirname -- "$hook_rel")"
    cp -P -- "$installed_hook" "$BACKUP/hooks/$hook_rel"
  done < <(find "$TARGET/hooks" \( -type f -o -type l \) -print0)
  # Unlink hook symlinks the overlay will write ONTO, so the subsequent `cp -R`
  # writes a real file instead of following the link and clobbering its external
  # target. Only links whose relative path has a matching source hook are at risk;
  # an unrelated user symlink with no source counterpart is left in place. The
  # links are backed up above (cp -P); rollback restores them.
  while IFS= read -r -d '' installed_link; do
    link_rel="${installed_link#"$TARGET/hooks/"}"
    case "$link_rel" in
      fixtures/*) continue ;;
    esac
    if [[ -e "$ROOT/hooks/$link_rel" ]]; then
      rm -f -- "$installed_link"
    fi
  done < <(find "$TARGET/hooks" -type l -print0)
fi

# Record every path this install newly creates so rollback can return to
# pre-install absence without deleting user-added files. A source hook counts as
# "new" only when the backup captured no pre-install counterpart; pre-existing
# hooks are restored from backup instead, and user-added hooks (never shipped in
# source) are never listed. Fixture trees revert wholesale from the
# hooks-fixtures/tests-fixtures backups when they existed pre-install; when they
# did not (a fresh install creates them), record the tree so rollback removes it.
# scripts/rollback-local.sh reads this manifest for its removal pass.
: > "$BACKUP/new-source-paths.txt"
if [[ -d "$ROOT/hooks" ]]; then
  while IFS= read -r -d '' source_hook; do
    hook_rel="${source_hook#"$ROOT/hooks/"}"
    case "$hook_rel" in
      fixtures/*) continue ;;
    esac
    if [[ ! -e "$BACKUP/hooks/$hook_rel" && ! -L "$BACKUP/hooks/$hook_rel" ]]; then
      printf 'hooks/%s\n' "$hook_rel" >> "$BACKUP/new-source-paths.txt"
    fi
  done < <(find "$ROOT/hooks" \( -type f -o -type l \) -print0)
fi
# A fixtures tree counts as install-created (rollback-removable) only when it had no
# pre-install form. The two trees are detected differently because the hooks unlink
# pass above already ran:
#   hooks/fixtures — a real dir survives that pass and is still present here (-e);
#     a pre-install SYMLINK was unlinked, so its pre-install form now lives only in
#     the wider-hook backup at $BACKUP/hooks/fixtures (-L). Either signal means it
#     pre-existed. Without the backup check, an unlinked pre-install fixtures link
#     would be recorded as new and the rollback removal pass would delete the tree
#     the wider-hook restore just re-linked.
#   tests/fixtures — nothing mutates it before this line, so the live target still
#     reflects pre-install state; -e || -L on $TARGET is authoritative.
if [[ ! -e "$TARGET/hooks/fixtures" && ! -L "$BACKUP/hooks/fixtures" && -d "$ROOT/hooks/fixtures" ]]; then
  printf 'hooks/fixtures\n' >> "$BACKUP/new-source-paths.txt"
fi
if [[ ! -e "$TARGET/tests/fixtures" && ! -L "$TARGET/tests/fixtures" && -d "$ROOT/tests/fixtures" ]]; then
  printf 'tests/fixtures\n' >> "$BACKUP/new-source-paths.txt"
fi

mkdir -p "$BACKUP/agents"
for agent in "${OWNED_AGENTS[@]}"; do
  if [[ -f "$TARGET/agents/$agent.md" ]]; then
    cp -- "$TARGET/agents/$agent.md" "$BACKUP/agents/$agent.md"
  fi
done

mkdir -p "$BACKUP/commands"
for command_name in "${OWNED_COMMANDS[@]}"; do
  if [[ -f "$TARGET/commands/$command_name.md" ]]; then
    cp -- "$TARGET/commands/$command_name.md" "$BACKUP/commands/$command_name.md"
  fi
done
for skill in "${OWNED_SKILLS[@]}"; do
  if [[ -f "$TARGET/commands/$skill.md" ]]; then
    cp -- "$TARGET/commands/$skill.md" "$BACKUP/commands/$skill.md"
  fi
done

mkdir -p "$BACKUP/skills"
for skill in "${OWNED_SKILLS[@]}" "${BUNDLED_SKILLS[@]}"; do
  if [[ -d "$TARGET/skills/$skill" ]]; then
    cp -R -- "$TARGET/skills/$skill" "$BACKUP/skills/$skill"
  fi
done
mkdir -p "$BACKUP/codex-scripts" "$BACKUP/codex-scripts/lib"
for script in doctor.sh doctor-etrnl.sh; do
  if [[ -f "$CODEX_TARGET/scripts/$script" || -L "$CODEX_TARGET/scripts/$script" ]]; then
    cp -P -- "$CODEX_TARGET/scripts/$script" "$BACKUP/codex-scripts/$script"
  fi
done
for script in "${INSTALL_SCRIPTS[@]}"; do
  if [[ -f "$CODEX_TARGET/scripts/$script" ]]; then
    cp -- "$CODEX_TARGET/scripts/$script" "$BACKUP/codex-scripts/$script"
  fi
done
for script in "${CRITICAL_SCRIPTS[@]}"; do
  if [[ "$script" == lib/* && -f "$CODEX_TARGET/scripts/$script" ]]; then
    cp -- "$CODEX_TARGET/scripts/$script" "$BACKUP/codex-scripts/$script"
  fi
done
removed_moved=0
backup_removed_skills "$TARGET/skills" "$BACKUP/skills"
backup_removed_skills "$CODEX_TARGET/skills" "$BACKUP/codex-skills"
backup_removed_skill_commands "$TARGET/commands" "$BACKUP/commands"
# Source tests must pass before REMOVED_SKILLS are removed from installed skill homes.
"$ROOT/tests/test-hooks.sh"
"$ROOT/tests/test-workflow-tools.sh"
if [[ "$PROFILE" == "full" ]]; then
  if [[ "$YES" != "1" && ! -t 0 ]]; then
    printf 'install error: full profile requires --yes in non-interactive mode; use explicit --skip-* flags only for intentional component skips\n' >&2
    exit 2
  fi
  bootstrap_args=(install --profile full)
  [[ "$YES" == "1" ]] && bootstrap_args+=(--yes)
  [[ "$SKIP_CODEGRAPH" == "1" ]] && bootstrap_args+=(--skip-codegraph)
  [[ "$SKIP_BEADS" == "1" ]] && bootstrap_args+=(--skip-beads)
  [[ "$SKIP_HINDSIGHT" == "1" ]] && bootstrap_args+=(--skip-hindsight)
  if [[ "${ETRNL_BOOTSTRAP_PROJECTS:-0}" == "1" ]]; then
    bootstrap_args+=(--project "$ROOT")
  else
    bootstrap_args+=(--skip-project)
  fi
  "$ROOT/scripts/bootstrap-tools.sh" "${bootstrap_args[@]}"
elif [[ "${ETRNL_BOOTSTRAP_TOOLS:-0}" == "1" ]]; then
  printf 'install warning: core profile does not bootstrap Hindsight, Beads, or CodeGraph; use --profile full for the supported full stack\n' >&2
fi
remove_removed_skills "$TARGET/skills"
remove_removed_skills "$CODEX_TARGET/skills"
remove_removed_skill_commands "$TARGET/commands"

# copy_dir_contents overlays (cp -R) rather than mirrors, so a file removed from source
# lingers in the installed home across installs. The replay fixtures under hooks/fixtures
# are auto-discovered and replayed and get renumbered over time, so stale copies would fail
# against current hooks. These trees are entirely source-derived test data (nothing else
# writes there), so clear them before the overlay copy to prune removed fixtures.
# Back up the pruned fixture trees first so the prune is reversible via rollback,
# in case a user ever dropped a file into these dirs.
# Detect fixtures with `-e || -L` so a dangling symlink (exists as a link, fails
# -e) is still captured, and copy with `cp -RP` so a symlinked tree is backed up
# as the link itself — the prune `rm -rf` removes the link, and rollback restores
# it verbatim instead of a dereferenced copy.
# This backup+prune MUST precede the mkdir below: a dangling tests/fixtures symlink
# would make `mkdir -p "$TARGET/tests/fixtures"` follow the broken link and fail
# ("No such file or directory"). Pruning the link first lets mkdir create a real dir.
if [[ -e "$TARGET/hooks/fixtures" || -L "$TARGET/hooks/fixtures" || -e "$TARGET/tests/fixtures" || -L "$TARGET/tests/fixtures" ]]; then
  mkdir -p "$BACKUP"
  { [[ -e "$TARGET/hooks/fixtures" || -L "$TARGET/hooks/fixtures" ]]; } && cp -RP -- "$TARGET/hooks/fixtures" "$BACKUP/hooks-fixtures"
  { [[ -e "$TARGET/tests/fixtures" || -L "$TARGET/tests/fixtures" ]]; } && cp -RP -- "$TARGET/tests/fixtures" "$BACKUP/tests-fixtures"
  removed_moved=1
fi
rm -rf -- "$TARGET/hooks/fixtures" "$TARGET/tests/fixtures"
mkdir -p "$TARGET/hooks" "$TARGET/scripts" "$TARGET/docs/templates" "$TARGET/skills" "$TARGET/agents" "$TARGET/commands" "$TARGET/rules" "$TARGET/tests/lib" "$TARGET/tests/fixtures"
copy_dir_contents "$ROOT/hooks" "$TARGET/hooks"
sync_owned_skills "$ROOT/skills" "$TARGET/skills"
sync_bundled_skills "$ROOT/skills/bundled" "$TARGET/skills" "$BACKUP/skills"
sync_owned_skills "$ROOT/skills" "$CODEX_TARGET/skills"
sync_bundled_skills "$ROOT/skills/bundled" "$CODEX_TARGET/skills" "$BACKUP/codex-skills"
sync_skill_support_dir "$ROOT/skills" "$TARGET/skills" "$BACKUP/skills" common
sync_skill_support_dir "$ROOT/skills" "$CODEX_TARGET/skills" "$BACKUP/codex-skills" common
mkdir -p "$TARGET/skills/metadata" "$CODEX_TARGET/skills/metadata"
copy_dir_contents "$ROOT/skills/metadata" "$TARGET/skills/metadata"
copy_dir_contents "$ROOT/skills/metadata" "$CODEX_TARGET/skills/metadata"
for agent in "${OWNED_AGENTS[@]}"; do
  cp -- "$ROOT/agents/$agent.md" "$TARGET/agents/$agent.md"
done
for command_name in "${OWNED_COMMANDS[@]}"; do
  cp -- "$ROOT/commands/$command_name.md" "$TARGET/commands/$command_name.md"
done
install_skill_command_shims "$TARGET/commands"
copy_dir_contents "$ROOT/docs" "$TARGET/docs"
rules_tmp="$TARGET/rules/etrnl.tmp"
rules_old="$TARGET/rules/etrnl.old"
rm -rf -- "$rules_tmp" "$rules_old"
cp -R -- "$ROOT/rules/etrnl" "$rules_tmp"
if [[ -d "$TARGET/rules/etrnl" ]]; then
  mv -- "$TARGET/rules/etrnl" "$rules_old"
fi
if mv -- "$rules_tmp" "$TARGET/rules/etrnl"; then
  rm -rf -- "$rules_old"
else
  [[ ! -d "$rules_old" ]] || mv -- "$rules_old" "$TARGET/rules/etrnl"
  rm -rf -- "$rules_tmp"
  exit 1
fi
cp -- "$ROOT/templates/AGENTS.md" "$TARGET/docs/templates/AGENTS.md"
cp -- "$ROOT/templates/CLAUDE.md" "$TARGET/docs/templates/CLAUDE.md"
if [[ "${ETRNL_INSTALL_STARTUP:-0}" == "1" || ! -f "$TARGET/AGENTS.md" ]]; then
  cp -- "$ROOT/templates/AGENTS.md" "$TARGET/AGENTS.md"
fi
if [[ "${ETRNL_INSTALL_STARTUP:-0}" == "1" || ! -f "$TARGET/CLAUDE.md" ]]; then
  cp -- "$ROOT/templates/CLAUDE.md" "$TARGET/CLAUDE.md"
fi
# Codex startup files — same ETRNL_INSTALL_STARTUP gating as Claude startup files
if [[ "${ETRNL_INSTALL_STARTUP:-0}" == "1" || ! -f "$CODEX_TARGET/AGENTS.md" ]]; then
  cp -- "$ROOT/templates/AGENTS.global.md" "$CODEX_TARGET/AGENTS.md"
fi
if [[ "${ETRNL_INSTALL_STARTUP:-0}" == "1" || ! -f "$CODEX_TARGET/AGENTS.override.md" ]]; then
  cp -- "$ROOT/templates/AGENTS.override.codex.md" "$CODEX_TARGET/AGENTS.override.md"
fi
# Sync rules/eternal-saas/{global,project} to ~/.claude/rules/eternal-saas/ with atomic swap.
# init-project-rules.sh installs BOTH scopes into a target project and sync-rule-exports.mjs
# reads them, so the installed home needs the project templates as source material, not just
# the global digest. Missing project rules previously broke init-project-rules and the
# installed workflow-tool test harness.
for eternal_saas_scope in global project; do
  eternal_saas_src="$ROOT/rules/eternal-saas/$eternal_saas_scope"
  [[ -d "$eternal_saas_src" ]] || continue
  eternal_saas_dest="$TARGET/rules/eternal-saas/$eternal_saas_scope"
  eternal_saas_tmp="$eternal_saas_dest.tmp"
  eternal_saas_old="$eternal_saas_dest.old"
  mkdir -p "$TARGET/rules/eternal-saas"
  rm -rf -- "$eternal_saas_tmp" "$eternal_saas_old"
  cp -R -- "$eternal_saas_src" "$eternal_saas_tmp"
  if [[ -d "$eternal_saas_dest" ]]; then
    mv -- "$eternal_saas_dest" "$eternal_saas_old"
  fi
  if mv -- "$eternal_saas_tmp" "$eternal_saas_dest"; then
    rm -rf -- "$eternal_saas_old"
  else
    [[ ! -d "$eternal_saas_old" ]] || mv -- "$eternal_saas_old" "$eternal_saas_dest"
    rm -rf -- "$eternal_saas_tmp"
    exit 1
  fi
done
cp -- "$ROOT/tests/test-hooks.sh" "$TARGET/tests/test-hooks.sh"
cp -- "$ROOT/tests/test-workflow-tools.sh" "$TARGET/tests/test-workflow-tools.sh"
cp -- "$ROOT/tests/lib/harness.sh" "$TARGET/tests/lib/harness.sh"
cp -- "$ROOT/tests/lib/busy-port-server.mjs" "$TARGET/tests/lib/busy-port-server.mjs"
copy_dir_contents "$ROOT/tests/fixtures" "$TARGET/tests/fixtures"
ln -sf -- "../tests/test-hooks.sh" "$TARGET/hooks/test-hooks.sh"
ln -sf -- "../tests/test-workflow-tools.sh" "$TARGET/hooks/test-workflow-tools.sh"
mkdir -p "$TARGET/hooks/lib"
ln -sf -- "../../tests/lib/harness.sh" "$TARGET/hooks/lib/test-harness.sh"
copy_control_scripts "$TARGET"
copy_control_scripts "$CODEX_TARGET"
copy_profile_templates "$TARGET"
copy_profile_templates "$CODEX_TARGET"
chmod +x "$TARGET/hooks/test-hooks.sh" "$TARGET/hooks/test-workflow-tools.sh" "$TARGET/tests/test-hooks.sh" "$TARGET/tests/test-workflow-tools.sh" "$TARGET/scripts/"*.sh
chmod_control_scripts "$TARGET"
chmod_control_scripts "$CODEX_TARGET"

if [[ "$RESET_CLAUDE_SETTINGS" == "1" ]]; then
  reset_settings_preserving_enabled_plugins "$TARGET/settings.json" "$BACKUP/settings.json"
fi
node "$ROOT/scripts/merge-settings.mjs" "$TARGET/settings.json" "$SETTINGS_TEMPLATE"
node "$ROOT/scripts/settings-audit.mjs" "$TARGET/settings.json" --fix >/dev/null
if [[ "$PROFILE" == "full" && "$SKIP_HINDSIGHT" != "1" ]]; then
  settings_tmp="$(mktemp "$TARGET/settings.json.tmp.XXXXXX")"
  if ! jq '.enabledPlugins = (.enabledPlugins // {}) | .enabledPlugins["hindsight-memory@hindsight"] = true' "$TARGET/settings.json" >"$settings_tmp"; then
    rm -f "$settings_tmp"
    printf 'install error: failed to enable Hindsight plugin in settings.json\n' >&2
    exit 1
  fi
  if [[ ! -s "$settings_tmp" ]]; then
    rm -f "$settings_tmp"
    printf 'install error: Hindsight settings update produced an empty file\n' >&2
    exit 1
  fi
  install -m 600 "$settings_tmp" "$TARGET/settings.json"
  rm -f "$settings_tmp"
fi
if [[ "$legacy_rules_present" == "1" ]]; then
  rm -rf -- "$TARGET/rules/eternal-control"
fi

write_install_metadata() {
  local install_home="$1"
  local install_settings_mode="$2"
  local commit branch dirty fingerprint version metadata_tmp source_git_available settings_mode
  local fingerprint_stderr_file version_stderr_file update_check_error
  local git_output
  if ! command -v jq >/dev/null 2>&1; then
    printf 'install error: jq not found; please install jq\n' >&2
    return 1
  fi
  if git_output="$(git -C "$ROOT" rev-parse HEAD 2>&1)"; then
    commit="$git_output"
    source_git_available=true
  else
    printf 'install warning: git commit metadata unavailable: %s\n' "$git_output" >&2
    commit="unknown"
    source_git_available=false
  fi
  if git_output="$(git -C "$ROOT" branch --show-current 2>&1)"; then
    branch="${git_output:-unknown}"
  else
    printf 'install warning: git branch metadata unavailable: %s\n' "$git_output" >&2
    branch="unknown"
    source_git_available=false
  fi
  if git_output="$(git -C "$ROOT" status --porcelain 2>&1)"; then
    if [[ -n "$git_output" ]]; then
      dirty=true
    else
      dirty=false
    fi
  else
    printf 'install warning: git dirty-state metadata unavailable: %s\n' "$git_output" >&2
    dirty=false
    source_git_available=false
  fi
  fingerprint_stderr_file="$(mktemp "${TMPDIR:-/tmp}/cc-install-fingerprint-stderr.XXXXXX")"
  if ! fingerprint="$(node "$ROOT/scripts/update-check.mjs" --fingerprint-source "$ROOT" 2>"$fingerprint_stderr_file")"; then
    update_check_error="$(tr '\n' ' ' <"$fingerprint_stderr_file")"
    rm -f "$fingerprint_stderr_file"
    printf 'install error: update-check --fingerprint-source failed: %s\n' "${update_check_error:-unknown error}" >&2
    return 1
  fi
  rm -f "$fingerprint_stderr_file"
  version_stderr_file="$(mktemp "${TMPDIR:-/tmp}/cc-install-version-stderr.XXXXXX")"
  if ! version="$(node "$ROOT/scripts/update-check.mjs" --source-version "$ROOT" 2>"$version_stderr_file")"; then
    update_check_error="$(tr '\n' ' ' <"$version_stderr_file")"
    rm -f "$version_stderr_file"
    printf 'install error: update-check --source-version failed: %s\n' "${update_check_error:-unknown error}" >&2
    return 1
  fi
  rm -f "$version_stderr_file"
  mkdir -p "$install_home/etrnl"
  metadata_tmp="$(mktemp "$install_home/etrnl/install.json.tmp.XXXXXX")"
  settings_mode="$install_settings_mode"
  jq -n \
    --arg sourceRoot "$ROOT" \
    --arg sourceCommit "$commit" \
    --arg sourceCommitShort "${commit:0:12}" \
    --arg sourceBranch "$branch" \
    --arg sourceFingerprint "$fingerprint" \
    --arg sourceVersion "$version" \
    --arg settingsMode "$settings_mode" \
    --arg stackProfile "$PROFILE" \
    --arg installedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson sourceGitAvailable "$source_git_available" \
    --argjson sourceDirty "$dirty" \
    '{sourceRoot:$sourceRoot,sourceCommit:$sourceCommit,sourceCommitShort:$sourceCommitShort,sourceBranch:$sourceBranch,sourceGitAvailable:$sourceGitAvailable,sourceDirty:$sourceDirty,sourceFingerprint:$sourceFingerprint,sourceVersion:$sourceVersion,settingsMode:$settingsMode,stackProfile:$stackProfile,installedAt:$installedAt}' >"$metadata_tmp"
  install -m 600 "$metadata_tmp" "$install_home/etrnl/install.json"
  rm -f "$metadata_tmp"
}
write_install_metadata "$TARGET" "$(settings_mode_for_template "$SETTINGS_TEMPLATE")"
write_install_metadata "$CODEX_TARGET" "codex"

is_declared_indexed_array() {
  local name="$1"
  local declaration
  if ! declaration="$(declare -p "$name" 2>/dev/null)"; then
    return 1
  fi
  [[ "$declaration" == "declare -a "* ]]
}

verify_install_state() {
  local missing=() file
  if is_declared_indexed_array CRITICAL_HOOKS && (( ${#CRITICAL_HOOKS[@]} > 0 )); then
    for file in "${CRITICAL_HOOKS[@]}"; do
      [[ -f "$TARGET/hooks/$file" ]] || missing+=("hooks/$file")
    done
  else
    missing+=("scripts/lib/skill-lists.sh: CRITICAL_HOOKS missing or empty")
  fi
  if is_declared_indexed_array CRITICAL_SCRIPTS && (( ${#CRITICAL_SCRIPTS[@]} > 0 )); then
    for file in "${CRITICAL_SCRIPTS[@]}"; do
      [[ -f "$TARGET/scripts/$file" ]] || missing+=("scripts/$file")
    done
  else
    missing+=("scripts/lib/skill-lists.sh: CRITICAL_SCRIPTS missing or empty")
  fi
  [[ -f "$TARGET/settings.json" ]] || missing+=("settings.json")
  [[ -f "$TARGET/etrnl/install.json" ]] || missing+=("etrnl/install.json")
  [[ -f "$TARGET/templates/stack-profile.$PROFILE.json" ]] || missing+=("templates/stack-profile.$PROFILE.json")
  [[ -f "$TARGET/templates/hindsight/claude-code.local-daemon.json" ]] || missing+=("templates/hindsight/claude-code.local-daemon.json")
  [[ -x "$TARGET/scripts/update.sh" ]] || missing+=("scripts/update.sh")
  [[ -f "$CODEX_TARGET/etrnl/install.json" ]] || missing+=("codex etrnl/install.json")
  [[ -x "$CODEX_TARGET/scripts/update-check.mjs" ]] || missing+=("codex scripts/update-check.mjs")
  [[ -x "$CODEX_TARGET/scripts/skill-update-prompt.mjs" ]] || missing+=("codex scripts/skill-update-prompt.mjs")
  for file in "${OWNED_SKILLS[@]}"; do
    [[ -f "$TARGET/skills/$file/SKILL.md" ]] || missing+=("skills/$file/SKILL.md")
    [[ -f "$TARGET/commands/$file.md" ]] || missing+=("commands/$file.md")
    [[ -f "$CODEX_TARGET/skills/$file/SKILL.md" ]] || missing+=("codex skills/$file/SKILL.md")
  done
  for file in "${BUNDLED_SKILLS[@]}"; do
    [[ -f "$TARGET/skills/$file/SKILL.md" ]] || missing+=("skills/$file/SKILL.md (bundled)")
    [[ -f "$CODEX_TARGET/skills/$file/SKILL.md" ]] || missing+=("codex skills/$file/SKILL.md (bundled)")
  done
  [[ -f "$TARGET/skills/common/typescript-triggers.md" ]] || missing+=("skills/common/typescript-triggers.md")
  [[ -f "$CODEX_TARGET/skills/common/typescript-triggers.md" ]] || missing+=("codex skills/common/typescript-triggers.md")
  if (( ${#missing[@]} > 0 )); then
    printf 'install error: post-install verification failed - missing files:\n' >&2
    printf '  %s\n' "${missing[@]}" >&2
    return 1
  fi
}
verify_install_state
CLAUDE_HOME="$TARGET" "$TARGET/scripts/post-upgrade-canary.sh"

# Install is verified successful past this point (state check + canary passed).
# Clear the failure trap so trailing best-effort steps (backup pruning, summary
# output) can never print a misleading "install FAILED — roll back" message.
trap - ERR

# Prune old install backups on success, keeping the newest N (default 5, override
# via ETRNL_BACKUP_RETENTION). Backup dir names embed a fixed-width sortable STAMP,
# so lexical order is chronological and the current install's backup is always kept.
prune_old_backups() {
  local backups_dir="$1" retention="$2" d remove_count i
  local sorted=()
  shopt -s nullglob
  local dirs=("$backups_dir"/etrnl-install-*)
  shopt -u nullglob
  (( ${#dirs[@]} <= retention )) && return 0
  while IFS= read -r d; do
    [[ -n "$d" && -d "$d" ]] && sorted+=("$d")
  done < <(printf '%s\n' "${dirs[@]}" | LC_ALL=C sort)
  remove_count=$(( ${#sorted[@]} - retention ))
  for (( i = 0; i < remove_count; i++ )); do
    rm -rf -- "${sorted[$i]}" || printf 'install warning: failed to prune old backup %s\n' "${sorted[$i]}" >&2
  done
}
BACKUP_RETENTION="${ETRNL_BACKUP_RETENTION:-5}"
if [[ ! "$BACKUP_RETENTION" =~ ^[0-9]+$ ]] || (( BACKUP_RETENTION < 1 )); then
  printf 'install warning: invalid ETRNL_BACKUP_RETENTION=%s; using default 5\n' "$BACKUP_RETENTION" >&2
  BACKUP_RETENTION=5
fi
prune_old_backups "$TARGET/backups" "$BACKUP_RETENTION"

printf 'Installed Eternal Stack files. Backup: %s\n' "$BACKUP"
printf 'Installed Codex ETRNL skill/runtime files: %s\n' "$CODEX_TARGET"
printf 'Installed ETRNL agents: %s\n' "${OWNED_AGENTS[*]}"
if [[ "$removed_moved" == "1" ]]; then
  printf 'Moved removed repo-owned skills into backup: %s/skills\n' "$BACKUP"
fi
printf 'Registered hooks from: %s\n' "$SETTINGS_TEMPLATE"
printf 'Run: %s/scripts/doctor-etrnl.sh\n' "$TARGET"

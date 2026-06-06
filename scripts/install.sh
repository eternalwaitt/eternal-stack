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
TARGET="${CLAUDE_HOME:-$HOME/.claude}"
CODEX_TARGET="${CODEX_HOME:-$HOME/.codex}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$TARGET/backups/control-plane-install-$STAMP"
SETTINGS_TEMPLATE="$ROOT/templates/settings.json"
legacy_rules_present=0
DRY_RUN=0

usage() {
  printf 'Usage: %s [--dry-run|-h|--help]\n' "${0##*/}"
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
      printf 'install error: unknown argument: %s\n' "$arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "${CLAUDE_CONTROL_PLANE_ENABLE_STRICT:-0}" == "1" ]]; then
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
    command_file="$target_dir/$skill.md"
    tmp="$(mktemp "$command_file.tmp.XXXXXX")"
    {
      printf '%s\n' '---'
      printf 'description: Invoke the ETRNL %s workflow.\n' "$skill"
      printf 'argument-hint: <request>\n'
      printf '%s\n' '---'
      printf '\n'
      printf 'User request: $ARGUMENTS\n\n'
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

backup_legacy_skills() {
  local target_dir="$1"
  local backup_dir="$2"
  local moved=0
  local skill
  for skill in "${LEGACY_SKILLS[@]}"; do
    if [[ -d "$target_dir/$skill" ]]; then
      mkdir -p "$backup_dir"
      cp -R -- "$target_dir/${skill:?}" "$backup_dir/${skill:?}"
      moved=1
    fi
  done
  printf '%s\n' "$moved"
}

remove_legacy_skills() {
  local target_dir="$1"
  local skill
  for skill in "${LEGACY_SKILLS[@]}"; do
    if [[ -d "$target_dir/$skill" ]]; then
      rm -rf -- "$target_dir/${skill:?}"
    fi
  done
}

copy_control_scripts() {
  local target_home="$1"
  local script
  mkdir -p "$target_home/scripts"
  cp -- "$ROOT/scripts/doctor.sh" "$target_home/scripts/doctor-control-plane.sh"
  ln -sf -- "doctor-control-plane.sh" "$target_home/scripts/doctor.sh"
  for script in "${INSTALL_SCRIPTS[@]}"; do
    cp -- "$ROOT/scripts/$script" "$target_home/scripts/$script"
  done
  mkdir -p "$target_home/scripts/lib"
  copy_dir_contents "$ROOT/scripts/lib" "$target_home/scripts/lib"
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
  local missing=() file agent command_name skill
  for file in \
    "$SETTINGS_TEMPLATE" \
    "$ROOT/templates/AGENTS.md" \
    "$ROOT/templates/CLAUDE.md" \
    "$ROOT/tests/test-hooks.sh" \
    "$ROOT/tests/test-workflow-tools.sh" \
    "$ROOT/tests/lib/harness.sh" \
    "$ROOT/tests/lib/busy-port-server.mjs"; do
    [[ -f "$file" ]] || missing+=("$file")
  done
  for file in hooks skills docs rules/etrnl tests/fixtures scripts/lib; do
    [[ -d "$ROOT/$file" ]] || missing+=("$ROOT/$file")
  done
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
  done
  if (( ${#missing[@]} > 0 )); then
    printf 'install dry-run failed; missing source files:\n' >&2
    printf '  %s\n' "${missing[@]}" >&2
    return 1
  fi
}

if [[ "$DRY_RUN" == "1" ]]; then
  validate_source_install_inputs
  printf 'Dry run: would install Claude control plane files into %s\n' "$TARGET"
  printf 'Dry run: would install Codex skill/runtime files into %s\n' "$CODEX_TARGET"
  printf 'Dry run: would bootstrap CodeGraph/Beads when interactive or CLAUDE_CONTROL_PLANE_BOOTSTRAP_TOOLS=1\n'
  printf 'Dry run: would create backup at %s\n' "$BACKUP"
  printf 'Dry run: registered hooks template would be %s\n' "$SETTINGS_TEMPLATE"
  exit 0
fi

mkdir -p "$TARGET" "$BACKUP"
for file in settings.json settings.local.json CLAUDE.md AGENTS.md; do
  if [[ -f "$TARGET/$file" ]]; then
    cp -- "$TARGET/$file" "$BACKUP/$file"
  fi
done
if [[ -d "$TARGET/rules/etrnl" ]]; then
  mkdir -p "$BACKUP/rules"
  cp -R -- "$TARGET/rules/etrnl" "$BACKUP/rules/etrnl"
fi
if [[ -d "$TARGET/rules/eternal-control" ]]; then
  mkdir -p "$BACKUP/rules"
  cp -R -- "$TARGET/rules/eternal-control" "$BACKUP/rules/eternal-control"
  legacy_rules_present=1
fi
mkdir -p "$BACKUP/hooks"
for hook_file in "${CRITICAL_HOOKS[@]}"; do
  if [[ -f "$TARGET/hooks/$hook_file" ]]; then
    cp -- "$TARGET/hooks/$hook_file" "$BACKUP/hooks/$hook_file"
  fi
done
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
for skill in "${OWNED_SKILLS[@]}"; do
  if [[ -d "$TARGET/skills/$skill" ]]; then
    cp -R -- "$TARGET/skills/$skill" "$BACKUP/skills/$skill"
  fi
done
mkdir -p "$BACKUP/codex-scripts" "$BACKUP/codex-scripts/lib"
for script in doctor.sh doctor-control-plane.sh; do
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
legacy_moved=0
if [[ "$(backup_legacy_skills "$TARGET/skills" "$BACKUP/skills")" == "1" ]]; then
  legacy_moved=1
fi
if [[ "$(backup_legacy_skills "$CODEX_TARGET/skills" "$BACKUP/codex-skills")" == "1" ]]; then
  legacy_moved=1
fi
# Source tests must pass before LEGACY_SKILLS are removed from installed skill homes.
"$ROOT/tests/test-hooks.sh"
"$ROOT/tests/test-workflow-tools.sh"
if [[ "${CLAUDE_CONTROL_PLANE_BOOTSTRAP_TOOLS:-1}" != "0" ]]; then
  if [[ -t 0 || "${CLAUDE_CONTROL_PLANE_BOOTSTRAP_TOOLS:-}" == "1" ]]; then
    bootstrap_args=(install --yes)
    if [[ "${CLAUDE_CONTROL_PLANE_BOOTSTRAP_PROJECTS:-0}" == "1" ]]; then
      bootstrap_args+=(--project "$ROOT")
    else
      bootstrap_args+=(--skip-project)
    fi
    "$ROOT/scripts/bootstrap-tools.sh" "${bootstrap_args[@]}"
  else
    printf 'Tool bootstrap skipped in non-interactive install. Run: %s/scripts/bootstrap-tools.sh install --yes --project %q\n' "$ROOT" "$ROOT"
  fi
fi
remove_legacy_skills "$TARGET/skills"
remove_legacy_skills "$CODEX_TARGET/skills"

mkdir -p "$TARGET/hooks" "$TARGET/scripts" "$TARGET/docs/templates" "$TARGET/skills" "$TARGET/agents" "$TARGET/commands" "$TARGET/rules" "$TARGET/tests/lib" "$TARGET/tests/fixtures"
copy_dir_contents "$ROOT/hooks" "$TARGET/hooks"
sync_owned_skills "$ROOT/skills" "$TARGET/skills"
sync_owned_skills "$ROOT/skills" "$CODEX_TARGET/skills" "$BACKUP/codex-skills"
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
if [[ "${CLAUDE_CONTROL_PLANE_INSTALL_STARTUP:-0}" == "1" || ! -f "$TARGET/AGENTS.md" ]]; then
  cp -- "$ROOT/templates/AGENTS.md" "$TARGET/AGENTS.md"
fi
if [[ "${CLAUDE_CONTROL_PLANE_INSTALL_STARTUP:-0}" == "1" || ! -f "$TARGET/CLAUDE.md" ]]; then
  cp -- "$ROOT/templates/CLAUDE.md" "$TARGET/CLAUDE.md"
fi
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
chmod +x "$TARGET/hooks/test-hooks.sh" "$TARGET/hooks/test-workflow-tools.sh" "$TARGET/tests/test-hooks.sh" "$TARGET/tests/test-workflow-tools.sh" "$TARGET/scripts/"*.sh
chmod_control_scripts "$TARGET"
chmod_control_scripts "$CODEX_TARGET"

node "$ROOT/scripts/merge-settings.mjs" "$TARGET/settings.json" "$SETTINGS_TEMPLATE"
node "$ROOT/scripts/settings-audit.mjs" "$TARGET/settings.json" --fix >/dev/null
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
  mkdir -p "$install_home/control-plane"
  metadata_tmp="$(mktemp "$install_home/control-plane/install.json.tmp.XXXXXX")"
  settings_mode="$install_settings_mode"
  jq -n \
    --arg sourceRoot "$ROOT" \
    --arg sourceCommit "$commit" \
    --arg sourceCommitShort "${commit:0:12}" \
    --arg sourceBranch "$branch" \
    --arg sourceFingerprint "$fingerprint" \
    --arg sourceVersion "$version" \
    --arg settingsMode "$settings_mode" \
    --arg installedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson sourceGitAvailable "$source_git_available" \
    --argjson sourceDirty "$dirty" \
    '{sourceRoot:$sourceRoot,sourceCommit:$sourceCommit,sourceCommitShort:$sourceCommitShort,sourceBranch:$sourceBranch,sourceGitAvailable:$sourceGitAvailable,sourceDirty:$sourceDirty,sourceFingerprint:$sourceFingerprint,sourceVersion:$sourceVersion,settingsMode:$settingsMode,installedAt:$installedAt}' >"$metadata_tmp"
  install -m 600 "$metadata_tmp" "$install_home/control-plane/install.json"
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
  [[ -f "$TARGET/control-plane/install.json" ]] || missing+=("control-plane/install.json")
  [[ -x "$TARGET/scripts/update.sh" ]] || missing+=("scripts/update.sh")
  [[ -f "$CODEX_TARGET/control-plane/install.json" ]] || missing+=("codex control-plane/install.json")
  [[ -x "$CODEX_TARGET/scripts/update-check.mjs" ]] || missing+=("codex scripts/update-check.mjs")
  [[ -x "$CODEX_TARGET/scripts/skill-update-prompt.mjs" ]] || missing+=("codex scripts/skill-update-prompt.mjs")
  for file in "${OWNED_SKILLS[@]}"; do
    [[ -f "$TARGET/skills/$file/SKILL.md" ]] || missing+=("skills/$file/SKILL.md")
    [[ -f "$TARGET/commands/$file.md" ]] || missing+=("commands/$file.md")
    [[ -f "$CODEX_TARGET/skills/$file/SKILL.md" ]] || missing+=("codex skills/$file/SKILL.md")
  done
  if (( ${#missing[@]} > 0 )); then
    printf 'install error: post-install verification failed — missing files:\n' >&2
    printf '  %s\n' "${missing[@]}" >&2
    return 1
  fi
}
verify_install_state
CLAUDE_HOME="$TARGET" "$TARGET/scripts/post-upgrade-canary.sh"

printf 'Installed Claude control plane files. Backup: %s\n' "$BACKUP"
printf 'Installed Codex ETRNL skill/runtime files: %s\n' "$CODEX_TARGET"
printf 'Installed ETRNL agents: %s\n' "${OWNED_AGENTS[*]}"
if [[ "$legacy_moved" == "1" ]]; then
  printf 'Moved legacy repo-owned skills into backup: %s/skills\n' "$BACKUP"
fi
printf 'Registered hooks from: %s\n' "$SETTINGS_TEMPLATE"
printf 'Run: %s/scripts/doctor-control-plane.sh\n' "$TARGET"

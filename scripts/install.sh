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
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$TARGET/backups/control-plane-install-$STAMP"
SETTINGS_TEMPLATE="$ROOT/templates/settings.json"
legacy_rules_present=0

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

mkdir -p "$BACKUP/skills"
for skill in "${OWNED_SKILLS[@]}"; do
  if [[ -d "$TARGET/skills/$skill" ]]; then
    cp -R -- "$TARGET/skills/$skill" "$BACKUP/skills/$skill"
  fi
done
legacy_moved=0
for skill in "${LEGACY_SKILLS[@]}"; do
  if [[ -d "$TARGET/skills/$skill" ]]; then
    cp -R -- "$TARGET/skills/$skill" "$BACKUP/skills/$skill"
    legacy_moved=1
  fi
done
# Source tests must pass before LEGACY_SKILLS are removed from $TARGET/skills.
"$ROOT/tests/test-hooks.sh"
"$ROOT/tests/test-workflow-tools.sh"
for skill in "${LEGACY_SKILLS[@]}"; do
  if [[ -d "$TARGET/skills/$skill" ]]; then
    rm -rf -- "$TARGET/skills/$skill"
  fi
done

mkdir -p "$TARGET/hooks" "$TARGET/scripts" "$TARGET/docs/templates" "$TARGET/skills" "$TARGET/agents" "$TARGET/rules" "$TARGET/tests/lib" "$TARGET/tests/fixtures"
copy_dir_contents "$ROOT/hooks" "$TARGET/hooks"
copy_dir_contents "$ROOT/skills" "$TARGET/skills"
for agent in "${OWNED_AGENTS[@]}"; do
  cp -- "$ROOT/agents/$agent.md" "$TARGET/agents/$agent.md"
done
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
cp -- "$ROOT/scripts/doctor.sh" "$TARGET/scripts/doctor-control-plane.sh"
ln -sf -- "doctor-control-plane.sh" "$TARGET/scripts/doctor.sh"
cp -- "$ROOT/scripts/code-health-inventory.mjs" "$TARGET/scripts/code-health-inventory.mjs"
cp -- "$ROOT/scripts/documentation-comment-health.mjs" "$TARGET/scripts/documentation-comment-health.mjs"
cp -- "$ROOT/scripts/documentation-health-ledger-check.mjs" "$TARGET/scripts/documentation-health-ledger-check.mjs"
cp -- "$ROOT/scripts/merge-settings.mjs" "$TARGET/scripts/merge-settings.mjs"
cp -- "$ROOT/scripts/settings-audit.mjs" "$TARGET/scripts/settings-audit.mjs"
cp -- "$ROOT/scripts/plan-readiness-check.mjs" "$TARGET/scripts/plan-readiness-check.mjs"
cp -- "$ROOT/scripts/agent-task-packet-check.mjs" "$TARGET/scripts/agent-task-packet-check.mjs"
cp -- "$ROOT/scripts/guard-override-token.mjs" "$TARGET/scripts/guard-override-token.mjs"
cp -- "$ROOT/scripts/replay-hook-fixtures.mjs" "$TARGET/scripts/replay-hook-fixtures.mjs"
cp -- "$ROOT/scripts/execution-ledger.mjs" "$TARGET/scripts/execution-ledger.mjs"
cp -- "$ROOT/scripts/execute-evidence-check.mjs" "$TARGET/scripts/execute-evidence-check.mjs"
cp -- "$ROOT/scripts/execution-wave-check.mjs" "$TARGET/scripts/execution-wave-check.mjs"
cp -- "$ROOT/scripts/review-log.mjs" "$TARGET/scripts/review-log.mjs"
cp -- "$ROOT/scripts/project-buglog.mjs" "$TARGET/scripts/project-buglog.mjs"
cp -- "$ROOT/scripts/browser-qa-report.mjs" "$TARGET/scripts/browser-qa-report.mjs"
cp -- "$ROOT/scripts/context-state.mjs" "$TARGET/scripts/context-state.mjs"
cp -- "$ROOT/scripts/workflow-health.mjs" "$TARGET/scripts/workflow-health.mjs"
cp -- "$ROOT/scripts/prompt-budget-check.mjs" "$TARGET/scripts/prompt-budget-check.mjs"
cp -- "$ROOT/scripts/skill-contract-check.mjs" "$TARGET/scripts/skill-contract-check.mjs"
cp -- "$ROOT/scripts/skill-behavior-smoke.mjs" "$TARGET/scripts/skill-behavior-smoke.mjs"
cp -- "$ROOT/scripts/changelog-release-check.mjs" "$TARGET/scripts/changelog-release-check.mjs"
cp -- "$ROOT/scripts/port-guard.mjs" "$TARGET/scripts/port-guard.mjs"
cp -- "$ROOT/scripts/research-competitor-intel.mjs" "$TARGET/scripts/research-competitor-intel.mjs"
cp -- "$ROOT/scripts/update-check.mjs" "$TARGET/scripts/update-check.mjs"
cp -- "$ROOT/scripts/update.sh" "$TARGET/scripts/update.sh"
cp -- "$ROOT/scripts/uninstall.sh" "$TARGET/scripts/uninstall.sh"
cp -- "$ROOT/scripts/canary-websearch.sh" "$TARGET/scripts/canary-websearch.sh"
cp -- "$ROOT/scripts/canary-hindsight.sh" "$TARGET/scripts/canary-hindsight.sh"
cp -- "$ROOT/scripts/post-upgrade-canary.sh" "$TARGET/scripts/post-upgrade-canary.sh"
cp -- "$ROOT/scripts/rollback-local.sh" "$TARGET/scripts/rollback-local.sh"
mkdir -p "$TARGET/scripts/lib"
copy_dir_contents "$ROOT/scripts/lib" "$TARGET/scripts/lib"
chmod +x "$TARGET/hooks/test-hooks.sh" "$TARGET/hooks/test-workflow-tools.sh" "$TARGET/tests/test-hooks.sh" "$TARGET/tests/test-workflow-tools.sh" "$TARGET/scripts/"*.sh
for script in "$TARGET/scripts/"*.mjs; do
  if [[ -f "$script" ]] && IFS= read -r first_line <"$script" && [[ "$first_line" == "#!"* ]]; then
    chmod +x "$script"
  fi
done

node "$ROOT/scripts/merge-settings.mjs" "$TARGET/settings.json" "$SETTINGS_TEMPLATE"
node "$ROOT/scripts/settings-audit.mjs" "$TARGET/settings.json" --fix >/dev/null
if [[ "$legacy_rules_present" == "1" ]]; then
  rm -rf -- "$TARGET/rules/eternal-control"
fi

write_install_metadata() {
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
  mkdir -p "$TARGET/control-plane"
  metadata_tmp="$(mktemp "$TARGET/control-plane/install.json.tmp.XXXXXX")"
  settings_mode="$(settings_mode_for_template "$SETTINGS_TEMPLATE")"
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
  install -m 600 "$metadata_tmp" "$TARGET/control-plane/install.json"
  rm -f "$metadata_tmp"
}
write_install_metadata

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
  if (( ${#missing[@]} > 0 )); then
    printf 'install error: post-install verification failed — missing files:\n' >&2
    printf '  %s\n' "${missing[@]}" >&2
    return 1
  fi
}
verify_install_state
CLAUDE_HOME="$TARGET" "$TARGET/scripts/post-upgrade-canary.sh"

printf 'Installed Claude control plane files. Backup: %s\n' "$BACKUP"
printf 'Installed ETRNL agents: %s\n' "${OWNED_AGENTS[*]}"
if [[ "$legacy_moved" == "1" ]]; then
  printf 'Moved legacy repo-owned skills into backup: %s/skills\n' "$BACKUP"
fi
printf 'Registered hooks from: %s\n' "$SETTINGS_TEMPLATE"
printf 'Run: %s/scripts/doctor-control-plane.sh\n' "$TARGET"

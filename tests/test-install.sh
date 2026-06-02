#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"
# shellcheck source=./scripts/lib/skill-lists.sh
source ./scripts/lib/skill-lists.sh
# shellcheck source=./tests/lib/harness.sh
source ./tests/lib/harness.sh
cc_test_init
export CLAUDE_HOME="$TMPROOT/claude"
export CLAUDE_GUARD_STATE_DIR="$TMPROOT/state"

dry_run_home="$TMPROOT/dry-run-claude"
if CLAUDE_HOME="$dry_run_home" "$ROOT/scripts/install.sh" --dry-run >/dev/null; then
  ok "install dry-run succeeds"
else
  not_ok "install dry-run succeeds"
fi
assert_no_directory "install dry-run does not create Claude home" "$dry_run_home"

"$ROOT/scripts/install.sh" >/dev/null

for agent in etrnl-adversary etrnl-browser-qa etrnl-design-reviewer etrnl-dx-reviewer etrnl-executor etrnl-investigator etrnl-quality-reviewer etrnl-scout etrnl-spec-reviewer; do
  assert_file "installed $agent" "$CLAUDE_HOME/agents/$agent.md"
done
for command_name in "${OWNED_COMMANDS[@]}"; do
  assert_file "installed $command_name command" "$CLAUDE_HOME/commands/$command_name.md"
done
assert_executable "installed execution ledger helper" "$CLAUDE_HOME/scripts/execution-ledger.mjs"
assert_executable "installed deep-stack helper" "$CLAUDE_HOME/scripts/deep-stack-check.mjs"
assert_file "installed deep-stack artifact library" "$CLAUDE_HOME/scripts/lib/deep-stack-artifacts.mjs"
assert_executable "installed review log helper" "$CLAUDE_HOME/scripts/review-log.mjs"
assert_executable "installed project buglog helper" "$CLAUDE_HOME/scripts/project-buglog.mjs"
assert_executable "installed browser QA helper" "$CLAUDE_HOME/scripts/browser-qa-report.mjs"
assert_executable "installed context helper" "$CLAUDE_HOME/scripts/context-state.mjs"
assert_executable "installed wave helper" "$CLAUDE_HOME/scripts/execution-wave-check.mjs"
assert_executable "installed workflow health helper" "$CLAUDE_HOME/scripts/workflow-health.mjs"
assert_executable "installed override token helper" "$CLAUDE_HOME/scripts/guard-override-token.mjs"
assert_executable "installed replay fixture helper" "$CLAUDE_HOME/scripts/replay-hook-fixtures.mjs"
assert_executable "installed skill contract helper" "$CLAUDE_HOME/scripts/skill-contract-check.mjs"
assert_executable "installed skill behavior smoke helper" "$CLAUDE_HOME/scripts/skill-behavior-smoke.mjs"
assert_executable "installed changelog release helper" "$CLAUDE_HOME/scripts/changelog-release-check.mjs"
assert_executable "installed port guard helper" "$CLAUDE_HOME/scripts/port-guard.mjs"
assert_executable "installed update check helper" "$CLAUDE_HOME/scripts/update-check.mjs"
assert_executable "installed codex RTK pre-tool hook" "$CLAUDE_HOME/scripts/codex-rtk-pre-tool-use.sh"
assert_executable "installed update helper" "$CLAUDE_HOME/scripts/update.sh"
assert_executable "installed uninstall helper" "$CLAUDE_HOME/scripts/uninstall.sh"
assert_executable "installed workflow tool tests" "$CLAUDE_HOME/hooks/test-workflow-tools.sh"
assert_file "installed test harness" "$CLAUDE_HOME/hooks/lib/test-harness.sh"
assert_file "installed busy-port helper" "$CLAUDE_HOME/tests/lib/busy-port-server.mjs"
assert_symlink "installed hook test symlink" "$CLAUDE_HOME/hooks/test-hooks.sh"
assert_symlink "installed workflow test symlink" "$CLAUDE_HOME/hooks/test-workflow-tools.sh"
assert_symlink "installed harness symlink" "$CLAUDE_HOME/hooks/lib/test-harness.sh"
assert_executable "installed source-style hook tests" "$CLAUDE_HOME/tests/test-hooks.sh"
assert_executable "installed source-style workflow tests" "$CLAUDE_HOME/tests/test-workflow-tools.sh"
assert_file "installed source-style test harness" "$CLAUDE_HOME/tests/lib/harness.sh"
assert_file "installed guard-pattern fixture" "$CLAUDE_HOME/tests/fixtures/guard-patterns/invalid-01-grep-direct.json"
assert_file "installed packet fixture" "$CLAUDE_HOME/tests/fixtures/events/packet-valid-01-readonly.json"
if compgen -G "$CLAUDE_HOME/hooks/__pycache__/*cc-hindsight-lesson*.pyc" >/dev/null; then
  not_ok "install excludes Python bytecode"
else
  ok "install excludes Python bytecode"
fi

# A5: post-install state verification — confirm critical hooks and scripts are present
for hook_file in "${CRITICAL_HOOKS[@]}"; do
  assert_executable "post-install: ${hook_file} present" "$CLAUDE_HOME/hooks/$hook_file"
done
for script_file in "${CRITICAL_SCRIPTS[@]}"; do
  if [[ "$script_file" == lib/* ]]; then
    assert_file "post-install: ${script_file} present" "$CLAUDE_HOME/scripts/$script_file"
  else
    assert_executable "post-install: ${script_file} present" "$CLAUDE_HOME/scripts/$script_file"
  fi
done
assert_file "post-install: settings.json present" "$CLAUDE_HOME/settings.json"
assert_file "post-install: update metadata present" "$CLAUDE_HOME/control-plane/install.json"
if ! command -v jq >/dev/null 2>&1; then
  not_ok "post-install: jq not available for update metadata checks"
  finish_tests
  exit 1
fi
if ! update_json="$(node "$CLAUDE_HOME/scripts/update-check.mjs" --json 2>&1)"; then
  not_ok "post-install: update-check.mjs failed: $update_json"
  finish_tests
  exit 1
fi
assert_json_expr "post-install: update check is clean" "$update_json" '.ok == true and .localUpdateAvailable == false'
assert_json_expr "post-install: drift reports installed skills" "$update_json" ".drift.installedSkillCount >= ${#OWNED_SKILLS[@]}"
assert_json_expr "post-install: drift reports installed agents" "$update_json" ".drift.installedAgentCount >= ${#OWNED_AGENTS[@]}"
assert_json_expr "post-install: drift reports settings mode" "$update_json" '.drift.settingsMode == "default"'
assert_json_expr "post-install: drift reports fresh scripts" "$update_json" '.drift.staleInstalledScripts.count == 0'
if explain_out="$(node "$CLAUDE_HOME/scripts/update-check.mjs" --explain 2>&1)"; then
  assert_contains "post-install: update explain names installed commit" "$explain_out" "Installed commit"
  assert_contains "post-install: update explain names stale scripts" "$explain_out" "Stale installed scripts"
else
  not_ok "post-install: update explain failed: $explain_out"
fi
if canary_output="$("$CLAUDE_HOME/scripts/post-upgrade-canary.sh" 2>&1)"; then
  ok "post-install: post-upgrade canary passes"
else
  not_ok "post-install: post-upgrade canary failed: $canary_output"
fi
metadata_tmp="$CLAUDE_HOME/control-plane/install.json.tmp"
trap '[[ -n "${metadata_tmp:-}" ]] && rm -f "$metadata_tmp"' EXIT
jq '.sourceFingerprint = "stale"' "$CLAUDE_HOME/control-plane/install.json" >"$metadata_tmp"
mv -- "$metadata_tmp" "$CLAUDE_HOME/control-plane/install.json"
metadata_tmp=""
trap - EXIT
if ! stale_update_json="$(node "$CLAUDE_HOME/scripts/update-check.mjs" --json 2>&1)"; then
  not_ok "post-install: stale update-check.mjs failed: $stale_update_json"
  finish_tests
  exit 1
fi
assert_json_expr "post-install: stale metadata detects update" "$stale_update_json" '.ok == true and .localUpdateAvailable == true'

pre_rollback_settings="$(cksum "$CLAUDE_HOME/settings.json")"
if "$CLAUDE_HOME/scripts/rollback-local.sh" --dry-run >/dev/null; then
  ok "rollback dry-run succeeds"
else
  not_ok "rollback dry-run succeeds"
fi
post_rollback_settings="$(cksum "$CLAUDE_HOME/settings.json")"
if [[ "$pre_rollback_settings" == "$post_rollback_settings" ]]; then
  ok "rollback dry-run leaves settings unchanged"
else
  not_ok "rollback dry-run leaves settings unchanged"
fi
assert_file "rollback dry-run leaves installed agent in place" "$CLAUDE_HOME/agents/etrnl-executor.md"

"$CLAUDE_HOME/scripts/rollback-local.sh" >/dev/null
for agent in etrnl-adversary etrnl-browser-qa etrnl-design-reviewer etrnl-dx-reviewer etrnl-executor etrnl-investigator etrnl-quality-reviewer etrnl-scout etrnl-spec-reviewer; do
  assert_no_file "rollback removed $agent" "$CLAUDE_HOME/agents/$agent.md"
done
for skill in "${OWNED_SKILLS[@]}"; do
  assert_no_directory "rollback removed $skill" "$CLAUDE_HOME/skills/$skill"
done
for command_name in "${OWNED_COMMANDS[@]}"; do
  assert_no_file "rollback removed $command_name command" "$CLAUDE_HOME/commands/$command_name.md"
done
for hook_file in "${CRITICAL_HOOKS[@]}"; do
  assert_no_file "rollback removed $hook_file" "$CLAUDE_HOME/hooks/$hook_file"
done
assert_command "rollback leaves settings valid" jq empty "$CLAUDE_HOME/settings.json"

finish_tests

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
export CODEX_HOME="$TMPROOT/codex"
export CLAUDE_GUARD_STATE_DIR="$TMPROOT/state"

dry_run_home="$TMPROOT/dry-run-claude"
dry_run_codex_home="$TMPROOT/dry-run-codex"
if dry_run_out="$(CLAUDE_HOME="$dry_run_home" CODEX_HOME="$dry_run_codex_home" "$ROOT/scripts/install.sh" --dry-run 2>&1)"; then
  ok "install dry-run succeeds"
else
  not_ok "install dry-run succeeds: $dry_run_out"
fi
assert_contains "install dry-run names core profile" "$dry_run_out" "profile=core"
assert_contains "install dry-run names stack validator" "$dry_run_out" "stack-profile-check.mjs"
assert_contains "install dry-run resets Claude settings before applying stack" "$dry_run_out" "reset it to vanilla while preserving enabledPlugins before applying stack hooks"
core_dry_run_out="$(CLAUDE_HOME="$dry_run_home" CODEX_HOME="$dry_run_codex_home" "$ROOT/scripts/install.sh" --profile core --dry-run)"
assert_contains "core profile dry-run skips global memory tools" "$core_dry_run_out" "core profile skips Hindsight, Beads, and CodeGraph bootstrap"
preserve_dry_run_out="$(CLAUDE_HOME="$dry_run_home" CODEX_HOME="$dry_run_codex_home" "$ROOT/scripts/install.sh" --preserve-settings --dry-run)"
assert_contains "preserve settings dry-run keeps merge mode visible" "$preserve_dry_run_out" "preserve existing"
full_dry_run_out="$(CLAUDE_HOME="$dry_run_home" CODEX_HOME="$dry_run_codex_home" "$ROOT/scripts/install.sh" --profile full --yes --dry-run)"
assert_contains "full profile dry-run includes CodeGraph" "$full_dry_run_out" "CodeGraph global tool"
assert_contains "full profile dry-run includes Beads" "$full_dry_run_out" "Beads binary"
assert_contains "full profile dry-run includes Hindsight" "$full_dry_run_out" "Hindsight plugin"
assert_contains "full profile dry-run includes rollback metadata" "$full_dry_run_out" "rollback metadata"
assert_no_directory "install dry-run does not create Claude home" "$dry_run_home"
assert_no_directory "install dry-run does not create Codex home" "$dry_run_codex_home"
assert_command "core stack profile validates" node "$ROOT/scripts/stack-profile-check.mjs" "$ROOT/templates/stack-profile.core.json"
assert_command "full stack profile validates" node "$ROOT/scripts/stack-profile-check.mjs" "$ROOT/templates/stack-profile.full.json"

mkdir -p "$CLAUDE_HOME/skills/etrnl-fix-issue" "$CODEX_HOME/skills/etrnl-fix-issue" "$CLAUDE_HOME/commands"
printf 'legacy claude skill\n' >"$CLAUDE_HOME/skills/etrnl-fix-issue/SKILL.md"
printf 'legacy codex skill\n' >"$CODEX_HOME/skills/etrnl-fix-issue/SKILL.md"
printf 'legacy command\n' >"$CLAUDE_HOME/commands/etrnl-fix-issue.md"
mkdir -p "$CLAUDE_HOME"
cat >"$CLAUDE_HOME/settings.json" <<'JSON'
{
  "autoCompactWindow": 400000,
  "skipAutoPermissionPrompt": true,
  "enabledPlugins": {
    "foreign-plugin@example": true
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/foreign-session-start.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
JSON
"$ROOT/scripts/install.sh" >/dev/null

for agent in etrnl-adversary etrnl-browser-qa etrnl-design-reviewer etrnl-dx-reviewer etrnl-executor etrnl-investigator etrnl-quality-reviewer etrnl-scout etrnl-spec-reviewer; do
  assert_file "installed $agent" "$CLAUDE_HOME/agents/$agent.md"
done
for command_name in "${OWNED_COMMANDS[@]}"; do
  assert_file "installed $command_name command" "$CLAUDE_HOME/commands/$command_name.md"
done
for skill in "${OWNED_SKILLS[@]}"; do
  assert_file "installed Claude skill $skill" "$CLAUDE_HOME/skills/$skill/SKILL.md"
  assert_file "installed Claude slash command $skill" "$CLAUDE_HOME/commands/$skill.md"
  assert_contains "installed Claude slash command $skill carries arguments" "$(cat "$CLAUDE_HOME/commands/$skill.md")" 'User request: $ARGUMENTS'
  assert_file "synced Codex skill $skill" "$CODEX_HOME/skills/$skill/SKILL.md"
done
assert_no_directory "removed legacy Claude etrnl-fix-issue" "$CLAUDE_HOME/skills/etrnl-fix-issue"
assert_no_directory "removed legacy Codex etrnl-fix-issue" "$CODEX_HOME/skills/etrnl-fix-issue"
assert_no_file "removed legacy Claude etrnl-fix-issue command" "$CLAUDE_HOME/commands/etrnl-fix-issue.md"
if cmp -s "$CLAUDE_HOME/skills/etrnl-dev-autoplan/SKILL.md" "$CODEX_HOME/skills/etrnl-dev-autoplan/SKILL.md"; then
  ok "Claude and Codex autoplan skills match"
else
  not_ok "Claude and Codex autoplan skills match"
fi
assert_executable "installed execution ledger helper" "$CLAUDE_HOME/scripts/execution-ledger.mjs"
assert_executable "installed etrnl state helper" "$CLAUDE_HOME/scripts/etrnl-state.mjs"
assert_file "installed etrnl state core library" "$CLAUDE_HOME/scripts/lib/etrnl-state-core.mjs"
assert_executable "installed deep-stack helper" "$CLAUDE_HOME/scripts/deep-stack-check.mjs"
assert_executable "installed deep-audit artifact helper" "$CLAUDE_HOME/scripts/deep-audit-artifact-check.mjs"
assert_file "installed deep-audit category registry" "$CLAUDE_HOME/scripts/lib/deep-audit-categories.mjs"
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
assert_executable "installed skill update prompt helper" "$CLAUDE_HOME/scripts/skill-update-prompt.mjs"
assert_executable "installed stack profile helper" "$CLAUDE_HOME/scripts/stack-profile-check.mjs"
assert_executable "installed tool stack check helper" "$CLAUDE_HOME/scripts/tool-stack-check.mjs"
assert_executable "installed tool bootstrap helper" "$CLAUDE_HOME/scripts/bootstrap-tools.sh"
assert_executable "installed codex RTK pre-tool hook" "$CLAUDE_HOME/scripts/codex-rtk-pre-tool-use.sh"
assert_executable "installed update helper" "$CLAUDE_HOME/scripts/update.sh"
assert_executable "installed uninstall helper" "$CLAUDE_HOME/scripts/uninstall.sh"
assert_file "installed autoplan metadata" "$CLAUDE_HOME/skills/metadata/etrnl-dev-autoplan.json"
assert_file "installed execute metadata" "$CLAUDE_HOME/skills/metadata/etrnl-dev-execute.json"
assert_file "installed Codex metadata" "$CODEX_HOME/control-plane/install.json"
assert_file "installed Codex autoplan metadata" "$CODEX_HOME/skills/metadata/etrnl-dev-autoplan.json"
assert_file "installed stack core profile template" "$CLAUDE_HOME/templates/stack-profile.core.json"
assert_file "installed stack full profile template" "$CLAUDE_HOME/templates/stack-profile.full.json"
assert_file "installed Hindsight local config template" "$CLAUDE_HOME/templates/hindsight/claude-code.local-daemon.json"
assert_executable "installed Codex update check helper" "$CODEX_HOME/scripts/update-check.mjs"
assert_executable "installed Codex skill update prompt helper" "$CODEX_HOME/scripts/skill-update-prompt.mjs"
assert_executable "installed Codex stack profile helper" "$CODEX_HOME/scripts/stack-profile-check.mjs"
assert_executable "installed Codex tool stack check helper" "$CODEX_HOME/scripts/tool-stack-check.mjs"
assert_executable "installed Codex bootstrap helper" "$CODEX_HOME/scripts/bootstrap-tools.sh"
assert_file "installed Codex script library" "$CODEX_HOME/scripts/lib/skill-lists.sh"
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
assert_json_expr "post-install: reset removed risky top-level settings" "$(jq -c . "$CLAUDE_HOME/settings.json")" '(has("autoCompactWindow") | not) and (has("skipAutoPermissionPrompt") | not)'
assert_json_expr "post-install: reset preserved enabled plugin settings" "$(jq -c . "$CLAUDE_HOME/settings.json")" '.enabledPlugins["foreign-plugin@example"] == true'
assert_json_expr "post-install: reset removed foreign hooks before stack merge" "$(jq -c . "$CLAUDE_HOME/settings.json")" '([.hooks.SessionStart[]?.hooks[]?.command // empty | select(test("foreign-session-start"))] | length) == 0'
shopt -s nullglob
backup_settings=("$CLAUDE_HOME"/backups/control-plane-install-*/settings.json)
shopt -u nullglob
if (( ${#backup_settings[@]} == 1 )); then
  ok "post-install: prior Claude settings were backed up"
  assert_json_expr "post-install: backup preserves risky settings for rollback" "$(jq -c . "${backup_settings[0]}")" '.autoCompactWindow == 400000 and .skipAutoPermissionPrompt == true'
else
  not_ok "post-install: prior Claude settings were backed up"
fi
assert_json_expr "post-install: compact restore is synchronous" "$(jq -c . "$CLAUDE_HOME/settings.json")" '([.hooks.SessionStart[]?.hooks[]? | select((.command // "") | test("cc-sessionstart-restore")) | select(.async == true)] | length) == 0'
assert_json_expr "post-install: compact lifecycle hooks registered" "$(jq -c . "$CLAUDE_HOME/settings.json")" '([.hooks.PreCompact[]?.hooks[]?.command | select(test("cc-precompact-save"))] | length) == 1 and ([.hooks.PostCompact[]?.hooks[]?.command | select(test("cc-postcompact-record"))] | length) == 1'
assert_json_expr "post-install: compact companion reminder hooks absent" "$(jq -c . "$CLAUDE_HOME/settings.json")" '([.hooks[]?[]?.hooks[]?.command // empty | select(test("suggest-compact|pre-compact-context|log-compact-event"))] | length) == 0'
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
assert_json_expr "post-install: drift separates recorded and observed settings mode" "$update_json" '.drift.recordedSettingsMode == "default" and .drift.observedSettingsMode == "default" and .drift.settingsModeMismatch == false'
assert_json_expr "post-install: drift reports fresh scripts" "$update_json" '.drift.staleInstalledScripts.count == 0'
if ! codex_update_json="$(CLAUDE_CONTROL_PLANE_TOOL_UPDATE_CHECK=0 node "$CODEX_HOME/scripts/update-check.mjs" --json 2>&1)"; then
  not_ok "post-install: Codex update-check.mjs failed: $codex_update_json"
  finish_tests
  exit 1
fi
assert_json_expr "post-install: Codex update check is clean" "$codex_update_json" '.ok == true and .localUpdateAvailable == false'
assert_json_expr "post-install: Codex drift reports installed skills" "$codex_update_json" ".drift.installedSkillCount >= ${#OWNED_SKILLS[@]}"
assert_json_expr "post-install: Codex drift reports settings mode" "$codex_update_json" '.drift.settingsMode == "codex"'
assert_json_expr "post-install: Codex drift separates recorded and observed settings mode" "$codex_update_json" '.drift.recordedSettingsMode == "codex"'
if ! codex_prompt_json="$(CLAUDE_CONTROL_PLANE_TOOL_UPDATE_CHECK=0 node "$CODEX_HOME/scripts/skill-update-prompt.mjs" --agent codex --skill etrnl-dev-plan --json 2>&1)"; then
  not_ok "post-install: Codex skill update prompt failed: $codex_prompt_json"
  finish_tests
  exit 1
fi
assert_json_expr "post-install: Codex skill prompt is quiet when current" "$codex_prompt_json" '.ok == true and .promptNeeded == false and .agent == "codex" and .skill == "etrnl-dev-plan"'
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
if ! stale_update_json="$(CLAUDE_CONTROL_PLANE_AUTO_UPDATE=0 node "$CLAUDE_HOME/scripts/update-check.mjs" --json 2>&1)"; then
  not_ok "post-install: stale update-check.mjs failed: $stale_update_json"
  finish_tests
  exit 1
fi
assert_json_expr "post-install: stale metadata detects update" "$stale_update_json" '.ok == true and .localUpdateAvailable == true'
codex_metadata_tmp="$CODEX_HOME/control-plane/install.json.tmp"
trap '[[ -n "${codex_metadata_tmp:-}" ]] && rm -f "$codex_metadata_tmp"' EXIT
jq '.sourceFingerprint = "stale"' "$CODEX_HOME/control-plane/install.json" >"$codex_metadata_tmp"
mv -- "$codex_metadata_tmp" "$CODEX_HOME/control-plane/install.json"
codex_metadata_tmp=""
trap - EXIT
if codex_prompt_text="$(CLAUDE_CONTROL_PLANE_AUTO_UPDATE=0 CLAUDE_CONTROL_PLANE_TOOL_UPDATE_CHECK=0 node "$CODEX_HOME/scripts/skill-update-prompt.mjs" --agent codex --skill etrnl-dev-plan --json 2>&1)"; then
  assert_json_expr "post-install: stale Codex skill prompt reports update when auto disabled" "$codex_prompt_text" '.ok == true and .promptNeeded == true and .localUpdateAvailable == true'
else
  not_ok "post-install: stale Codex skill prompt failed: $codex_prompt_text"
fi

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
  assert_no_file "rollback removed $skill slash command" "$CLAUDE_HOME/commands/$skill.md"
  assert_no_directory "rollback removed Codex $skill" "$CODEX_HOME/skills/$skill"
done
assert_no_file "rollback removed Codex update-check helper" "$CODEX_HOME/scripts/update-check.mjs"
assert_no_file "rollback removed Codex skill update prompt helper" "$CODEX_HOME/scripts/skill-update-prompt.mjs"
assert_no_file "rollback removed Codex install metadata" "$CODEX_HOME/control-plane/install.json"
for command_name in "${OWNED_COMMANDS[@]}"; do
  assert_no_file "rollback removed $command_name command" "$CLAUDE_HOME/commands/$command_name.md"
done
for hook_file in "${CRITICAL_HOOKS[@]}"; do
  assert_no_file "rollback removed $hook_file" "$CLAUDE_HOME/hooks/$hook_file"
done
assert_command "rollback leaves settings valid" jq empty "$CLAUDE_HOME/settings.json"

finish_tests

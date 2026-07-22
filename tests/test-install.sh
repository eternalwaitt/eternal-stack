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
# This suite tests install/rollback mechanics and invokes install.sh several times.
# The inline source suites (test-hooks.sh, test-workflow-tools.sh) are separate
# doctor gates in the same pipeline; re-running them inside every install here
# multiplies the dominant cost of the full-install doctor run for no extra coverage.
export ETRNL_INSTALL_SOURCE_TESTS=0

# shellcheck source=./tests/test-install-smoke.sh
source ./tests/test-install-smoke.sh
run_install_smoke_tests

reset_settings_live="$TMPROOT/reset-settings-live"
reset_settings_backup="$TMPROOT/reset-settings-backup"
mkdir -p "$reset_settings_live"
printf '{invalid json\n' >"$reset_settings_live/settings.json"
mkdir -p "$reset_settings_backup"
cat >"$reset_settings_backup/settings.json" <<'JSON'
{
  "enabledPlugins": {
    "backup-plugin@example": true
  },
  "statusLine": {
    "type": "command",
    "command": "bash ~/.claude/statusline.sh"
  }
}
JSON
# shellcheck source=scripts/lib/reset-settings.sh
source "$ROOT/scripts/lib/reset-settings.sh"
reset_settings_out="$(reset_settings_preserving_enabled_plugins "$reset_settings_live/settings.json" "$reset_settings_backup/settings.json" 2>&1)"
assert_contains "reset settings preserves enabledPlugins from backup" "$reset_settings_out" "preserved enabledPlugins and statusLine from install backup"
assert_json_expr "reset settings backup fallback keeps plugins" "$(jq -c . "$reset_settings_live/settings.json")" '.enabledPlugins["backup-plugin@example"] == true'
assert_json_expr "reset settings backup fallback keeps statusLine" "$(jq -c . "$reset_settings_live/settings.json")" '.statusLine.command == "bash ~/.claude/statusline.sh"'

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
  "statusLine": {
    "type": "command",
    "command": "bash ~/.claude/statusline.sh"
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
  assert_contains "installed Claude slash command $skill carries arguments" "$(cat "$CLAUDE_HOME/commands/$skill.md")" "User request: \$ARGUMENTS"
  assert_file "synced Codex skill $skill" "$CODEX_HOME/skills/$skill/SKILL.md"
done
for skill in "${BUNDLED_SKILLS[@]}"; do
  assert_file "installed bundled Claude skill $skill" "$CLAUDE_HOME/skills/$skill/SKILL.md"
  assert_file "synced bundled Codex skill $skill" "$CODEX_HOME/skills/$skill/SKILL.md"
done
assert_file "installed Claude common skill reference" "$CLAUDE_HOME/skills/common/typescript-triggers.md"
assert_file "synced Codex common skill reference" "$CODEX_HOME/skills/common/typescript-triggers.md"
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
assert_file "installed Codex metadata" "$CODEX_HOME/etrnl/install.json"
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

full_home="$TMPROOT/full-profile-claude"
full_codex_home="$TMPROOT/full-profile-codex"
full_fake_bin="$TMPROOT/full-profile-bin"
mkdir -p "$full_fake_bin"
cat >"$full_fake_bin/claude" <<'BASH'
#!/usr/bin/env bash
if [[ "$1" == "plugin" && "$2" == "list" ]]; then
  printf 'hindsight-memory\n'
fi
exit 0
BASH
cat >"$full_fake_bin/uvx" <<'BASH'
#!/usr/bin/env bash
exit 0
BASH
chmod +x "$full_fake_bin/claude" "$full_fake_bin/uvx"
PATH="$full_fake_bin:$PATH" CLAUDE_HOME="$full_home" CODEX_HOME="$full_codex_home" "$ROOT/scripts/install.sh" --profile full --yes --skip-beads --skip-codegraph >/dev/null
assert_json_expr "full profile install enables Hindsight plugin" "$(jq -c . "$full_home/settings.json")" '.enabledPlugins["hindsight-memory@hindsight"] == true'

# A5: post-install state verification - confirm critical hooks and scripts are present
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
assert_json_expr "post-install: reset preserved statusLine" "$(jq -c . "$CLAUDE_HOME/settings.json")" '.statusLine.command == "bash ~/.claude/statusline.sh"'
assert_json_expr "post-install: reset removed foreign hooks before stack merge" "$(jq -c . "$CLAUDE_HOME/settings.json")" '([.hooks.SessionStart[]?.hooks[]?.command // empty | select(test("foreign-session-start"))] | length) == 0'
shopt -s nullglob
backup_settings=("$CLAUDE_HOME"/backups/etrnl-install-*/settings.json)
shopt -u nullglob
if (( ${#backup_settings[@]} >= 1 )); then
  ok "post-install: prior Claude settings were backed up"
  latest_backup="${backup_settings[$((${#backup_settings[@]} - 1))]}"
  assert_json_expr "post-install: backup preserves risky settings for rollback" "$(jq -c . "$latest_backup")" '.autoCompactWindow == 400000 and .skipAutoPermissionPrompt == true'
else
  not_ok "post-install: prior Claude settings were backed up"
fi
assert_json_expr "post-install: compact restore is synchronous" "$(jq -c . "$CLAUDE_HOME/settings.json")" '([.hooks.SessionStart[]?.hooks[]? | select((.command // "") | test("cc-sessionstart-restore")) | select(.async == true)] | length) == 0'
assert_json_expr "post-install: compact lifecycle hooks registered" "$(jq -c . "$CLAUDE_HOME/settings.json")" '([.hooks.PreCompact[]?.hooks[]?.command | select(test("cc-precompact-save"))] | length) == 1 and ([.hooks.PostCompact[]?.hooks[]?.command | select(test("cc-postcompact-record"))] | length) == 1'
assert_json_expr "post-install: compact companion reminder hooks absent" "$(jq -c . "$CLAUDE_HOME/settings.json")" '([.hooks[]?[]?.hooks[]?.command // empty | select(test("suggest-compact|pre-compact-context|log-compact-event"))] | length) == 0'
assert_file "post-install: update metadata present" "$CLAUDE_HOME/etrnl/install.json"
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
if ! codex_update_json="$(ETRNL_TOOL_UPDATE_CHECK=0 node "$CODEX_HOME/scripts/update-check.mjs" --json 2>&1)"; then
  not_ok "post-install: Codex update-check.mjs failed: $codex_update_json"
  finish_tests
  exit 1
fi
assert_json_expr "post-install: Codex update check is clean" "$codex_update_json" '.ok == true and .localUpdateAvailable == false'
assert_json_expr "post-install: Codex drift reports installed skills" "$codex_update_json" ".drift.installedSkillCount >= ${#OWNED_SKILLS[@]}"
assert_json_expr "post-install: Codex drift reports settings mode" "$codex_update_json" '.drift.settingsMode == "codex"'
assert_json_expr "post-install: Codex drift separates recorded and observed settings mode" "$codex_update_json" '.drift.recordedSettingsMode == "codex"'
if ! codex_prompt_json="$(ETRNL_TOOL_UPDATE_CHECK=0 node "$CODEX_HOME/scripts/skill-update-prompt.mjs" --agent codex --skill etrnl-dev-plan --json 2>&1)"; then
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
metadata_tmp="$(mktemp "$CLAUDE_HOME/etrnl/install.json.XXXXXX")"
trap 'rm -f "$metadata_tmp"' EXIT
jq '.sourceFingerprint = "stale"' "$CLAUDE_HOME/etrnl/install.json" >"$metadata_tmp"
mv -- "$metadata_tmp" "$CLAUDE_HOME/etrnl/install.json"
trap - EXIT
if ! stale_update_json="$(ETRNL_AUTO_UPDATE=0 node "$CLAUDE_HOME/scripts/update-check.mjs" --json 2>&1)"; then
  not_ok "post-install: stale update-check.mjs failed: $stale_update_json"
  finish_tests
  exit 1
fi
assert_json_expr "post-install: stale metadata detects update" "$stale_update_json" '.ok == true and .localUpdateAvailable == true'
codex_metadata_tmp="$(mktemp "$CODEX_HOME/etrnl/install.json.XXXXXX")"
trap 'rm -f "$codex_metadata_tmp"' EXIT
jq '.sourceFingerprint = "stale"' "$CODEX_HOME/etrnl/install.json" >"$codex_metadata_tmp"
mv -- "$codex_metadata_tmp" "$CODEX_HOME/etrnl/install.json"
trap - EXIT
if codex_prompt_text="$(ETRNL_AUTO_UPDATE=0 ETRNL_TOOL_UPDATE_CHECK=0 node "$CODEX_HOME/scripts/skill-update-prompt.mjs" --agent codex --skill etrnl-dev-plan --json 2>&1)"; then
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

# Dry-run path-count must not double-print when the new-source-paths manifest has no
# non-blank lines: `grep -c .` prints 0 AND exits 1 there, so a `|| printf '0'` fallback
# would append a second 0 (garbled "0\n0" count). Blank the manifest to force that path,
# assert a clean single count, then restore the exact bytes so the real rollback below
# (which reads the manifest) is unaffected.
shopt -s nullglob
rb_backup_dirs=("$CLAUDE_HOME"/backups/etrnl-install-*)
shopt -u nullglob
if (( ${#rb_backup_dirs[@]} >= 1 )); then
  rb_backup="${rb_backup_dirs[$((${#rb_backup_dirs[@]} - 1))]}"
  rb_manifest="$rb_backup/new-source-paths.txt"
  if [[ -f "$rb_manifest" ]]; then
    cp -p "$rb_manifest" "$rb_manifest.savebak"
    printf '\n\n' >"$rb_manifest"   # only blank lines: grep -c . prints 0 and exits 1
    rb_dry_out="$("$CLAUDE_HOME/scripts/rollback-local.sh" --dry-run 2>&1)"
    mv -f "$rb_manifest.savebak" "$rb_manifest"   # restore exact bytes before the real rollback
    if printf '%s' "$rb_dry_out" | grep -Eq 'would remove 0 path\(s\)'; then
      ok "rollback dry-run prints a clean zero path-count on a blank manifest"
    else
      not_ok "rollback dry-run prints a clean zero path-count on a blank manifest: $rb_dry_out"
    fi
  fi
fi

"$CLAUDE_HOME/scripts/rollback-local.sh" >/dev/null
for agent in etrnl-adversary etrnl-browser-qa etrnl-design-reviewer etrnl-dx-reviewer etrnl-executor etrnl-investigator etrnl-quality-reviewer etrnl-scout etrnl-spec-reviewer; do
  assert_no_file "rollback removed $agent" "$CLAUDE_HOME/agents/$agent.md"
done
for skill in "${OWNED_SKILLS[@]}"; do
  assert_no_directory "rollback removed $skill" "$CLAUDE_HOME/skills/$skill"
  assert_no_file "rollback removed $skill slash command" "$CLAUDE_HOME/commands/$skill.md"
  assert_no_directory "rollback removed Codex $skill" "$CODEX_HOME/skills/$skill"
done
for skill in "${BUNDLED_SKILLS[@]}"; do
  assert_no_directory "rollback removed bundled $skill" "$CLAUDE_HOME/skills/$skill"
  assert_no_directory "rollback removed bundled Codex $skill" "$CODEX_HOME/skills/$skill"
done
assert_no_directory "rollback removed Claude common skill reference" "$CLAUDE_HOME/skills/common"
assert_no_directory "rollback removed Codex common skill reference" "$CODEX_HOME/skills/common"
assert_no_file "rollback removed Codex update-check helper" "$CODEX_HOME/scripts/update-check.mjs"
assert_no_file "rollback removed Codex skill update prompt helper" "$CODEX_HOME/scripts/skill-update-prompt.mjs"
assert_no_file "rollback removed Codex install metadata" "$CODEX_HOME/etrnl/install.json"
for command_name in "${OWNED_COMMANDS[@]}"; do
  assert_no_file "rollback removed $command_name command" "$CLAUDE_HOME/commands/$command_name.md"
done
for hook_file in "${CRITICAL_HOOKS[@]}"; do
  assert_no_file "rollback removed $hook_file" "$CLAUDE_HOME/hooks/$hook_file"
done
assert_command "rollback leaves settings valid" jq empty "$CLAUDE_HOME/settings.json"

# TG5: install must back up every hook it overwrites (not just CRITICAL_HOOKS), and
# rollback must restore that wider set — non-critical top-level hooks and hooks/lib
# libraries — to their pre-install content. Uses an isolated home pre-seeded with
# sentinel hooks so we can prove the round trip end to end.
wider_home="$TMPROOT/wider-hooks-claude"
wider_codex="$TMPROOT/wider-hooks-codex"
mkdir -p "$wider_home/hooks/lib"
printf 'OLD-CRITICAL-STOP\n' >"$wider_home/hooks/cc-stop-verifier.sh"
printf 'OLD-NONCRITICAL-ROUTER\n' >"$wider_home/hooks/cc-userprompt-router.sh"
printf 'OLD-LIB-STATE\n' >"$wider_home/hooks/lib/state.sh"
# Real prior-installed hooks are executable; the overlay copy preserves the
# existing file mode, so seed them +x to mimic a genuine previous install.
chmod +x "$wider_home/hooks/cc-stop-verifier.sh" "$wider_home/hooks/cc-userprompt-router.sh" "$wider_home/hooks/lib/state.sh"
# Quality MED-1: a user-dropped file under hooks/fixtures or tests/fixtures must
# survive the install prune + overlay via the backup, and rollback must restore it.
mkdir -p "$wider_home/hooks/fixtures" "$wider_home/tests/fixtures"
printf 'USER-DROPPED-HOOK-FIXTURE\n' >"$wider_home/hooks/fixtures/user-dropped.txt"
printf 'USER-DROPPED-TEST-FIXTURE\n' >"$wider_home/tests/fixtures/user-dropped.txt"
# TG9: seed six old backups so this install's own backup makes seven; the success
# prune must keep only the newest five. Names embed a sortable STAMP, so the two
# oldest (…000001, …000002) are the ones removed.
mkdir -p "$wider_home/backups"
for backup_n in 000001 000002 000003 000004 000005 000006; do
  mkdir -p "$wider_home/backups/etrnl-install-20000101-$backup_n"
done
# Ownership of a removed-skill name is decided by durable stack provenance (the
# Codex-startup skill-update-prompt.mjs line), NOT a bare ETRNL mention. Seed two
# skills whose names collide with REMOVED_SKILLS entries:
#   - `commit`  — user-authored, references ETRNL only in prose → must be PRESERVED
#   - `deps`    — carries the skill-update-prompt.mjs signature   → must be REMOVED
mkdir -p "$wider_home/skills/commit" "$wider_home/skills/deps"
printf '%s\n' '---' 'name: commit' '---' '# My Commit Helper' '' \
  'This helper follows the ETRNL commit conventions for eternal stack repos.' \
  >"$wider_home/skills/commit/SKILL.md"
printf '%s\n' '---' 'name: deps' '---' '# Deps' '' \
  'Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill deps`' \
  >"$wider_home/skills/deps/SKILL.md"
# A pre-existing hook symlink pointing at an EXTERNAL file must be unlinked (not
# written through) so the overlay's cp cannot clobber the referent, backed up as a
# link, and restored as a link on rollback. cc-rate-limiter.sh is a real source
# hook, so the overlay overwrites this path.
external_hook_target="$TMPROOT/external-hook-target.sh"
printf 'EXTERNAL-HOOK-SENTINEL\n' >"$external_hook_target"
ln -s "$external_hook_target" "$wider_home/hooks/cc-rate-limiter.sh"
CLAUDE_HOME="$wider_home" CODEX_HOME="$wider_codex" "$ROOT/scripts/install.sh" >/dev/null
shopt -s nullglob
wider_backup_dirs=("$wider_home"/backups/etrnl-install-*)
shopt -u nullglob
if (( ${#wider_backup_dirs[@]} == 5 )); then
  ok "install prunes old backups to retention limit (5)"
else
  not_ok "install prunes old backups to retention limit (5): found ${#wider_backup_dirs[@]}"
fi
assert_no_directory "install prunes the two oldest backups" "$wider_home/backups/etrnl-install-20000101-000001"
assert_no_directory "install prunes the second-oldest backup" "$wider_home/backups/etrnl-install-20000101-000002"
assert_directory "install keeps the newest pre-existing backup" "$wider_home/backups/etrnl-install-20000101-000006"
if grep -q 'OLD-NONCRITICAL-ROUTER' "$wider_home/hooks/cc-userprompt-router.sh"; then
  not_ok "install overwrites pre-existing non-critical hook with source version"
else
  ok "install overwrites pre-existing non-critical hook with source version"
fi
shopt -s nullglob
wider_backups=("$wider_home"/backups/etrnl-install-*)
shopt -u nullglob
if (( ${#wider_backups[@]} >= 1 )); then
  wider_backup="${wider_backups[$((${#wider_backups[@]} - 1))]}"
  assert_contains "install backs up overwritten non-critical hook" "$(cat "$wider_backup/hooks/cc-userprompt-router.sh" 2>/dev/null || true)" "OLD-NONCRITICAL-ROUTER"
  assert_contains "install backs up overwritten hooks/lib library" "$(cat "$wider_backup/hooks/lib/state.sh" 2>/dev/null || true)" "OLD-LIB-STATE"
  # The overwritten hook symlink is backed up as a link (cp -P), so rollback can
  # restore the original link instead of a dereferenced copy.
  assert_contains "install backs up the overwritten hook symlink as a link" "$(readlink "$wider_backup/hooks/cc-rate-limiter.sh" 2>/dev/null || true)" "$external_hook_target"
else
  not_ok "install created a backup dir for wider hook set"
  not_ok "install backs up overwritten non-critical hook"
  not_ok "install backs up overwritten hooks/lib library"
  not_ok "install backs up the overwritten hook symlink as a link"
fi
# The user-authored `commit` skill survives; the genuine stack `deps` skill (with
# the update-prompt signature) is removed.
assert_directory "install preserves user skill whose name matches a removed stack skill" "$wider_home/skills/commit"
assert_contains "preserved user skill keeps its content" "$(cat "$wider_home/skills/commit/SKILL.md" 2>/dev/null || true)" "My Commit Helper"
assert_no_directory "install removes a stack skill that carries the update-prompt signature" "$wider_home/skills/deps"
# The external referent is untouched (the overlay wrote a real file after unlinking,
# it did not clobber the symlink target), and the installed hook is now a real file
# rather than a dangling/live symlink.
assert_contains "install does not write through a hook symlink onto its external target" "$(cat "$external_hook_target" 2>/dev/null || true)" "EXTERNAL-HOOK-SENTINEL"
if [[ -L "$wider_home/hooks/cc-rate-limiter.sh" ]]; then
  not_ok "install replaces overwritten hook symlink with a real file"
elif [[ -f "$wider_home/hooks/cc-rate-limiter.sh" ]]; then
  ok "install replaces overwritten hook symlink with a real file"
else
  not_ok "install replaces overwritten hook symlink with a real file"
fi
CLAUDE_HOME="$wider_home" CODEX_HOME="$wider_codex" "$wider_home/scripts/rollback-local.sh" >/dev/null
assert_contains "rollback restores critical hook content" "$(cat "$wider_home/hooks/cc-stop-verifier.sh" 2>/dev/null || true)" "OLD-CRITICAL-STOP"
assert_contains "rollback restores non-critical hook content" "$(cat "$wider_home/hooks/cc-userprompt-router.sh" 2>/dev/null || true)" "OLD-NONCRITICAL-ROUTER"
assert_contains "rollback restores hooks/lib library content" "$(cat "$wider_home/hooks/lib/state.sh" 2>/dev/null || true)" "OLD-LIB-STATE"
assert_contains "rollback restores user-dropped hooks/fixtures file" "$(cat "$wider_home/hooks/fixtures/user-dropped.txt" 2>/dev/null || true)" "USER-DROPPED-HOOK-FIXTURE"
assert_contains "rollback restores user-dropped tests/fixtures file" "$(cat "$wider_home/tests/fixtures/user-dropped.txt" 2>/dev/null || true)" "USER-DROPPED-TEST-FIXTURE"
# Rollback restores the hook as a symlink (not a dereferenced copy) pointing back at
# its original external target.
assert_symlink "rollback restores the overwritten hook as a symlink" "$wider_home/hooks/cc-rate-limiter.sh"
assert_contains "rollback restores the hook symlink's original target" "$(readlink "$wider_home/hooks/cc-rate-limiter.sh" 2>/dev/null || true)" "$external_hook_target"

# ── Directory-level symlink handling ───────────────────────────────────────────
# The scenario above covers a FILE-level hook symlink. These cover the
# directory-level gaps: a symlinked hooks ROOT (rejected before any mutation), a
# nested hooks/lib symlink the overlay materializes then rollback re-links, and
# dangling hooks/fixtures + tests/fixtures symlinks that survive the prune.

# (A) A symlinked hooks ROOT must be rejected before any mutation; `find` skips a
# symlinked root and the overlay `cp -R` would write THROUGH the link, clobbering
# the off-tree referent rollback never captured. Reject and leave it for the user.
symroot_home="$TMPROOT/symroot-claude"
symroot_codex="$TMPROOT/symroot-codex"
mkdir -p "$symroot_home" "$symroot_codex"
symroot_external="$TMPROOT/symroot-external-hooks"
mkdir -p "$symroot_external"
printf 'EXTERNAL-HOOKS-ROOT-SENTINEL\n' >"$symroot_external/keepme.txt"
ln -s "$symroot_external" "$symroot_home/hooks"
if CLAUDE_HOME="$symroot_home" CODEX_HOME="$symroot_codex" "$ROOT/scripts/install.sh" >/dev/null 2>&1; then
  not_ok "install rejects a symlinked hooks root"
else
  ok "install rejects a symlinked hooks root"
fi
assert_contains "install does not write through a symlinked hooks root" "$(cat "$symroot_external/keepme.txt" 2>/dev/null || true)" "EXTERNAL-HOOKS-ROOT-SENTINEL"
assert_symlink "install leaves the symlinked hooks root in place for the user to resolve" "$symroot_home/hooks"

# A symlinked `rules` root must be rejected too: rules/etrnl and rules/eternal-saas/*
# are cp -R subtree swaps under $TARGET/rules, so a symlinked parent is written through
# onto the external target (agents/commands are file-by-file copies and are exempt).
symrules_home="$TMPROOT/symrules-claude"
symrules_codex="$TMPROOT/symrules-codex"
mkdir -p "$symrules_home" "$symrules_codex"
symrules_external="$TMPROOT/symrules-external-rules"
mkdir -p "$symrules_external"
printf 'EXTERNAL-RULES-ROOT-SENTINEL\n' >"$symrules_external/keepme.txt"
ln -s "$symrules_external" "$symrules_home/rules"
if CLAUDE_HOME="$symrules_home" CODEX_HOME="$symrules_codex" "$ROOT/scripts/install.sh" >/dev/null 2>&1; then
  not_ok "install rejects a symlinked rules root"
else
  ok "install rejects a symlinked rules root"
fi
assert_contains "install does not write through a symlinked rules root" "$(cat "$symrules_external/keepme.txt" 2>/dev/null || true)" "EXTERNAL-RULES-ROOT-SENTINEL"
assert_symlink "install leaves the symlinked rules root in place for the user to resolve" "$symrules_home/rules"

# (B)+(C)+(D) A nested hooks/lib symlink (to an external dir) plus dangling
# hooks/fixtures and tests/fixtures symlinks. Install materializes lib as a real
# dir and prunes the fixtures, backing each up as a link; rollback restores lib as
# a symlink (proves the rm -rf-before-cp -P fix) and re-creates the dangling
# fixture links (proves cp -RP + -e||-L and the backup-keyed new-source-paths check
# — without it the removal pass would delete the re-linked hooks/fixtures).
symnest_home="$TMPROOT/symnest-claude"
symnest_codex="$TMPROOT/symnest-codex"
mkdir -p "$symnest_home/hooks"
symnest_extlib="$TMPROOT/symnest-external-lib"
mkdir -p "$symnest_extlib"
printf 'EXTERNAL-LIB-SENTINEL\n' >"$symnest_extlib/marker.txt"
ln -s "$symnest_extlib" "$symnest_home/hooks/lib"
symnest_hooks_dangle="$TMPROOT/symnest-missing-hooks-fixtures"
symnest_tests_dangle="$TMPROOT/symnest-missing-tests-fixtures"
ln -s "$symnest_hooks_dangle" "$symnest_home/hooks/fixtures"
mkdir -p "$symnest_home/tests"
ln -s "$symnest_tests_dangle" "$symnest_home/tests/fixtures"
CLAUDE_HOME="$symnest_home" CODEX_HOME="$symnest_codex" "$ROOT/scripts/install.sh" >/dev/null
if [[ -L "$symnest_home/hooks/lib" ]]; then
  not_ok "install materializes a nested hooks/lib symlink as a real directory"
else
  assert_directory "install materializes a nested hooks/lib symlink as a real directory" "$symnest_home/hooks/lib"
fi
assert_contains "install does not write through the nested hooks/lib symlink" "$(cat "$symnest_extlib/marker.txt" 2>/dev/null || true)" "EXTERNAL-LIB-SENTINEL"
shopt -s nullglob
symnest_backups=("$symnest_home"/backups/etrnl-install-*)
shopt -u nullglob
if (( ${#symnest_backups[@]} >= 1 )); then
  symnest_backup="${symnest_backups[$((${#symnest_backups[@]} - 1))]}"
  assert_symlink "install backs up the nested hooks/lib symlink as a link" "$symnest_backup/hooks/lib"
  assert_contains "backed-up hooks/lib link keeps its external target" "$(readlink "$symnest_backup/hooks/lib" 2>/dev/null || true)" "$symnest_extlib"
  assert_symlink "install backs up the dangling hooks/fixtures symlink as a link" "$symnest_backup/hooks/fixtures"
  assert_symlink "install backs up the dangling tests/fixtures symlink as a link" "$symnest_backup/tests-fixtures"
else
  not_ok "install created a backup dir for the symlinked-nested scenario"
  not_ok "install backs up the nested hooks/lib symlink as a link"
  not_ok "backed-up hooks/lib link keeps its external target"
  not_ok "install backs up the dangling hooks/fixtures symlink as a link"
  not_ok "install backs up the dangling tests/fixtures symlink as a link"
fi
CLAUDE_HOME="$symnest_home" CODEX_HOME="$symnest_codex" "$symnest_home/scripts/rollback-local.sh" >/dev/null
assert_symlink "rollback restores the nested hooks/lib as a symlink" "$symnest_home/hooks/lib"
assert_contains "rollback restores the hooks/lib symlink target" "$(readlink "$symnest_home/hooks/lib" 2>/dev/null || true)" "$symnest_extlib"
assert_contains "rollback does not write through the restored hooks/lib symlink" "$(cat "$symnest_extlib/marker.txt" 2>/dev/null || true)" "EXTERNAL-LIB-SENTINEL"
assert_symlink "rollback restores the dangling hooks/fixtures symlink" "$symnest_home/hooks/fixtures"
assert_contains "rollback restores the hooks/fixtures symlink target" "$(readlink "$symnest_home/hooks/fixtures" 2>/dev/null || true)" "$symnest_hooks_dangle"
assert_symlink "rollback restores the dangling tests/fixtures symlink" "$symnest_home/tests/fixtures"
assert_contains "rollback restores the tests/fixtures symlink target" "$(readlink "$symnest_home/tests/fixtures" 2>/dev/null || true)" "$symnest_tests_dangle"

finish_tests

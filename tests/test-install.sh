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

"$ROOT/scripts/install.sh" >/dev/null

for agent in etrnl-adversary etrnl-browser-qa etrnl-design-reviewer etrnl-dx-reviewer etrnl-executor etrnl-investigator etrnl-quality-reviewer etrnl-scout etrnl-spec-reviewer; do
  assert_file "installed $agent" "$CLAUDE_HOME/agents/$agent.md"
done
assert_executable "installed execution ledger helper" "$CLAUDE_HOME/scripts/execution-ledger.mjs"
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
assert_executable "installed update helper" "$CLAUDE_HOME/scripts/update.sh"
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

"$CLAUDE_HOME/scripts/rollback-local.sh" >/dev/null
for agent in etrnl-adversary etrnl-browser-qa etrnl-design-reviewer etrnl-dx-reviewer etrnl-executor etrnl-investigator etrnl-quality-reviewer etrnl-scout etrnl-spec-reviewer; do
  assert_no_file "rollback removed $agent" "$CLAUDE_HOME/agents/$agent.md"
done

finish_tests

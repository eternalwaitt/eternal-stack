#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMPROOT="$(mktemp -d)"
export CLAUDE_HOME="$TMPROOT/claude"
export CLAUDE_GUARD_STATE_DIR="$TMPROOT/state"
export CLAUDE_CONTROL_PLANE_RUNS_DIR="$TMPROOT/runs"
export CLAUDE_GUARD_DISABLE_HINDSIGHT_LESSON=1
PASS=0
FAIL=0

cleanup() {
  rm -rf "$TMPROOT"
}
trap cleanup EXIT

ok() {
  PASS=$((PASS + 1))
  printf 'ok %03d - %s\n' "$PASS" "$1"
}

not_ok() {
  FAIL=$((FAIL + 1))
  printf 'not ok - %s\n' "$1" >&2
}

"$ROOT/scripts/install.sh" >/dev/null

for agent in etrnl-adversary etrnl-browser-qa etrnl-design-reviewer etrnl-dx-reviewer etrnl-executor etrnl-investigator etrnl-quality-reviewer etrnl-scout etrnl-spec-reviewer; do
  [[ -f "$CLAUDE_HOME/agents/$agent.md" ]] && ok "installed $agent" || not_ok "missing $agent"
done
[[ -x "$CLAUDE_HOME/scripts/execution-ledger.mjs" ]] && ok "installed execution ledger helper" || not_ok "missing execution ledger helper"
[[ -x "$CLAUDE_HOME/scripts/review-log.mjs" ]] && ok "installed review log helper" || not_ok "missing review log helper"
[[ -x "$CLAUDE_HOME/scripts/browser-qa-report.mjs" ]] && ok "installed browser QA helper" || not_ok "missing browser QA helper"
[[ -x "$CLAUDE_HOME/scripts/context-state.mjs" ]] && ok "installed context helper" || not_ok "missing context helper"
[[ -x "$CLAUDE_HOME/scripts/execution-wave-check.mjs" ]] && ok "installed wave helper" || not_ok "missing wave helper"
[[ -x "$CLAUDE_HOME/scripts/workflow-health.mjs" ]] && ok "installed workflow health helper" || not_ok "missing workflow health helper"

"$CLAUDE_HOME/scripts/rollback-local.sh" >/dev/null
for agent in etrnl-adversary etrnl-browser-qa etrnl-design-reviewer etrnl-dx-reviewer etrnl-executor etrnl-investigator etrnl-quality-reviewer etrnl-scout etrnl-spec-reviewer; do
  [[ ! -f "$CLAUDE_HOME/agents/$agent.md" ]] && ok "rollback removed $agent" || not_ok "rollback left $agent"
done

if (( FAIL > 0 )); then
  printf 'FAILED: %d failed, %d passed\n' "$FAIL" "$PASS" >&2
  exit 1
fi
printf 'PASSED: %d checks\n' "$PASS"

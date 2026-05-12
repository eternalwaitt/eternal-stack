#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
STATUS=0
# shellcheck source=scripts/lib/skill-lists.sh
source "$ROOT/scripts/lib/skill-lists.sh"

ok() { printf 'ok: %s\n' "$*"; }
fail() { printf 'fail: %s\n' "$*" >&2; STATUS=1; }

require_command() {
  local dep="$1"
  if command -v "$dep" >/dev/null 2>&1; then
    ok "$dep available"
  else
    fail "$dep missing"
  fi
}

optional_command() {
  local dep="$1"
  local present_msg="$2"
  local missing_msg="$3"
  if command -v "$dep" >/dev/null 2>&1; then
    ok "$present_msg"
  else
    ok "$missing_msg"
  fi
}

report_command() {
  local present_msg="$1"
  local failure_msg="$2"
  local output
  shift 2
  if output="$("$@" 2>&1)"; then
    ok "$present_msg"
  elif [[ -n "$output" ]]; then
    fail "$failure_msg: $output"
  else
    fail "$failure_msg"
  fi
}

read_skill_hint_fallback() {
  local hint_path="$1"
  local line in_array=0
  while IFS= read -r line; do
    if (( in_array == 0 )); then
      [[ "$line" =~ ^[[:space:]]*skills=\([[:space:]]*$ ]] || continue
      in_array=1
      continue
    fi
    [[ "$line" =~ ^[[:space:]]*\)[[:space:]]*$ ]] && break
    line="${line%%#*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" ]] && continue
    printf '%s\n' "$line"
  done < "$hint_path"
}

for dep in jq git node rg fd; do
  require_command "$dep"
done
optional_command sg "sg available" "sg unavailable; live hooks fail open"

if [[ -f "$ROOT/hooks/lib/skill-hints.sh" ]]; then
  hint_fallback_skills=()
  while IFS= read -r fallback_skill; do
    hint_fallback_skills+=("$fallback_skill")
  done < <(read_skill_hint_fallback "$ROOT/hooks/lib/skill-hints.sh")
  hint_mismatch=0
  hint_mismatch_detail=""
  if (( ${#hint_fallback_skills[@]} != ${#OWNED_SKILLS[@]} )); then
    hint_mismatch=1
    hint_mismatch_detail="count expected=${#OWNED_SKILLS[@]} actual=${#hint_fallback_skills[@]}"
  else
    for i in "${!OWNED_SKILLS[@]}"; do
      if [[ "${OWNED_SKILLS[$i]}" != "${hint_fallback_skills[$i]}" ]]; then
        hint_mismatch=1
        hint_mismatch_detail="index=$i expected=${OWNED_SKILLS[$i]} actual=${hint_fallback_skills[$i]:-<missing>}"
        break
      fi
    done
  fi
  if (( hint_mismatch == 0 )); then
    ok "skill-hint fallback list synchronized with OWNED_SKILLS"
  else
    fail "hooks/lib/skill-hints.sh fallback list differs from scripts/lib/skill-lists.sh OWNED_SKILLS (${hint_mismatch_detail})"
  fi
else
  fail "hooks/lib/skill-hints.sh missing"
fi

if [[ -f "$ROOT/docs/research/parity-scorecard.schema.json" ]]; then
  ok "parity scorecard schema present (runtime coverage enforced via validateScorecard)"
else
  fail "docs/research/parity-scorecard.schema.json missing"
fi

hook_tests=()
if [[ -x "$ROOT/tests/test-hooks.sh" ]]; then
  hook_tests+=("$ROOT/tests/test-hooks.sh")
  [[ -x "$ROOT/tests/test-workflow-tools.sh" ]] && hook_tests+=("$ROOT/tests/test-workflow-tools.sh")
elif [[ -x "$ROOT/hooks/test-hooks.sh" ]]; then
  hook_tests+=("$ROOT/hooks/test-hooks.sh")
  [[ -x "$ROOT/hooks/test-workflow-tools.sh" ]] && hook_tests+=("$ROOT/hooks/test-workflow-tools.sh")
fi
if (( ${#hook_tests[@]} > 0 )); then
  for hook_test in "${hook_tests[@]}"; do
    report_command "$(basename "$hook_test") pass" "$(basename "$hook_test") fail" "$hook_test"
  done
else
  ok "hook tests skipped outside source checkout"
fi
if [[ -x "$ROOT/tests/test-install.sh" ]]; then
  report_command "install/rollback tests pass" "install/rollback tests fail" "$ROOT/tests/test-install.sh"
else
  ok "install/rollback tests skipped outside source checkout"
fi

if [[ -f "$ROOT/scripts/merge-settings.mjs" ]]; then
  report_command "merge-settings syntax valid" "merge-settings syntax invalid" node --check "$ROOT/scripts/merge-settings.mjs"
else
  # Installed doctors run after settings were already merged; source checkouts must still keep merge-settings.mjs.
  ok "merge-settings check skipped outside source checkout"
fi
if [[ -f "$ROOT/scripts/code-health-inventory.mjs" ]]; then
  report_command "code-health inventory syntax valid" "code-health inventory syntax invalid" node --check "$ROOT/scripts/code-health-inventory.mjs"
  report_command "code-health inventory runs" "code-health inventory failed" node "$ROOT/scripts/code-health-inventory.mjs" --json --quiet
else
  fail "code-health inventory script missing"
fi
if [[ -f "$ROOT/scripts/plan-readiness-check.mjs" ]]; then
  report_command "plan readiness syntax valid" "plan readiness syntax invalid" node --check "$ROOT/scripts/plan-readiness-check.mjs"
else
  fail "plan readiness script missing"
fi
for script in agent-task-packet-check guard-override-token replay-hook-fixtures execution-ledger execution-wave-check review-log project-buglog browser-qa-report context-state workflow-health prompt-budget-check skill-contract-check skill-behavior-smoke changelog-release-check port-guard research-competitor-intel; do
  if [[ -f "$ROOT/scripts/$script.mjs" ]]; then
    report_command "$script syntax valid" "$script syntax invalid" node --check "$ROOT/scripts/$script.mjs"
  else
    fail "$script script missing"
  fi
done
for hook_file in "${CRITICAL_HOOKS[@]}"; do
  if [[ -f "$ROOT/hooks/$hook_file" ]]; then
    ok "critical hook present: $hook_file"
  else
    fail "critical hook missing: $hook_file"
  fi
done
for script_file in "${CRITICAL_SCRIPTS[@]}"; do
  if [[ -f "$ROOT/scripts/$script_file" ]]; then
    ok "critical script present: $script_file"
  else
    fail "critical script missing: $script_file"
  fi
done
if [[ -f "$ROOT/scripts/lib/research-intel-core.mjs" ]]; then
  report_command "research intel core syntax valid" "research intel core syntax invalid" node --check "$ROOT/scripts/lib/research-intel-core.mjs"
else
  fail "research intel core script missing"
fi
if [[ -f "$ROOT/scripts/prompt-budget-check.mjs" ]]; then
  report_command "repo-owned prompt budget check clean" "repo-owned prompt budget check failed" node "$ROOT/scripts/prompt-budget-check.mjs" "$ROOT" --owned-only
fi
if [[ -f "$ROOT/scripts/skill-contract-check.mjs" ]]; then
  report_command "etrnl skill contracts clean" "etrnl skill contract check failed" node "$ROOT/scripts/skill-contract-check.mjs" --root "$ROOT"
fi
if [[ -f "$ROOT/scripts/skill-behavior-smoke.mjs" ]]; then
  report_command "etrnl skill behavior smoke clean" "etrnl skill behavior smoke failed" node "$ROOT/scripts/skill-behavior-smoke.mjs" --root "$ROOT"
fi
research_inputs_ok=1
if [[ ! -f "$ROOT/scripts/research-competitor-intel.mjs" ]]; then
  fail "research-competitor-intel script missing"
  research_inputs_ok=0
fi
if [[ ! -f "$ROOT/docs/research/top10-lock.json" ]]; then
  fail "docs/research/top10-lock.json missing"
  research_inputs_ok=0
fi
if [[ ! -f "$ROOT/docs/research/capability-evidence.json" ]]; then
  fail "docs/research/capability-evidence.json missing"
  research_inputs_ok=0
fi
if [[ ! -f "$ROOT/docs/research/parity-scorecard.json" ]]; then
  fail "docs/research/parity-scorecard.json missing"
  research_inputs_ok=0
fi
if (( research_inputs_ok == 1 )); then
  report_command "research manifest contract valid" "research manifest contract failed" node "$ROOT/scripts/research-competitor-intel.mjs" validate-manifest --manifest "$ROOT/docs/research/top10-lock.json"
  report_command "research evidence contract valid" "research evidence contract failed" node "$ROOT/scripts/research-competitor-intel.mjs" validate-evidence --evidence "$ROOT/docs/research/capability-evidence.json"
  report_command "research scorecard contract valid" "research scorecard contract failed" node "$ROOT/scripts/research-competitor-intel.mjs" validate-scorecard --scorecard "$ROOT/docs/research/parity-scorecard.json" --skills-file "$ROOT/scripts/lib/skill-lists.sh" --evidence "$ROOT/docs/research/capability-evidence.json"
fi
if [[ -d "$ROOT/hooks/fixtures/events/replay" ]]; then
  report_command "replay fixtures clean" "replay fixtures failed" node "$ROOT/scripts/replay-hook-fixtures.mjs"
else
  fail "replay fixture directory missing"
fi

if [[ -f "$ROOT/templates/settings.json" && -f "$ROOT/templates/settings.strict.json" ]]; then
  report_command "settings templates valid" "settings template invalid" jq empty "$ROOT/templates/settings.json" "$ROOT/templates/settings.strict.json"
  if jq -e '.hooks.PreToolUse and .hooks.PostToolUse and .hooks.PostToolUseFailure and .hooks.Stop and .hooks.SubagentStop and .hooks.PreCompact and .hooks.PostCompact' "$ROOT/templates/settings.strict.json" >/dev/null; then
    ok "strict template registers blocker hooks"
  else
    fail "strict template missing blocker hooks"
  fi
elif [[ -f "$ROOT/settings.json" ]]; then
  report_command "installed settings valid" "installed settings invalid" jq empty "$ROOT/settings.json"
else
  ok "settings template check skipped outside source checkout"
fi

if [[ -d "$ROOT/skills" && -f "$ROOT/docs/skills.md" ]]; then
  skill_check_failed=0
  for skill_dir in "${OWNED_SKILLS[@]}"; do
    skill_file="$ROOT/skills/$skill_dir/SKILL.md"
    if [[ ! -f "$skill_file" ]]; then
      fail "owned skill missing: $skill_dir"
      skill_check_failed=1
      continue
    fi
    skill_name=""
    if command -v yq >/dev/null 2>&1; then
      skill_name="$(yq -r '.name // ""' "$skill_file" 2>/dev/null || true)"
    fi
    if [[ -z "$skill_name" ]]; then
      # Fallback for systems without yq: use rg and trim common YAML quotes.
      name_line="$(rg -m 1 '^name:' "$skill_file" || true)"
      skill_name="$(printf '%s' "${name_line#name:}" | xargs)"
      first_char="${skill_name:0:1}"
      last_char="${skill_name: -1}"
      if [[ ${#skill_name} -ge 2 && "$first_char" == "$last_char" && ( "$first_char" == '"' || "$first_char" == "'" ) ]]; then
        skill_name="${skill_name:1:${#skill_name}-2}"
      fi
    fi
    skill_name="$(printf '%s' "$skill_name" | xargs)"
    if [[ "$skill_name" != "$skill_dir" ]]; then
      fail "skill name mismatch in $skill_file: $skill_name"
      skill_check_failed=1
    elif ! rg -F "/$skill_dir" "$ROOT/docs/skills.md" >/dev/null; then
      fail "docs/skills.md missing /$skill_dir"
      skill_check_failed=1
    fi
  done
  for skill_dir in "${LEGACY_SKILLS[@]}"; do
    if [[ -d "$ROOT/skills/$skill_dir" ]]; then
      fail "legacy repo-owned skill still installed: $skill_dir"
      skill_check_failed=1
    fi
  done
  if [[ "$skill_check_failed" == "0" ]]; then
    ok "etrnl skill namespace documented"
  fi
else
  fail "skills directory or docs/skills.md missing"
fi

if [[ -d "$ROOT/agents" ]]; then
  agent_check_failed=0
  for agent in "${OWNED_AGENTS[@]}"; do
    agent_file="$ROOT/agents/$agent.md"
    if [[ ! -f "$agent_file" ]]; then
      fail "owned agent missing: $agent"
      agent_check_failed=1
    elif ! rg -F "name: $agent" "$agent_file" >/dev/null; then
      fail "agent name mismatch in $agent_file"
      agent_check_failed=1
    elif ! rg -F "$agent" "$ROOT/docs/skills.md" >/dev/null; then
      fail "docs/skills.md missing agent $agent"
      agent_check_failed=1
    fi
  done
  if [[ "$agent_check_failed" == "0" ]]; then
    ok "etrnl agents installed and documented"
  fi
else
  fail "agents directory missing"
fi

runs_dir="${CLAUDE_CONTROL_PLANE_RUNS_DIR:-${CLAUDE_HOME:-$HOME/.claude}/control-plane/runs}"
artifact_dir="${CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR:-${CLAUDE_HOME:-$HOME/.claude}/control-plane/artifacts}"
if [[ -d "$runs_dir" ]]; then
  ok "workflow ledger directory present"
else
  ok "workflow ledger directory not created yet"
fi
if [[ -d "$artifact_dir" ]]; then
  ok "workflow artifact directory present"
else
  ok "workflow artifact directory not created yet"
fi
if [[ -f "$ROOT/scripts/workflow-health.mjs" ]]; then
  if workflow_health="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$runs_dir" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$artifact_dir" node "$ROOT/scripts/workflow-health.mjs" 2>&1)"; then
    ok "workflow health summary available"
    while IFS= read -r line; do
      [[ -n "$line" ]] && ok "workflow health: $line"
    done <<<"$workflow_health"
  else
    fail "workflow health summary failed: $workflow_health"
  fi
fi
optional_command codex "optional Codex escalation available" "optional Codex escalation not installed"
optional_command gemini "optional Gemini escalation available" "optional Gemini escalation not installed"
optional_command playwright-cli "optional browser QA tool available" "optional browser QA tool not installed"
if [[ -x "$HOME/.claude/skills/gstack/bin/design" || -x "$HOME/.agents/skills/gstack/bin/design" || -x "$HOME/.gstack/repos/gstack/bin/design" ]]; then
  ok "optional design/mock tool available"
else
  ok "optional design/mock tool not installed"
fi

if [[ -d "$ROOT/rules/etrnl" ]]; then
  for rule in workflow quality tools safety identity domains; do
    if [[ -f "$ROOT/rules/etrnl/$rule.md" ]]; then
      ok "rule present: $rule"
    else
      fail "rule missing: $rule"
    fi
  done
else
  fail "rules/etrnl missing"
fi

if [[ -f "$ROOT/docs/health-stack.md" ]]; then
  ok "health stack documented"
else
  fail "docs/health-stack.md missing"
fi

if [[ -f "$ROOT/AGENTS.md" || -f "$ROOT/templates/AGENTS.md" || -f "$ROOT/docs/templates/AGENTS.md" ]]; then
  ok "AGENTS baseline present"
else
  fail "AGENTS baseline missing"
fi
if [[ -f "$ROOT/CLAUDE.md" || -f "$ROOT/templates/CLAUDE.md" || -f "$ROOT/docs/templates/CLAUDE.md" ]]; then
  ok "Claude wrapper present"
else
  fail "Claude wrapper missing"
fi
if [[ -x "$ROOT/scripts/rollback-local.sh" ]]; then
  ok "rollback script present"
else
  fail "rollback script missing"
fi

companion_hits=0
default_companion_skill_paths=(
  "$HOME/.claude/skills/eternal-best-practices"
  "$HOME/.agents/skills/eternal-best-practices"
  "$HOME/.agents/skills/code-simplifier"
  "$HOME/.agents/skills/universal/finding-duplicate-functions"
  "$HOME/.codex/skills/brooks-audit"
)
if [[ -n "${COMPANION_SKILL_PATHS:-}" ]]; then
  IFS=':' read -r -a companion_skill_paths <<<"$COMPANION_SKILL_PATHS"
else
  companion_skill_paths=("${default_companion_skill_paths[@]}")
fi
for skill_dir in "${companion_skill_paths[@]}"; do
  [[ -z "$skill_dir" ]] && continue
  [[ -d "$skill_dir" ]] && companion_hits=$((companion_hits + 1))
done
if (( companion_hits > 0 )); then
  ok "companion skills detected: $companion_hits"
else
  ok "companion skills not detected; routing will require manual fallback"
fi

if [[ -f "$ROOT/scripts/changelog-release-check.mjs" && -f "$ROOT/CHANGELOG.md" ]]; then
  if changelog_out="$(node "$ROOT/scripts/changelog-release-check.mjs" 2>&1)"; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && ok "changelog: $line"
    done <<<"$changelog_out"
  else
    while IFS= read -r line; do
      [[ -n "$line" ]] && fail "changelog: $line"
    done <<<"$changelog_out"
  fi
else
  ok "changelog release check skipped outside source checkout"
fi

if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 && [[ -f "$ROOT/CHANGELOG.md" ]]; then
  if rg -n --glob '!.git/**' --glob '!node_modules/**' --glob '!vendor/**' 'sk_live_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|xoxb-[0-9A-Za-z-]{20,}|npm_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}' "$ROOT" >/dev/null 2>&1; then
    fail "private credential pattern found in repo"
  else
    ok "credential pattern scan clean"
  fi
else
  ok "credential scan skipped outside source checkout"
fi

exit "$STATUS"

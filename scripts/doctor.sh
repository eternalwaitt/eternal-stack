#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
STATUS=0
source "$ROOT/scripts/lib/skill-lists.sh"

ok() { printf 'ok: %s\n' "$*"; }
fail() { printf 'fail: %s\n' "$*" >&2; STATUS=1; }

for dep in jq git node rg fd; do
  command -v "$dep" >/dev/null 2>&1 && ok "$dep available" || fail "$dep missing"
done
command -v sg >/dev/null 2>&1 && ok "sg available" || ok "sg unavailable; live hooks fail open"

hook_test=""
if [[ -x "$ROOT/tests/test-hooks.sh" ]]; then
  hook_test="$ROOT/tests/test-hooks.sh"
elif [[ -x "$ROOT/hooks/test-hooks.sh" ]]; then
  hook_test="$ROOT/hooks/test-hooks.sh"
fi
if [[ -n "$hook_test" ]]; then
  "$hook_test" >/dev/null && ok "hook tests pass" || fail "hook tests fail"
else
  ok "hook tests skipped outside source checkout"
fi
if [[ -x "$ROOT/tests/test-install.sh" ]]; then
  "$ROOT/tests/test-install.sh" >/dev/null && ok "install/rollback tests pass" || fail "install/rollback tests fail"
else
  ok "install/rollback tests skipped outside source checkout"
fi

if [[ -f "$ROOT/scripts/merge-settings.mjs" ]]; then
  node --check "$ROOT/scripts/merge-settings.mjs" >/dev/null && ok "merge-settings syntax valid" || fail "merge-settings syntax invalid"
else
  # Installed doctors run after settings were already merged; source checkouts must still keep merge-settings.mjs.
  ok "merge-settings check skipped outside source checkout"
fi
if [[ -f "$ROOT/scripts/code-health-inventory.mjs" ]]; then
  node --check "$ROOT/scripts/code-health-inventory.mjs" >/dev/null && ok "code-health inventory syntax valid" || fail "code-health inventory syntax invalid"
  node "$ROOT/scripts/code-health-inventory.mjs" --json >/dev/null && ok "code-health inventory runs" || fail "code-health inventory failed"
else
  fail "code-health inventory script missing"
fi
if [[ -f "$ROOT/scripts/plan-readiness-check.mjs" ]]; then
  node --check "$ROOT/scripts/plan-readiness-check.mjs" >/dev/null && ok "plan readiness syntax valid" || fail "plan readiness syntax invalid"
else
  fail "plan readiness script missing"
fi
for script in agent-task-packet-check execution-ledger execution-wave-check review-log browser-qa-report context-state workflow-health prompt-budget-check; do
  if [[ -f "$ROOT/scripts/$script.mjs" ]]; then
    node --check "$ROOT/scripts/$script.mjs" >/dev/null && ok "$script syntax valid" || fail "$script syntax invalid"
  else
    fail "$script script missing"
  fi
done
if [[ -f "$ROOT/scripts/prompt-budget-check.mjs" ]]; then
  node "$ROOT/scripts/prompt-budget-check.mjs" "$ROOT" --owned-only >/dev/null && ok "repo-owned prompt budget check clean" || fail "repo-owned prompt budget check failed"
fi

if [[ -f "$ROOT/templates/settings.json" && -f "$ROOT/templates/settings.strict.json" ]]; then
  jq empty "$ROOT/templates/settings.json" "$ROOT/templates/settings.strict.json" >/dev/null && ok "settings templates valid" || fail "settings template invalid"
  if jq -e '.hooks.PreToolUse and .hooks.PostToolUse and .hooks.PostToolUseFailure and .hooks.Stop and .hooks.SubagentStop and .hooks.PreCompact and .hooks.PostCompact' "$ROOT/templates/settings.strict.json" >/dev/null; then
    ok "strict template registers blocker hooks"
  else
    fail "strict template missing blocker hooks"
  fi
elif [[ -f "$ROOT/settings.json" ]]; then
  jq empty "$ROOT/settings.json" >/dev/null && ok "installed settings valid" || fail "installed settings invalid"
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
command -v codex >/dev/null 2>&1 && ok "optional Codex escalation available" || ok "optional Codex escalation not installed"
command -v gemini >/dev/null 2>&1 && ok "optional Gemini escalation available" || ok "optional Gemini escalation not installed"
command -v playwright-cli >/dev/null 2>&1 && ok "optional browser QA tool available" || ok "optional browser QA tool not installed"
if [[ -x "$HOME/.claude/skills/gstack/bin/design" || -x "$HOME/.agents/skills/gstack/bin/design" || -x "$HOME/.gstack/repos/gstack/bin/design" ]]; then
  ok "optional design/mock tool available"
else
  ok "optional design/mock tool not installed"
fi

if [[ -d "$ROOT/rules/etrnl" ]]; then
  for rule in workflow quality tools safety identity domains; do
    [[ -f "$ROOT/rules/etrnl/$rule.md" ]] && ok "rule present: $rule" || fail "rule missing: $rule"
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

if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  latest_tag=""
  while IFS= read -r tag; do
    latest_tag="$tag"
    break
  done < <(git -C "$ROOT" tag --list 'v[0-9]*' --sort=-v:refname)
  if [[ -z "$latest_tag" ]]; then
    ok "no release tags found"
  elif rg -F "## $latest_tag" "$ROOT/CHANGELOG.md" >/dev/null; then
    ok "changelog includes latest tag $latest_tag"
  else
    fail "CHANGELOG.md missing latest tag $latest_tag"
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

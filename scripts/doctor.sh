#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
STATUS=0
DOCTOR_JOBS="${DOCTOR_JOBS:-4}"
DOCTOR_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --jobs)
      if [[ $# -lt 2 ]]; then
        printf 'doctor: --jobs requires a value\n' >&2
        exit 2
      fi
      DOCTOR_JOBS="$2"
      shift 2
      ;;
    --jobs=*)
      DOCTOR_JOBS="${1#*=}"
      shift
      ;;
    *)
      DOCTOR_ARGS+=("$1")
      shift
      ;;
  esac
done
if [[ ! "$DOCTOR_JOBS" =~ ^[0-9]+$ ]] || (( DOCTOR_JOBS < 1 )); then
  DOCTOR_JOBS=4
fi
if (( ${#DOCTOR_ARGS[@]} > 0 )); then
  set -- "${DOCTOR_ARGS[@]}"
else
  set --
fi
DOCTOR_RESULT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/etrnl-doctor-results.XXXXXX")"
DOCTOR_ASYNC_PIDS=()
DOCTOR_HEAVY_PIDS=()
DOCTOR_BATCH_ORDER=()
DOCTOR_HEAVY_ORDER=()
DOCTOR_HEAVY_STARTED=0
# shellcheck source=scripts/lib/skill-lists.sh
source "$ROOT/scripts/lib/skill-lists.sh"

doctor_cleanup() {
  rm -rf -- "$DOCTOR_RESULT_DIR"
}
trap doctor_cleanup EXIT

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
  local output_file
  shift 2
  output_file="$(mktemp "${TMPDIR:-/tmp}/etrnl-doctor.XXXXXX")"
  if "$@" >"$output_file" 2>&1; then
    ok "$present_msg"
  elif [[ -s "$output_file" ]]; then
    fail "$failure_msg: $(tail -n 40 "$output_file")"
  else
    fail "$failure_msg"
  fi
  rm -f "$output_file"
}

queue_async_command() {
  local slot="$1"
  local present_msg="$2"
  local failure_msg="$3"
  shift 3
  DOCTOR_BATCH_ORDER+=("$slot")
  (
    local output_file
    output_file="$(mktemp "${TMPDIR:-/tmp}/etrnl-doctor.XXXXXX")"
    if "$@" >"$output_file" 2>&1; then
      printf 'ok\t%s\n' "$present_msg" >"$DOCTOR_RESULT_DIR/${slot}.result"
    elif [[ -s "$output_file" ]]; then
      printf 'fail\t%s: %s\n' "$failure_msg" "$(tail -n 40 "$output_file")" >"$DOCTOR_RESULT_DIR/${slot}.result"
    else
      printf 'fail\t%s\n' "$failure_msg" >"$DOCTOR_RESULT_DIR/${slot}.result"
    fi
    rm -f "$output_file"
  ) &
  DOCTOR_ASYNC_PIDS+=("$!")
}

doctor_write_async_result() {
  local slot="$1"
  local present_msg="$2"
  local failure_msg="$3"
  local output_file="$4"
  local exit_code="$5"
  if (( exit_code == 0 )); then
    printf 'ok\t%s\n' "$present_msg" >"$DOCTOR_RESULT_DIR/${slot}.result"
  elif [[ -s "$output_file" ]]; then
    printf 'fail\t%s: %s\n' "$failure_msg" "$(tail -n 40 "$output_file")" >"$DOCTOR_RESULT_DIR/${slot}.result"
  else
    printf 'fail\t%s\n' "$failure_msg" >"$DOCTOR_RESULT_DIR/${slot}.result"
  fi
}

queue_heavy_async_command() {
  local slot="$1"
  local present_msg="$2"
  local failure_msg="$3"
  shift 3
  DOCTOR_HEAVY_ORDER+=("$slot")
  (
    local output_file exit_code
    output_file="$(mktemp "${TMPDIR:-/tmp}/etrnl-doctor.XXXXXX")"
    if "$@" >"$output_file" 2>&1; then
      exit_code=0
    else
      exit_code=$?
    fi
    doctor_write_async_result "$slot" "$present_msg" "$failure_msg" "$output_file" "$exit_code"
    rm -f "$output_file"
  ) &
  DOCTOR_HEAVY_PIDS+=("$!")
}

doctor_active_job_count() {
  echo $(( ${#DOCTOR_ASYNC_PIDS[@]} + ${#DOCTOR_HEAVY_PIDS[@]} ))
}

doctor_reap_async_pids() {
  local -a still_running=()
  local pid
  if (( ${#DOCTOR_ASYNC_PIDS[@]} > 0 )); then
    for pid in "${DOCTOR_ASYNC_PIDS[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        still_running+=("$pid")
      else
        wait "$pid" || true
      fi
    done
  fi
  if (( ${#still_running[@]} > 0 )); then
    DOCTOR_ASYNC_PIDS=("${still_running[@]}")
  else
    DOCTOR_ASYNC_PIDS=()
  fi
}

doctor_reap_heavy_pids() {
  local -a still_running=()
  local pid
  if (( ${#DOCTOR_HEAVY_PIDS[@]} > 0 )); then
    for pid in "${DOCTOR_HEAVY_PIDS[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        still_running+=("$pid")
      else
        wait "$pid" || true
      fi
    done
  fi
  if (( ${#still_running[@]} > 0 )); then
    DOCTOR_HEAVY_PIDS=("${still_running[@]}")
  else
    DOCTOR_HEAVY_PIDS=()
  fi
}

wait_for_doctor_job_slot() {
  local max_jobs="$1"
  until (( $(doctor_active_job_count) < max_jobs )); do
    doctor_reap_async_pids
    doctor_reap_heavy_pids
    sleep 0.05
  done
}

flush_async_batch() {
  local pid slot status msg
  if (( ${#DOCTOR_ASYNC_PIDS[@]} > 0 )); then
    for pid in "${DOCTOR_ASYNC_PIDS[@]}"; do
      wait "$pid" || true
    done
  fi
  DOCTOR_ASYNC_PIDS=()
  if (( ${#DOCTOR_BATCH_ORDER[@]} > 0 )); then
    for slot in "${DOCTOR_BATCH_ORDER[@]}"; do
      if [[ ! -f "$DOCTOR_RESULT_DIR/${slot}.result" ]]; then
        fail "doctor async result missing for $slot"
        continue
      fi
      IFS=$'\t' read -r status msg <"$DOCTOR_RESULT_DIR/${slot}.result" || true
      if [[ "$status" == "ok" ]]; then
        ok "$msg"
      else
        fail "$msg"
      fi
      rm -f "$DOCTOR_RESULT_DIR/${slot}.result"
    done
  fi
  DOCTOR_BATCH_ORDER=()
}

start_heavy_async_checks() {
  local hook_test
  (( DOCTOR_HEAVY_STARTED )) && return 0
  DOCTOR_HEAVY_STARTED=1
  if (( ${#hook_tests[@]} > 0 )); then
    for hook_test in "${hook_tests[@]}"; do
      wait_for_doctor_job_slot "$DOCTOR_JOBS"
      queue_heavy_async_command "heavy-$(basename "$hook_test")" "$(basename "$hook_test") pass" "$(basename "$hook_test") fail" "$hook_test"
    done
  fi
  if [[ -x "$ROOT/tests/test-install.sh" ]]; then
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_heavy_async_command "heavy-test-install" "install/rollback tests pass" "install/rollback tests fail" "$ROOT/tests/test-install.sh"
  fi
  if [[ -x "$ROOT/tests/test-read-stdin.sh" ]]; then
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_heavy_async_command "heavy-read-stdin" "read-stdin tests pass" "read-stdin tests fail" "$ROOT/tests/test-read-stdin.sh"
  fi
  if [[ -d "$ROOT/hooks/fixtures/events/replay" ]]; then
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_heavy_async_command "heavy-replay-fixtures" "replay fixtures clean" "replay fixtures failed" node "$ROOT/scripts/replay-hook-fixtures.mjs"
  fi
}

flush_heavy_async_checks() {
  local pid slot status msg
  (( DOCTOR_HEAVY_STARTED )) || return 0
  if (( ${#DOCTOR_HEAVY_PIDS[@]} > 0 )); then
    for pid in "${DOCTOR_HEAVY_PIDS[@]}"; do
      wait "$pid" || true
    done
  fi
  DOCTOR_HEAVY_PIDS=()
  if (( ${#DOCTOR_HEAVY_ORDER[@]} > 0 )); then
    for slot in "${DOCTOR_HEAVY_ORDER[@]}"; do
      if [[ ! -f "$DOCTOR_RESULT_DIR/${slot}.result" ]]; then
        fail "doctor async result missing for $slot"
        continue
      fi
      IFS=$'\t' read -r status msg <"$DOCTOR_RESULT_DIR/${slot}.result" || true
      if [[ "$status" == "ok" ]]; then
        ok "$msg"
      else
        fail "$msg"
      fi
      rm -f "$DOCTOR_RESULT_DIR/${slot}.result"
    done
  fi
  DOCTOR_HEAVY_ORDER=()
}

run_parallel_syntax_checks() {
  local script slot=0 id
  local -a syntax_scripts=(
    agent-task-packet-check guard-override-token replay-hook-fixtures execution-ledger etrnl-state
    execute-evidence-check execution-wave-check tool-effectiveness tool-stack-check stack-profile-check
    code-health-ledger-check documentation-comment-health documentation-health-ledger-check review-log
    project-buglog browser-qa-report context-state live-hook-noise-report session-audit workflow-health
    prompt-budget-check skill-contract-check skill-behavior-smoke skill-update-prompt disk-cleanup-manifest
    performance-baseline pr-preflight changelog-release-check port-guard update-check research-competitor-intel
    settings-audit
  )
  for script in "${syntax_scripts[@]}"; do
    if [[ -f "$ROOT/scripts/$script.mjs" ]]; then
      slot=$((slot + 1))
      id="$(printf 'syntax-%03d-%s' "$slot" "$script")"
      wait_for_doctor_job_slot "$DOCTOR_JOBS"
      queue_async_command "$id" "$script syntax valid" "$script syntax invalid" node --check "$ROOT/scripts/$script.mjs"
    else
      fail "$script script missing"
    fi
  done
  flush_async_batch
}

line_count_file() {
  local file="$1"
  local count=0 line
  while IFS= read -r line || [[ -n "$line" ]]; do
    ((count += 1))
  done <"$file"
  printf '%s\n' "$count"
}

file_has_exact_line() {
  local file="$1"
  local expected="$2"
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" == "$expected" ]] && return 0
  done <"$file"
  return 1
}

check_startup_file_budget() {
  local file="$1"
  local label="$2"
  local count
  count="$(line_count_file "$file")"
  if (( count <= 200 )); then
    ok "$label concise ($count lines)"
  else
    fail "$label too large ($count lines; target <= 200)"
  fi
}

for dep in jq git node rg fd; do
  require_command "$dep"
done
if [[ -f "$ROOT/scripts/bootstrap-tools.sh" ]]; then
  report_command "bootstrap-tools syntax valid" "bootstrap-tools syntax invalid" bash -n "$ROOT/scripts/bootstrap-tools.sh"
else
  fail "bootstrap-tools script missing"
fi
optional_command sg "sg available" "sg unavailable; live hooks fail open"

if [[ -f "$ROOT/hooks/lib/skill-hints.sh" ]]; then
  if rg -q 'skill-lists\.sh' "$ROOT/hooks/lib/skill-hints.sh" \
    && rg -q 'OWNED_SKILLS' "$ROOT/hooks/lib/skill-hints.sh"; then
    ok "skill-hints derive from OWNED_SKILLS via skill-lists.sh"
  else
    fail "hooks/lib/skill-hints.sh must source skill-lists.sh and use OWNED_SKILLS"
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
  :
else
  ok "hook tests skipped outside source checkout"
fi
if [[ -x "$ROOT/tests/test-install.sh" ]]; then
  :
else
  ok "install/rollback tests skipped outside source checkout"
fi
start_heavy_async_checks

if [[ -f "$ROOT/scripts/merge-settings.mjs" ]]; then
  report_command "merge-settings syntax valid" "merge-settings syntax invalid" node --check "$ROOT/scripts/merge-settings.mjs"
else
  # Installed doctors run after settings were already merged; source checkouts must still keep merge-settings.mjs.
  ok "merge-settings check skipped outside source checkout"
fi
if [[ -f "$ROOT/scripts/settings-audit.mjs" ]]; then
  report_command "settings-audit syntax valid" "settings-audit syntax invalid" node --check "$ROOT/scripts/settings-audit.mjs"
else
  fail "settings-audit script missing"
fi
if [[ -f "$ROOT/scripts/code-health-inventory.mjs" ]]; then
  report_command "code-health inventory syntax valid" "code-health inventory syntax invalid" node --check "$ROOT/scripts/code-health-inventory.mjs"
  # Installed doctor runs outside the source checkout; inventory requires git context.
  if git -C "$ROOT" rev-parse --show-toplevel >/dev/null 2>&1; then
    report_command "code-health inventory runs" "code-health inventory failed" node "$ROOT/scripts/code-health-inventory.mjs" --json --quiet
  else
    ok "code-health inventory run skipped outside source checkout"
  fi
else
  fail "code-health inventory script missing"
fi
if [[ -f "$ROOT/scripts/plan-readiness-check.mjs" ]]; then
  report_command "plan readiness syntax valid" "plan readiness syntax invalid" node --check "$ROOT/scripts/plan-readiness-check.mjs"
else
  fail "plan readiness script missing"
fi
if [[ -f "$ROOT/scripts/deep-stack-check.mjs" ]]; then
  report_command "deep-stack check syntax valid" "deep-stack check syntax invalid" node --check "$ROOT/scripts/deep-stack-check.mjs"
else
  fail "deep-stack check script missing"
fi
if [[ -f "$ROOT/scripts/codex-rtk-pre-tool-use.sh" ]]; then
  report_command "codex RTK hook syntax valid" "codex RTK hook syntax invalid" bash -n "$ROOT/scripts/codex-rtk-pre-tool-use.sh"
else
  fail "codex RTK hook script missing"
fi
run_parallel_syntax_checks
if [[ -f "$ROOT/scripts/lib/read-stdin.mjs" ]]; then
  report_command "read-stdin helper syntax valid" "read-stdin helper syntax invalid" node --check "$ROOT/scripts/lib/read-stdin.mjs"
else
  fail "read-stdin helper missing"
fi
if [[ -d "$ROOT/tests/fixtures/tool-effectiveness" ]]; then
  report_command "tool-effectiveness fixtures valid" "tool-effectiveness fixtures invalid" node "$ROOT/scripts/tool-effectiveness.mjs" validate-fixtures --fixtures "$ROOT/tests/fixtures/tool-effectiveness"
  report_command "tool-effectiveness fixture summary runs" "tool-effectiveness fixture summary failed" node "$ROOT/scripts/tool-effectiveness.mjs" summarize --fixtures "$ROOT/tests/fixtures/tool-effectiveness" --json
fi
if [[ -d "$ROOT/tests/fixtures/etrnl-state" ]]; then
  report_command "etrnl-state fixtures valid" "etrnl-state fixtures invalid" node "$ROOT/scripts/etrnl-state.mjs" validate --fixtures "$ROOT/tests/fixtures/etrnl-state"
  report_command "etrnl-state compact doctor runs" "etrnl-state compact doctor failed" node "$ROOT/scripts/etrnl-state.mjs" doctor --compact --explain
fi
if [[ -f "$ROOT/templates/stack-profile.core.json" && -f "$ROOT/templates/stack-profile.full.json" ]]; then
  report_command "core stack profile valid" "core stack profile invalid" node "$ROOT/scripts/stack-profile-check.mjs" "$ROOT/templates/stack-profile.core.json"
  report_command "full stack profile valid" "full stack profile invalid" node "$ROOT/scripts/stack-profile-check.mjs" "$ROOT/templates/stack-profile.full.json"
fi
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
report_command "etrnl skill contracts clean" "etrnl skill contract check failed" node "$ROOT/scripts/skill-contract-check.mjs" --root "$ROOT"
report_command "etrnl skill behavior smoke clean" "etrnl skill behavior smoke failed" node "$ROOT/scripts/skill-behavior-smoke.mjs" --root "$ROOT"
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
if [[ ! -d "$ROOT/hooks/fixtures/events/replay" ]]; then
  fail "replay fixture directory missing"
fi

if [[ -f "$ROOT/templates/settings.json" && -f "$ROOT/templates/settings.strict.json" ]]; then
  report_command "settings templates valid" "settings template invalid" jq empty "$ROOT/templates/settings.json" "$ROOT/templates/settings.strict.json" "$ROOT/templates/settings.local.example.json"
  if [[ -f "$ROOT/templates/hindsight/claude-code.local-daemon.json" && -f "$ROOT/templates/hindsight/claude-code.external.example.json" ]]; then
    report_command "hindsight config templates valid" "hindsight config template invalid" jq empty "$ROOT/templates/hindsight/claude-code.local-daemon.json" "$ROOT/templates/hindsight/claude-code.external.example.json"
  fi
  report_command "settings default audit clean" "settings default audit failed" node "$ROOT/scripts/settings-audit.mjs" "$ROOT/templates/settings.json" --strict-conflicts
  report_command "settings strict audit clean" "settings strict audit failed" node "$ROOT/scripts/settings-audit.mjs" "$ROOT/templates/settings.strict.json" --strict-conflicts
  if jq -e '.hooks.PreToolUse and .hooks.PostToolUse and .hooks.PostToolUseFailure and .hooks.Stop and .hooks.SubagentStop and .hooks.PreCompact and .hooks.PostCompact' "$ROOT/templates/settings.strict.json" >/dev/null; then
    ok "strict template registers blocker hooks"
  else
    fail "strict template missing blocker hooks"
  fi
elif [[ -f "$ROOT/settings.json" ]]; then
  report_command "installed settings valid" "installed settings invalid" jq empty "$ROOT/settings.json"
  report_command "installed settings audit clean" "installed settings audit failed" node "$ROOT/scripts/settings-audit.mjs" "$ROOT/settings.json" --strict-conflicts
else
  ok "settings template check skipped outside source checkout"
fi

stack_profile=""
if [[ -f "$ROOT/etrnl/install.json" ]]; then
  stack_profile="$(jq -r '.stackProfile // ""' "$ROOT/etrnl/install.json" 2>/dev/null || true)"
fi
  if [[ -x "$ROOT/scripts/canary-hindsight.sh" ]]; then
    report_command "hindsight canary syntax valid" "hindsight canary syntax invalid" bash -n "$ROOT/scripts/canary-hindsight.sh"
  if [[ "$stack_profile" == "full" || "${ETRNL_REQUIRE_HINDSIGHT:-0}" == "1" ]]; then
    report_command "hindsight canary green" "hindsight canary red" env HINDSIGHT_CANARY_REQUIRE_HEALTH=1 "$ROOT/scripts/canary-hindsight.sh" --json
  elif hindsight_posture="$("$ROOT/scripts/canary-hindsight.sh" --json 2>/dev/null)"; then
    if jq -e . >/dev/null 2>&1 <<<"$hindsight_posture"; then
      ok "hindsight posture green: $(jq -r '(.mode // "") + " " + (.health // "")' <<<"$hindsight_posture")"
    else
      ok "hindsight posture returned non-JSON output; optional for core/source profile"
    fi
  else
    ok "hindsight posture red but optional for core/source profile"
  fi
fi

if [[ -d "$ROOT/skills" && -f "$ROOT/docs/skills.md" ]]; then
  skill_check_failed=0
  installed_root=0
  if [[ -f "$ROOT/etrnl/install.json" ]]; then
    installed_root=1
  fi
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
    if [[ "$installed_root" == "1" && ! -f "$ROOT/commands/$skill_dir.md" ]]; then
      fail "installed slash command missing: $skill_dir"
      skill_check_failed=1
    fi
  done
  for skill_dir in "${REMOVED_SKILLS[@]}"; do
    if [[ -d "$ROOT/skills/$skill_dir" ]]; then
      fail "removed repo-owned skill still installed: $skill_dir"
      skill_check_failed=1
    fi
  done
  if [[ "$skill_check_failed" == "0" ]]; then
    ok "etrnl skill namespace documented"
  fi
else
  fail "skills directory or docs/skills.md missing"
fi

if [[ -d "$ROOT/commands" && -f "$ROOT/docs/skills.md" ]]; then
  command_check_failed=0
  for command_name in "${OWNED_COMMANDS[@]}"; do
    command_file="$ROOT/commands/$command_name.md"
    if [[ ! -f "$command_file" ]]; then
      fail "owned command missing: $command_name"
      command_check_failed=1
    elif ! rg -F "/$command_name" "$ROOT/docs/skills.md" >/dev/null; then
      fail "docs/skills.md missing /$command_name"
      command_check_failed=1
    fi
  done
  if [[ "$command_check_failed" == "0" ]]; then
    ok "custom commands installed and documented"
  fi
else
  fail "commands directory or docs/skills.md missing"
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

runs_dir="${ETRNL_RUNS_DIR:-${CLAUDE_HOME:-$HOME/.claude}/etrnl/runs}"
artifact_dir="${ETRNL_ARTIFACTS_DIR:-${CLAUDE_HOME:-$HOME/.claude}/etrnl/artifacts}"
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
  if workflow_health="$(ETRNL_RUNS_DIR="$runs_dir" ETRNL_ARTIFACTS_DIR="$artifact_dir" node "$ROOT/scripts/workflow-health.mjs" 2>&1)"; then
    ok "workflow health summary available"
    while IFS= read -r line; do
      [[ -n "$line" ]] && ok "workflow health: $line"
    done <<<"$workflow_health"
  else
    fail "workflow health summary failed: $workflow_health"
  fi
  workflow_doctor_args=(doctor --json)
  if [[ "${ETRNL_DOCTOR_STRICT_RUNTIME:-0}" == "1" ]]; then
    workflow_doctor_args+=(--strict)
  fi
  if workflow_doctor="$(ETRNL_RUNS_DIR="$runs_dir" ETRNL_ARTIFACTS_DIR="$artifact_dir" node "$ROOT/scripts/workflow-health.mjs" "${workflow_doctor_args[@]}" 2>&1)"; then
    ok "workflow runtime doctor available"
  else
    fail "workflow runtime doctor failed: $workflow_doctor"
  fi
  if jq -e . >/dev/null 2>&1 <<<"$workflow_doctor"; then
    runtime_findings_count="$(jq -r '.runtimeFindings | length' <<<"$workflow_doctor")"
    ok "workflow runtime findings=${runtime_findings_count}"
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
for startup_file in "$ROOT/AGENTS.md" "$ROOT/CLAUDE.md" "$ROOT/templates/AGENTS.md" "$ROOT/templates/CLAUDE.md" "$ROOT/docs/templates/AGENTS.md" "$ROOT/docs/templates/CLAUDE.md"; do
  [[ -f "$startup_file" ]] || continue
  check_startup_file_budget "$startup_file" "${startup_file#"$ROOT/"}"
done
for claude_file in "$ROOT/CLAUDE.md" "$ROOT/templates/CLAUDE.md" "$ROOT/docs/templates/CLAUDE.md"; do
  [[ -f "$claude_file" ]] || continue
  if file_has_exact_line "$claude_file" "@AGENTS.md"; then
    ok "${claude_file#"$ROOT/"} imports AGENTS.md"
  else
    fail "${claude_file#"$ROOT/"} should import AGENTS.md"
  fi
done
if [[ -x "$ROOT/scripts/rollback-local.sh" ]]; then
  ok "rollback script present"
else
  fail "rollback script missing"
fi
if [[ -x "$ROOT/scripts/update.sh" ]]; then
  ok "update script present"
else
  fail "update script missing"
fi
if [[ -f "$ROOT/etrnl/install.json" ]]; then
  report_command "installed update metadata valid" "installed update metadata invalid" jq empty "$ROOT/etrnl/install.json"
elif [[ -f "$ROOT/scripts/update-check.mjs" ]]; then
  report_command "source update fingerprint available" "source update fingerprint failed" node "$ROOT/scripts/update-check.mjs" --fingerprint-source "$ROOT"
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
  credential_scan_globs=(
    --glob '!.agents/**'
    --glob '!.audit/**'
    --glob '!.cache/**'
    --glob '!.claude/**'
    --glob '!.codex/**'
    --glob '!.cursor/**'
    --glob '!.git/**'
    --glob '!.idea/**'
    --glob '!.netlify/**'
    --glob '!.next/**'
    --glob '!.nuxt/**'
    --glob '!.output/**'
    --glob '!.parcel-cache/**'
    --glob '!.svelte-kit/**'
    --glob '!.turbo/**'
    --glob '!.vercel/**'
    --glob '!.vite/**'
    --glob '!.vitest/**'
    --glob '!.vscode/**'
    --glob '!.worktrees/**'
    --glob '!build/**'
    --glob '!cache/**'
    --glob '!coverage/**'
    --glob '!dbscans/**'
    --glob '!dist/**'
    --glob '!generated/**'
    --glob '!logs/**'
    --glob '!node_modules/**'
    --glob '!out/**'
    --glob '!storybook-static/**'
    --glob '!temp/**'
    --glob '!tmp/**'
    --glob '!tool-output/**'
    --glob '!vendor/**'
  )
  if rg -n "${credential_scan_globs[@]}" 'sk_live_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|xoxb-[0-9A-Za-z-]{20,}|npm_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}' "$ROOT" >/dev/null 2>&1; then
    fail "private credential pattern found in repo"
  else
    ok "credential pattern scan clean"
  fi
else
  ok "credential scan skipped outside source checkout"
fi

flush_heavy_async_checks

exit "$STATUS"

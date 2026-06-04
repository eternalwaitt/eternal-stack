#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=hooks/lib/json.sh
source "$SCRIPT_DIR/lib/json.sh"
# shellcheck source=hooks/lib/state.sh
source "$SCRIPT_DIR/lib/state.sh"
# shellcheck source=hooks/lib/code-patterns.sh
source "$SCRIPT_DIR/lib/code-patterns.sh"
# shellcheck source=hooks/lib/paths.sh
source "$SCRIPT_DIR/lib/paths.sh"

# Completion gate flow:
# [assistant done-claim]
#        |
#        v
# [evidence discipline] -> [ledger checks] -> [fresh verification checks]
#        |                                     |
#        v                                     v
#   block on violation                 block stale/missing runs
#                                                |
#                                                v
#                                      [review/risk checks] -> allow

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
cc_state_init

if jq -e '.stop_hook_active == true' <<<"$HOOK_INPUT" >/dev/null; then
  exit 0
fi

message="$(cc_json_get '.last_assistant_message // .message // .response')"
message_lower="$(printf '%s' "$message" | tr '[:upper:]' '[:lower:]')"
state="$(cc_state_read)"
cwd="$(cc_project_cwd)"
if violation="$(cc_evidence_discipline_violation "$message")"; then
  cc_state_append_value evidenceDisciplineViolations "$violation"
  python3 "$SCRIPT_DIR/cc-hindsight-lesson.py" >/dev/null 2>&1 &
  cc_json_block "$violation"
  exit 0
fi

claims_done=false
if [[ "$message_lower" =~ (done|complete|completed|implemented|fixed|passes|shipped|deployed|tests[[:space:]]+pass) ]]; then
  claims_done=true
fi

browser_qa_outstanding=false
if [[ "$message_lower" =~ (outstanding|still[[:space:]]+pending|still[[:space:]]+outstanding|remaining|left) ]] \
  && [[ "$message_lower" =~ (manual[[:space:]]+(browser[[:space:]]+)?(qa|pass)|browser[[:space:]]+(qa|pass)|real[[:space:]]+browser|pnpm[[:space:]]+dev) ]]; then
  browser_qa_outstanding=true
fi

cc_deferred_status_update() {
  local shared_re nonfinal_only_re work_state_only_re explicit_defer_re
  shared_re='(nothing[[:space:]]+is[[:space:]]+live[[:space:]]+yet|before[[:space:]]+i[[:space:]]+(ssh|deploy|proceed)|do[[:space:]]+you[[:space:]]+want[[:space:]]+me[[:space:]]+to[[:space:]]+proceed|awaiting[[:space:]]+(your[[:space:]]+)?(answer|approval|confirmation|go/no-go|go[[:space:]-]*no[[:space:]-]*go)|waiting[[:space:]]+for[[:space:]]+(your[[:space:]]+)?(answer|approval|confirmation|go/no-go|go[[:space:]-]*no[[:space:]-]*go))'
  nonfinal_only_re='(not[[:space:]-]+(claiming[[:space:]-]+)?completion|not[[:space:]-]+done|not[[:space:]-]+complete|work[[:space:]]+is[[:space:]]+paused|paused[[:space:]]+(mid|until|awaiting|while)|no[[:space:]]+live[[:space:]]+change|not[[:space:]]+live[[:space:]]+yet)'
  work_state_only_re='(awaiting|waiting|approval|confirmation|go/no-go|go[[:space:]-]*no[[:space:]-]*go|in_progress|in[[:space:]-]+progress|pending|paused|blocked)'
  explicit_defer_re='(before[[:space:]]+i[[:space:]]+(ssh|deploy|proceed)|do[[:space:]]+you[[:space:]]+want[[:space:]]+me[[:space:]]+to[[:space:]]+proceed|awaiting|waiting|approval|confirmation|go/no-go|go[[:space:]-]*no[[:space:]-]*go)'
  # Some phrases are explicit enough on their own; weaker phrases must pair a
  # non-final claim with a pending/blocked work-state cue to avoid false passes.
  if [[ "$message_lower" =~ (nothing|none)[[:space:]]+(pending|remaining|outstanding|left)|no[[:space:]]+(pending|remaining|outstanding|left) ]] \
    && [[ ! "$message_lower" =~ $explicit_defer_re ]]; then
    return 1
  fi
  if [[ "$message_lower" =~ $shared_re ]] || { [[ "$message_lower" =~ $nonfinal_only_re ]] && [[ "$message_lower" =~ $work_state_only_re ]]; }; then
    return 0
  fi
  return 1
}

if [[ "$claims_done" == "true" ]] && cc_deferred_status_update; then
  claims_done=false
fi

NORM_JQ='
def norm:
  ascii_downcase
  | sub("^/"; "")
  | sub("^skill\\("; "")
  | sub("\\)$"; "")
  | sub("^eternal-control-"; "")
  | sub("^etrnl-"; "")
  | if . == "writing-plans" then "plan"
    elif . == "code-review" then "review"
    elif . == "execute-plan" or . == "run-plan" then "execute"
    elif . == "parallel-fan-out" then "parallel"
    elif . == "devils-advocate" then "stress-test"
    elif . == "agent-file-doctor" then "agent-files"
    else . end;
'

cc_email_triage_requested() {
  jq -e "$NORM_JQ"'
    ([.requestedSkills[]?.value // empty | norm] | any(. == "email-triage"))
      or ((.lastPrompt // "" | ascii_downcase) | test("/email-triage|email[- ]triage"))
  ' <<<"$state" >/dev/null
}

cc_email_triage_request_at() {
  jq -r "$NORM_JQ"'
    [.requestedSkills[]?
      | select((.value // "" | norm) == "email-triage")
      | (.at // "")]
    | map(select(. != ""))
    | max // (.startedAt // "")
  ' <<<"$state"
}

cc_email_triage_run_command_after() {
  local since="$1"
  jq -e --arg since "$since" '
    [.successfulCommands[]?
      | select((.at // "") >= $since)
      | (.command // "")
      | select(test("(^|[[:space:];&|])([^[:space:];&|]*/)?vivaz-email[[:space:]]+triage[[:space:]]+(run|guarded-run)([[:space:]]|$)"))]
    | length > 0
  ' <<<"$state" >/dev/null
}

cc_email_triage_output_run_id_after() {
  local since="$1" cmd run_id
  cmd="$(jq -r --arg since "$since" '
    [.successfulCommands[]?
      | select((.at // "") >= $since)
      | (.command // "")
      | select(test("(^|[[:space:];&|])([^[:space:];&|]*/)?vivaz-email[[:space:]]+triage[[:space:]]+(queue|report)([[:space:]]|$)"))
      | select(test("(^|[[:space:]])--run-id(=|[[:space:]]+)"))]
    | last // ""
  ' <<<"$state")"
  run_id=""
  if [[ "$cmd" =~ --run-id(=|[[:space:]]+)([A-Za-z0-9_.:-]+) ]]; then
    run_id="${BASH_REMATCH[2]}"
  fi
  printf '%s\n' "$run_id"
}

cc_email_triage_evidence_after() {
  local since="$1" output_run_id
  if cc_email_triage_run_command_after "$since"; then
    return 0
  fi
  output_run_id="$(cc_email_triage_output_run_id_after "$since")"
  [[ -n "$output_run_id" ]]
}

cc_email_triage_latest_account_after() {
  local since="$1" cmd account
  cmd="$(jq -r --arg since "$since" '
    [.successfulCommands[]?
      | select((.at // "") >= $since)
      | (.command // "")
      | select(test("(^|[[:space:];&|])([^[:space:];&|]*/)?vivaz-email[[:space:]]+triage[[:space:]]+(run|guarded-run)([[:space:]]|$)"))]
    | last // ""
  ' <<<"$state")"
  account=""
  if [[ "$cmd" =~ --account(=|[[:space:]]+)([A-Za-z0-9_-]+) ]]; then
    account="${BASH_REMATCH[2]}"
  fi
  printf '%s\n' "$account"
}

cc_email_triage_cli() {
  local candidate resolved
  for candidate in "${VIVAZ_EMAIL_BIN:-}" "${VIVAZ_EMAIL_CLI:-}"; do
    [[ -n "$candidate" ]] || continue
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
    if resolved="$(command -v "$candidate" 2>/dev/null)"; then
      printf '%s\n' "$resolved"
      return 0
    fi
  done
  if command -v vivaz-email >/dev/null 2>&1; then
    command -v vivaz-email
    return 0
  fi
  return 1
}

cc_email_triage_verify_latest() {
  local verify_json
  if ! verify_json="$(cc_email_triage_verify_json_after "$1")"; then
    return 1
  fi
  jq -e '.ok == true and (.data.verified == true)' <<<"$verify_json" >/dev/null
}

cc_email_triage_verify_applied() {
  local verify_json
  if ! verify_json="$(cc_email_triage_verify_json_after "$1")"; then
    return 1
  fi
  jq -e '
    .ok == true
    and (.data.verified == true)
    and ((.data.inbox_zero_verified // false) == true)
    and (((.data.inbox_count // 1) | tonumber) == 0)
    and (
      ((.data.gmail_mutated // false) == true)
      or ((.data.queue_ready_without_mutation // false) == true)
    )
  ' <<<"$verify_json" >/dev/null
}

cc_email_triage_verify_json_after() {
  local since="$1" account cli output_run_id
  if ! cli="$(cc_email_triage_cli)"; then
    return 1
  fi
  output_run_id="$(cc_email_triage_output_run_id_after "$since")"
  if [[ -n "$output_run_id" ]]; then
    "$cli" triage verify --run-id "$output_run_id"
    return $?
  fi
  account="$(cc_email_triage_latest_account_after "$since")"
  if [[ -n "$account" ]]; then
    "$cli" triage verify --latest --account "$account"
  else
    "$cli" triage verify --latest
  fi
}

cc_email_triage_message_has_queue() {
  local lower
  lower="$(printf '%s' "$message" | tr '[:upper:]' '[:lower:]')"
  [[ "$message" == *"# Email Reply Queue"* ]] \
    && [[ "$message" == *"## Next Step"* ]] \
    && { [[ "$lower" == *"approve/send"* ]] || [[ "$lower" == *"show the next item"* ]] || [[ "$message" == *"No reply actions are currently queued"* ]]; }
}

cc_email_triage_message_has_report() {
  local lower
  lower="$(printf '%s' "$message" | tr '[:upper:]' '[:lower:]')"
  [[ "$message" == *"# Email Triage Report"* ]] \
    && [[ "$message" == *"## Top Action Items"* ]] \
    && [[ "$message" == *"## Reply Queue"* ]] \
    && [[ "$message" == *"## Action Items"* || "$message" == *"Run: triage_"* ]] \
    && [[ "$lower" =~ latest[[:space:]-]*(thread|message|state)|most[[:space:]-]+recent[[:space:]-]+thread ]] \
    && [[ "$lower" =~ pre[[:space:]-]*existing|preexisting|action[[:space:]-]*backlog|existing[[:space:]-]*action|already[[:space:]-]*open ]]
}

cc_email_triage_message_has_runtime_output() {
  cc_email_triage_message_has_queue || cc_email_triage_message_has_report
}

cc_email_triage_message_claims_complete_with_active_queue() {
  [[ "$message_lower" =~ ([[:alnum:]_-]+[[:space:]]+)?triage[[:space:]]+complete ]] \
    && [[ "$message" != *"No reply actions are currently queued"* ]]
}

cc_plan_execution_requested() {
  jq -e "$NORM_JQ"'
    .planExecutionRequested == true
  ' <<<"$state" >/dev/null
}

cc_documentation_health_requested() {
  jq -e "$NORM_JQ"'
    ([.requestedSkills[]?.value // empty | norm] | any(. == "documentation-health" or . == "docs-health" or . == "documentation-audit"))
      or ((.lastPrompt // "" | ascii_downcase) | test("documentation[- ]health|docs[- ]health|documentation[- ]audit|docs[- ]audit|documentation[- ]drift|docs[- ]drift"))
  ' <<<"$state" >/dev/null
}

cc_code_health_requested() {
  jq -e "$NORM_JQ"'
    ([.requestedSkills[]?.value // empty | norm] | any(. == "code-health" or . == "repo-health" or . == "codebase-health" or . == "health"))
      or ((.lastPrompt // "" | ascii_downcase) | test("code[- ]health|repo[- ]health|codebase[- ]health|no skips|loose ends|whole codebase audit|entire codebase audit"))
  ' <<<"$state" >/dev/null
}

cc_advice_or_search_requested() {
  local prompt lower pattern
  prompt="$(jq -r '.lastPrompt // ""' <<<"$state")"
  prompt="${prompt:0:500}"
  lower="$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')"
  pattern='(^|[^a-z0-9_])(which [^[:cntrl:]]{0,80} should i|what [^[:cntrl:]]{0,80} should i buy|what [^[:cntrl:]]{0,80} should i choose|where can i find|best [^[:cntrl:]]{0,80} for|look up [^[:cntrl:]]{0,80}(price|pricing|availability|review|news)|compare [^[:cntrl:]]{0,80}(prices|pricing|models|plans|options)|recommend [^[:cntrl:]]{0,80}(buy|purchase|choose|for)|(shopping|buying|purchase)[^[:cntrl:]]{0,80}(iphone|airpods|apple watch|travel|restaurant|price|store|retail)|iphone|airpods|apple watch|travel|restaurant)([^a-z0-9_]|$)'
  [[ "$lower" =~ $pattern ]]
}

cc_state_has_edits() {
  jq -e '(((.edits // {}) | length) > 0) or (((.newSourceFiles // {}) | length) > 0)' <<<"$state" >/dev/null
}

cc_advice_message_has_source_evidence() {
  local lower_message
  lower_message="$(printf '%s' "$message" | tr '[:upper:]' '[:lower:]')"
  [[ "$lower_message" =~ https?:// ]] \
    && [[ "$lower_message" =~ (^|[^[:alnum:]])(as[[:space:]]+of|accessed|published|updated|today|yesterday|202[0-9]|january|february|march|april|may|june|july|august|september|october|november|december)([^[:alnum:]]|$) ]]
}

EMAIL_TRIAGE_COMPLETION_RE='(email[[:space:]]+triage[[:space:]]+report|#[[:space:]]*email[[:space:]]+triage[[:space:]]+report|run:[[:space:]]+triage_|inbox[[:space:]-]*zero|triage[[:space:]-]*verified|verify[[:space:]]+reports|inbox_count|gmail_mutated|queue_ready_without_mutation|inbox[[:space:]]+candidates|action[[:space:]]+backlog|archive[[:space:]]+plan)'

cc_email_triage_completion_message() {
  [[ "$message_lower" =~ $EMAIL_TRIAGE_COMPLETION_RE ]]
}

if [[ "$claims_done" != "true" ]] \
  && cc_email_triage_requested \
  && cc_email_triage_completion_message; then
  claims_done=true
fi

if [[ "$claims_done" == "true" ]]; then
  email_triage_verified=false
  MIGRATION_CMD_REGEX='((npx|bunx|yarn(\s+dlx)?|pnpm(\s+(dlx|exec))?|npm(\s+(run|exec))?)\s+([^;&|]+\s+)*?(--\s+)?)?\bprisma\b\s+\bmigrate\b\s+(status|deploy|resolve)\b'
  if [[ "$browser_qa_outstanding" == "true" ]]; then
    cc_json_block "Outstanding browser QA is not a completion state. Run the planned dev server and browser workflow when available, record the browser QA artifact, or mark the task blocked with the exact missing tool/error."
    exit 0
  fi
  ledger_args=(check-stop --session "$(cc_session_id)")
  if cc_plan_execution_requested; then
    ledger_args+=(--require-ledger --require-tasks --require-plan-phases)
  fi
  if ! ledger_status="$(node "$SCRIPT_DIR/../scripts/execution-ledger.mjs" "${ledger_args[@]}" 2>&1)"; then
    cc_json_block "$ledger_status"
    exit 0
  fi
  if cc_advice_or_search_requested && ! cc_state_has_edits; then
    if ! cc_advice_message_has_source_evidence; then
      cc_json_block "Advice/search completion requires current source evidence, not repo preflight. Use web/current docs where needed, include dated source context, and cite URLs before answering."
      exit 0
    fi
    exit 0
  fi
  if cc_email_triage_requested; then
    email_triage_since="$(cc_email_triage_request_at)"
    if ! cc_email_triage_evidence_after "$email_triage_since"; then
      cc_json_block "email-triage phase 1 must clear INBOX first. Run vivaz-email triage guarded-run --account <id> --max-inbox 500 --apply --require-insights and verify Inbox Zero before opening the action queue."
      exit 0
    fi
    if ! cc_email_triage_verify_latest "$email_triage_since"; then
      cc_json_block "email-triage completion requires the latest vivaz-email triage ledger to verify successfully."
      exit 0
    fi
    if ! cc_email_triage_verify_applied "$email_triage_since"; then
      cc_json_block "email-triage Inbox Zero completion requires provider-verified INBOX zero and either gmail_mutated true or queue_ready_without_mutation true. Use vivaz-email triage guarded-run --account <id> --max-inbox 500 --apply --require-insights, verify inbox_count is 0, then open the action queue."
      exit 0
    fi
    if ! cc_email_triage_message_has_runtime_output; then
      cc_json_block "email-triage completion must paste the generated runtime queue item, including '# Email Reply Queue' and '## Next Step', or an explicit audit report. A one-line inbox-zero summary is not actionable."
      exit 0
    fi
    if cc_email_triage_message_claims_complete_with_active_queue; then
      cc_json_block "email-triage queue is not complete after opening one active item. Do not say triage complete; present the active queue item and wait for Victor's decision."
      exit 0
    fi
    email_triage_verified=true
  fi
  if [[ "$email_triage_verified" != "true" ]] && jq -e '((.verificationRuns | length) == 0)' <<<"$state" >/dev/null; then
    cc_json_block "You are trying to claim completion without verification evidence. Re-read the request, map each requested outcome to changed files or command results, run project preflight, verify user-visible behavior, then answer with evidence."
    exit 0
  fi
  if cc_documentation_health_requested; then
    doc_health_input="$(jq -cn --argjson state "$state" --arg message "$message" '{state:$state,message:$message}')"
    if ! doc_health_status="$(node "$SCRIPT_DIR/../scripts/documentation-health-ledger-check.mjs" 2>/dev/null <<<"$doc_health_input")"; then
      cc_json_block "documentation-health completion checker failed. Re-run the documentation-health gate or inspect scripts/documentation-health-ledger-check.mjs before claiming completion."
      exit 0
    fi
    case "$doc_health_status" in
      missing-inventory)
        cc_json_block "documentation-health completion requires a fresh inventory command: node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked. A surface-level doc skim is not enough."
        exit 0
        ;;
      missing-report|missing-coverage-counters|missing-source-truth|missing-ledger|missing-scorecard|missing-inventory-classification)
        cc_json_block "documentation-health completion requires the final report to include coverage counters, source-of-truth mapping, documentation classifications, a findings ledger with severity/disposition/verification, and a scorecard. Expand the report before claiming completion."
        exit 0
        ;;
      missing-comment-health-counters|missing-comment-health-check|missing-comment-health-section)
        cc_json_block "documentation-health completion requires a real TSDoc/JSDoc/comment-health scan command and counters. Sampled comment-health claims are not completion evidence."
        exit 0
        ;;
      missing-ledger-rows|open-findings|invalid-disposition|accepted-risk-missing-owner|missing-action-resolution-plan)
        cc_json_block "documentation-health completion requires parsed findings rows with terminal dispositions plus an action-item resolution plan. Open, TODO, follow-up, blank, or ownerless accepted-risk rows are not closed."
        exit 0
        ;;
      baseline-without-remediation)
        cc_json_block "documentation-health cannot treat baseline or ratchet creation as remediation. Baseline files quantify existing debt; they do not close TSDoc/JSDoc or documentation action items. Continue by fixing the findings, producing a remediation plan, or recording the baseline as blocked/accepted_risk_with_owner only if the user explicitly requested baseline work."
        exit 0
        ;;
      invalid-timestamp)
        cc_json_block "documentation-health completion has malformed or untrusted command timestamps. Re-run the inventory, comment-health, and validation gates before claiming completion."
        exit 0
        ;;
      missing-validation)
        cc_json_block "documentation-health completion requires at least one deterministic validation gate after the inventory, such as documentation-health-ledger-check.mjs, markdown/link tooling, skill-contract-check.mjs, tests/test-hooks.sh, or scripts/doctor.sh."
        exit 0
        ;;
      "")
        ;;
      *)
        cc_json_block "documentation-health completion checker returned an unhandled blocking status: $doc_health_status. Fix the report or checker wiring before claiming completion."
        exit 0
        ;;
    esac
  fi
  if cc_code_health_requested; then
    code_health_input="$(jq -cn --argjson state "$state" --arg message "$message" '{state:$state,message:$message}')"
    if ! code_health_status="$(node "$SCRIPT_DIR/../scripts/code-health-ledger-check.mjs" 2>/dev/null <<<"$code_health_input")"; then
      cc_json_block "code-health completion checker failed. Re-run the code-health gate or inspect scripts/code-health-ledger-check.mjs before claiming completion."
      exit 0
    fi
    case "$code_health_status" in
      "")
        ;;
      missing-inventory)
        cc_json_block "code-health completion requires a fresh inventory command: node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked. A surface-level repo skim is not enough."
        exit 0
        ;;
      missing-report|missing-coverage-counters|missing-coverage-map|missing-action-items|missing-resolution-plan|missing-final-gate-status)
        cc_json_block "code-health completion requires coverage counters, coverage map, action items, a resolution plan, and final gate status. Expand the report before claiming completion."
        exit 0
        ;;
      missing-ledger|missing-ledger-rows|open-findings|invalid-disposition|accepted-risk-missing-owner|open-action-items|unreconciled-action-items)
        cc_json_block "code-health completion requires every action item and finding to have a terminal disposition: fixed, false_positive_with_evidence, accepted_risk_with_owner, or blocked. Open/TODO/follow-up/blank rows are not completion."
        exit 0
        ;;
      invalid-timestamp)
        cc_json_block "code-health completion has malformed or untrusted command timestamps. Re-run the inventory and validation gates before claiming completion."
        exit 0
        ;;
      missing-validation)
        cc_json_block "code-health completion requires a deterministic validation gate after inventory and findings integration, such as tests/test-hooks.sh, tests/test-workflow-tools.sh, scripts/doctor.sh, or the target repo health stack."
        exit 0
        ;;
      *)
        cc_json_block "code-health completion checker returned an unhandled blocking status: $code_health_status. Fix the report or checker wiring before claiming completion."
        exit 0
        ;;
    esac
  fi
  # Keep .verificationRuns[].value extraction because run entries are stored as {value, at}.
  # The migration regex intentionally accepts equivalent status command wrappers.
  if jq -e --arg migration_cmd_regex "$MIGRATION_CMD_REGEX" '
    def touched_schema:
      (.edits // {})
      | to_entries
      | any(.key | test("(schema\\.prisma|prisma/migrations/|packages/db/prisma/)"; "i"));
    touched_schema and ((.verificationRuns // []) | map(.value | ascii_downcase) | any(test($migration_cmd_regex)) | not)
  ' <<<"$state" >/dev/null; then
    cc_json_block "You are claiming completion after schema-related edits without migration evidence. Run prisma migrate status/deploy (or equivalent) and include the result before calling this done."
    exit 0
  fi
  # Current state stores edits as path -> timestamp; older state may use {at}.
  timestamp_status="$(printf '%s' "$state" | CLAUDE_GUARD_CWD="$cwd" python3 -c '
import json
import os
import re
import sys
from datetime import datetime, timezone

quality_re = re.compile(r"(^|[\s;&|])(tsc|eslint|oxlint|biome|prettier|typecheck|lint|test|build|pytest|ruff|mypy|pyright|cargo\s+(test|clippy|build|check)|go\s+(test|vet)|composer\s+test)([\s;&|]|$)|(pnpm|npm|yarn|bun)\s+(run\s+)?(typecheck|lint|test|build|check)([\s;&|]|$)", re.I)
test_re = re.compile(r"(^|[\s;&|])(test|pytest|vitest|jest|mocha|ava|tap|cargo\s+test|go\s+test|composer\s+test)([\s;&|]|$)|(pnpm|npm|yarn|bun)\s+(run\s+)?test([\s;&|]|$)", re.I)
source_re = re.compile(r"\.(js|jsx|ts|tsx|mjs|cjs|py|rs|go|php|rb|java|kt|swift|sh|bash|zsh)$", re.I)
test_path_re = re.compile(r"(\.test\.|\.spec\.|/tests?/|__tests__)", re.I)
exempt_re = re.compile(r"(/(node_modules|dist|build|coverage|\.next|generated|__generated__|migrations)/|\.md$)", re.I)

def parse_ts(value):
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise ValueError("timestamp is not a string")
    stamp = value[:-1] + "+00:00" if value.endswith("Z") else value
    parsed = datetime.fromisoformat(stamp)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()

def latest_run(items):
    values = []
    for item in items:
        epoch = parse_ts(item.get("at") if isinstance(item, dict) else None)
        if epoch is not None:
            values.append(epoch)
    return max(values, default=0)

def classified_runs(state, bucket, pattern):
    runs = list(state.get(bucket) or [])
    if runs:
        return runs
    return [item for item in state.get("verificationRuns") or [] if pattern.search(str(item.get("value") or ""))]

def project_has_tests(cwd):
    if not cwd or not os.path.isdir(cwd):
        return False
    if os.path.isdir(os.path.join(cwd, "tests")):
        return True
    seen = 0
    for root, dirs, files in os.walk(cwd):
        dirs[:] = [item for item in dirs if item not in {".git", "node_modules", "dist", "build", "coverage", ".next"}]
        for name in files:
            seen += 1
            if test_path_re.search(f"{root}/{name}"):
                return True
            if seen > 2000:
                return False
    return False

try:
    state = json.load(sys.stdin)
    edits = []
    source_edits = []
    non_test_source_edits = []
    test_edits = []
    for path, value in (state.get("edits") or {}).items():
        stamp = value.get("at") if isinstance(value, dict) else value
        epoch = parse_ts(stamp)
        if epoch is None:
            continue
        edits.append(epoch)
        normalized = str(path).replace("\\", "/")
        if source_re.search(normalized) and not exempt_re.search(normalized):
            source_edits.append(epoch)
            if test_path_re.search(normalized):
                test_edits.append(epoch)
            else:
                non_test_source_edits.append(epoch)
    verifies = []
    for bucket in ("verificationRuns", "qualityRuns", "testRuns", "browserRuns"):
        for item in state.get(bucket) or []:
            epoch = parse_ts(item.get("at") if isinstance(item, dict) else None)
            if epoch is not None:
                verifies.append(epoch)
except Exception as exc:
    print(f"malformed:{exc}")
else:
    latest_edit = max(edits, default=0)
    latest_verify = max(verifies, default=0)
    latest_source_edit = max(source_edits, default=0)
    latest_non_test_source_edit = max(non_test_source_edits, default=0)
    latest_test_edit = max(test_edits, default=0)
    latest_quality = latest_run(classified_runs(state, "qualityRuns", quality_re))
    latest_test = latest_run(classified_runs(state, "testRuns", test_re))
    cwd = os.environ.get("CLAUDE_GUARD_CWD", "")
    if latest_edit and (not latest_verify or latest_edit > latest_verify):
        print("stale")
    elif latest_source_edit and latest_quality <= latest_source_edit:
        print("missing-quality")
    elif latest_test_edit and latest_test <= latest_test_edit:
        print("missing-tests")
    elif latest_non_test_source_edit and project_has_tests(cwd) and latest_test <= latest_non_test_source_edit:
        print("missing-tests")
    else:
        print("fresh")
')"
  if [[ "$timestamp_status" == malformed:* ]]; then
    cc_json_block "Guard state contains malformed verification timestamps. Re-run the project preflight so stale-verification checks can compare ISO timestamps safely."
    exit 0
  fi
  if [[ "$timestamp_status" == "stale" ]]; then
    cc_json_block "You are trying to claim completion with stale verification. Edits happened after the last recorded verification. Re-run the project preflight or the plan's final verification gate, then answer with evidence."
    exit 0
  fi
  if [[ "$timestamp_status" == "missing-quality" ]]; then
    cc_json_block "You are trying to claim completion without real quality verification after source edits. Run the relevant lint, typecheck, test, or build command; browser/curl checks alone do not prove code quality."
    exit 0
  fi
  if [[ "$timestamp_status" == "missing-tests" ]]; then
    cc_json_block "You are trying to claim completion without a real test run after source or test edits. Run the relevant test command, or state the exact technical blocker."
    exit 0
  fi
  if jq -e "$NORM_JQ"'
    ([.requestedSkills[]?.value // empty | norm | select(. != "email-triage")] - [.skillCalls[]?.value // empty | norm]) | length > 0
  ' <<<"$state" >/dev/null; then
    cc_json_block "A requested skill was not recorded. Invoke it or explicitly state why it is unavailable before claiming completion."
    exit 0
  fi
  if ! execute_gate_status="$(node "$SCRIPT_DIR/../scripts/execute-evidence-check.mjs" 2>/dev/null <<<"$state")"; then
    cc_json_block "etrnl-execute evidence checker failed. Re-run source gates or inspect scripts/execute-evidence-check.mjs before claiming completion."
    exit 0
  fi
  case "$execute_gate_status" in
    missing-agent)
      cc_json_block "etrnl-execute touched multiple source files without write-mode implementation subagent evidence. Dispatch etrnl-executor/Task workers with structured packets for parallel-safe work, or state the exact sequential-degraded blocker before claiming completion."
      exit 0
      ;;
    missing-reviewers)
      cc_json_block "etrnl-execute multi-file source completion needs reviewer subagent evidence. Run etrnl-spec-reviewer and etrnl-quality-reviewer after implementation, then include the review evidence before claiming completion."
      exit 0
      ;;
    missing-tdd-evidence)
      cc_json_block "etrnl-execute source completion needs TDD evidence. Record a red/green verification row, or an explicit not-test-first rationale, before claiming completion."
      exit 0
      ;;
    missing-simplifier)
      cc_json_block "etrnl-execute non-trivial source completion needs code-simplifier evidence. Run or record the simplifier pass after implementation before claiming completion."
      exit 0
      ;;
    missing-reuse-binding)
      cc_json_block "etrnl-execute created new source files without reuse binding evidence. Record searched paths, existing analogs, the reuse decision, and new-surface justification before claiming completion."
      exit 0
      ;;
    missing-type-review)
      cc_json_block "etrnl-execute touched a TypeScript contract/schema/state boundary without advanced TypeScript disposition. Run or record typescript-advanced-types evidence before claiming completion."
      exit 0
      ;;
    missing-install-proof)
      cc_json_block "etrnl-execute touched control-plane install surfaces without install proof. Record source gate, staged install/doctor/canary, and rollback evidence, or state the explicit blocker."
      exit 0
      ;;
  esac
  if jq -e '
    def source_edit_count:
      (.edits // {})
      | to_entries
      | map(select(.key | test("\\.(js|jsx|ts|tsx|mjs|cjs|py|rs|go|php|rb|java|kt|swift|sh|bash|zsh)$"; "i")))
      | map(select(.key | test("(\\.test\\.|\\.spec\\.|/tests?/|__tests__|/node_modules/|/dist/|/build/|/coverage/|/generated/|/__generated__/|/migrations/)"; "i") | not))
      | length;
    (((.reviewTriggers // []) | length) > 0)
      or (((.largeEdits // []) | length) > 0)
      or (((.newSourceFiles // {}) | length) >= 2)
      or (((.repeatedEditFiles // {}) | length) > 0)
      or (source_edit_count >= 3)
  ' <<<"$state" >/dev/null; then
    if ! jq -e '
      ([.reviewRuns[]?.value // empty, .verificationRuns[]?.value // empty, .skillCalls[]?.value // empty] | map(ascii_downcase))
      | any(test("etrnl-review|code[ -]?review|review-log|coderabbit|adversarial|redline|second[ -]?pass|stress-test"))
    ' <<<"$state" >/dev/null; then
      cc_json_block "This change is large or risky enough to need a second-pass review before completion. Run etrnl-review, CodeRabbit, an adversarial/stress review, or record a review-log artifact."
      exit 0
    fi
  fi
fi

exit 0

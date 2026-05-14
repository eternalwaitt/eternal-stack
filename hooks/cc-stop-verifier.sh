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
      | select(test("(^|[[:space:];&|])([^[:space:];&|]*/)?vivaz-email[[:space:]]+triage[[:space:]]+run([[:space:]]|$)"))]
    | length > 0
  ' <<<"$state" >/dev/null
}

cc_email_triage_latest_account_after() {
  local since="$1" cmd account
  cmd="$(jq -r --arg since "$since" '
    [.successfulCommands[]?
      | select((.at // "") >= $since)
      | (.command // "")
      | select(test("(^|[[:space:];&|])([^[:space:];&|]*/)?vivaz-email[[:space:]]+triage[[:space:]]+run([[:space:]]|$)"))]
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
  local since="$1" account cli
  if ! cli="$(cc_email_triage_cli)"; then
    return 1
  fi
  account="$(cc_email_triage_latest_account_after "$since")"
  if [[ -n "$account" ]]; then
    "$cli" triage verify --latest --account "$account" >/dev/null 2>&1
  else
    "$cli" triage verify --latest >/dev/null 2>&1
  fi
}

if [[ "$claims_done" == "true" ]]; then
  email_triage_verified=false
  MIGRATION_CMD_REGEX='((npx|bunx|yarn(\s+dlx)?|pnpm(\s+(dlx|exec))?|npm(\s+(run|exec))?)\s+([^;&|]+\s+)*?(--\s+)?)?\bprisma\b\s+\bmigrate\b\s+(status|deploy|resolve)\b'
  if [[ "$browser_qa_outstanding" == "true" ]]; then
    cc_json_block "Outstanding browser QA is not a completion state. Run the planned dev server and browser workflow when available, record the browser QA artifact, or mark the task blocked with the exact missing tool/error."
    exit 0
  fi
  if ! ledger_status="$(node "$SCRIPT_DIR/../scripts/execution-ledger.mjs" check-stop --session "$(cc_session_id)" 2>&1)"; then
    cc_json_block "$ledger_status"
    exit 0
  fi
  if cc_email_triage_requested; then
    email_triage_since="$(cc_email_triage_request_at)"
    if ! cc_email_triage_run_command_after "$email_triage_since"; then
      cc_json_block "email-triage completion requires a successful vivaz-email triage run command in this session."
      exit 0
    fi
    if ! cc_email_triage_verify_latest "$email_triage_since"; then
      cc_json_block "email-triage completion requires the latest vivaz-email triage ledger to verify successfully."
      exit 0
    fi
    email_triage_verified=true
  fi
  if [[ "$email_triage_verified" != "true" ]] && jq -e '((.verificationRuns | length) == 0)' <<<"$state" >/dev/null; then
    cc_json_block "You are trying to claim completion without verification evidence. Re-read the request, map each requested outcome to changed files or command results, run project preflight, verify user-visible behavior, then answer with evidence."
    exit 0
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

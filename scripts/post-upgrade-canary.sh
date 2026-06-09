#!/usr/bin/env bash
set -Eeuo pipefail

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
TARGET="$CLAUDE_HOME"

if [[ ! -d "$TARGET" ]]; then
  printf 'fail: Claude install directory missing: %s\n' "$TARGET" >&2
  exit 1
fi

required_paths=(
  "commands/email-triage.md"
  "commands/etrnl-dev-plan.md"
  "hooks/cc-pretooluse-guard.sh"
  "hooks/cc-posttoolbatch-observer.sh"
  "hooks/cc-stop-verifier.sh"
  "hooks/cc-posttoolusefailure-diagnose.sh"
  "scripts/update-check.mjs"
  "scripts/tool-stack-check.mjs"
  "scripts/bootstrap-tools.sh"
  "scripts/browser-qa-report.mjs"
  "scripts/lib/evidence-trace.mjs"
  "skills/etrnl-dev-plan/SKILL.md"
  "etrnl/install.json"
)

for rel_path in "${required_paths[@]}"; do
  if [[ ! -f "$TARGET/$rel_path" ]]; then
    printf 'fail: post-upgrade canary missing %s\n' "$TARGET/$rel_path" >&2
    exit 1
  fi
  if [[ "$rel_path" == hooks/*.sh ]] && [[ ! -x "$TARGET/$rel_path" ]]; then
    printf 'fail: post-upgrade canary non-executable %s\n' "$TARGET/$rel_path" >&2
    exit 1
  fi
done

settings_file="$CLAUDE_HOME/settings.json"
if [[ ! -f "$settings_file" ]]; then
  printf 'fail: Claude settings missing: %s\n' "$settings_file" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  printf 'fail: jq not found; please install jq\n' >&2
  exit 1
fi

if ! jq empty "$settings_file" >/dev/null 2>&1; then
  printf 'fail: Claude settings JSON invalid: %s\n' "$settings_file" >&2
  exit 1
fi

canary_tmp="$(mktemp -d "${TMPDIR:-/tmp}/cc-post-upgrade-canary.XXXXXX")"
cleanup() {
  rm -rf -- "$canary_tmp"
}
trap cleanup EXIT

if unchecked_qa="$(node "$TARGET/scripts/browser-qa-report.mjs" create \
  --path "$canary_tmp/browser-qa-unchecked.json" \
  --routes "/,/canary" \
  --viewports "desktop,mobile" \
  --status complete 2>&1)"; then
  printf 'fail: browser QA canary accepted unchecked complete report\n' >&2
  exit 1
fi
if [[ "$unchecked_qa" != *"consoleSummary"* || "$unchecked_qa" != *"networkSummary"* ]]; then
  printf 'fail: browser QA canary rejected for unexpected reason: %s\n' "$unchecked_qa" >&2
  exit 1
fi

captured_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
v2_matrix="$(jq -cn --arg capturedAt "$captured_at" '[{"route":"/","viewport":"desktop","status":"passed","consoleErrors":0,"failedRequests":0,"capturedAt":$capturedAt}]')"
v2_provenance="$(jq -cn --arg capturedAt "$captured_at" '{"tool":"canary","targetUrl":"http://127.0.0.1/canary","command":"canary screenshot","capturedAt":$capturedAt}')"
if missing_screenshot_qa="$(node "$TARGET/scripts/browser-qa-report.mjs" create \
  --path "$canary_tmp/browser-qa-v2-missing-screenshot.json" \
  --artifact-root "$canary_tmp" \
  --schema-version 2 \
  --routes "/" \
  --viewports "desktop" \
  --target-url "http://127.0.0.1/canary" \
  --tool "canary" \
  --provenance "$v2_provenance" \
  --matrix "$v2_matrix" \
  --console "checked console logs" \
  --network "checked network panel" \
  --status complete 2>&1)"; then
  printf 'fail: browser QA canary accepted complete v2 report without screenshot\n' >&2
  exit 1
fi
if [[ "$missing_screenshot_qa" != *"screenshot"* ]]; then
  printf 'fail: browser QA v2 canary rejected for unexpected reason: %s\n' "$missing_screenshot_qa" >&2
  exit 1
fi

canary_state="$canary_tmp/state"
mkdir -p "$canary_state"
email_state="$canary_state/claude-guard-canary-email-triage.json"
jq -nc '{
  schemaVersion: 4,
  requestedSkills: [{value: "email-triage", at: "2026-01-01T00:00:00Z"}],
  successfulCommands: [],
  commands: [],
  blockedCommands: [],
  verificationRuns: [],
  lastPrompt: "/email-triage agencia",
  startedAt: "2026-01-01T00:00:00Z"
}' >"$email_state"
email_dry_payload="$(jq -nc '{session_id:"canary-email-triage",tool_name:"Bash",tool_input:{command:"vivaz-email triage run --account agencia --max-inbox 50"}}')"
email_dry_out="$(printf '%s' "$email_dry_payload" | CLAUDE_GUARD_STATE_DIR="$canary_state" "$TARGET/hooks/cc-pretooluse-guard.sh")"
if ! jq -e '.hookSpecificOutput.permissionDecision == "deny"' <<<"$email_dry_out" >/dev/null; then
  printf 'fail: email-triage canary accepted dry triage run: %s\n' "$email_dry_out" >&2
  exit 1
fi
if [[ "$email_dry_out" != *"Dry email-triage runs are blocked"* ]]; then
  printf 'fail: email-triage dry-run canary rejected for unexpected reason: %s\n' "$email_dry_out" >&2
  exit 1
fi

jq '.successfulCommands = [{command:"vivaz-email triage guarded-run --account agencia --max-inbox 500 --apply --require-insights", at:"2026-01-01T00:00:01Z"}]' "$email_state" >"$email_state.tmp"
mv -- "$email_state.tmp" "$email_state"
email_queue_payload="$(jq -nc '{session_id:"canary-email-triage",tool_name:"Bash",tool_input:{command:"vivaz-email triage queue --run-id triage_canary --mode reply --format markdown --next"}}')"
email_queue_out="$(printf '%s' "$email_queue_payload" | CLAUDE_GUARD_STATE_DIR="$canary_state" "$TARGET/hooks/cc-pretooluse-guard.sh")"
if ! jq -e '.hookSpecificOutput.permissionDecision == "deny"' <<<"$email_queue_out" >/dev/null; then
  printf 'fail: email-triage canary accepted queue before verify: %s\n' "$email_queue_out" >&2
  exit 1
fi
if [[ "$email_queue_out" != *"queue is blocked until Inbox Zero verification"* ]]; then
  printf 'fail: email-triage queue canary rejected for unexpected reason: %s\n' "$email_queue_out" >&2
  exit 1
fi

canary_vivaz_email="$canary_tmp/vivaz-email"
cat >"$canary_vivaz_email" <<'BASH'
#!/usr/bin/env bash
if [[ "$1 $2" == "triage verify" ]]; then
  if [[ "${VIVAZ_EMAIL_VERIFY_NONZERO:-0}" == "1" ]]; then
    printf '{"ok":true,"data":{"verified":true,"dry_run":false,"gmail_mutated":true,"inbox_zero_verified":true,"inbox_count":1}}\n'
  elif [[ "${VIVAZ_EMAIL_VERIFY_READY:-0}" == "1" ]]; then
    printf '{"ok":true,"data":{"verified":true,"dry_run":true,"gmail_mutated":false,"inbox_zero_verified":true,"queue_ready_without_mutation":true,"inbox_count":0,"action_backlog_count":31}}\n'
  else
    printf '{"ok":true,"data":{"verified":true,"dry_run":false,"gmail_mutated":true,"inbox_zero_verified":true,"inbox_count":0}}\n'
  fi
  exit 0
fi
exit 0
BASH
chmod +x "$canary_vivaz_email"
jq '.successfulCommands = [
  {command:"vivaz-email triage guarded-run --account agencia --max-inbox 500 --apply --require-insights", at:"2026-01-01T00:00:01Z"},
  {command:"vivaz-email triage verify --latest --account agencia", at:"2026-01-01T00:00:02Z"}
]' "$email_state" >"$email_state.tmp"
mv -- "$email_state.tmp" "$email_state"
email_queue_verified_out="$(printf '%s' "$email_queue_payload" | VIVAZ_EMAIL_BIN="$canary_vivaz_email" CLAUDE_GUARD_STATE_DIR="$canary_state" "$TARGET/hooks/cc-pretooluse-guard.sh")"
if ! jq -e '.continue == true' <<<"$email_queue_verified_out" >/dev/null; then
  printf 'fail: email-triage canary blocked provider-verified queue: %s\n' "$email_queue_verified_out" >&2
  exit 1
fi

email_queue_no_mutation_out="$(printf '%s' "$email_queue_payload" | VIVAZ_EMAIL_VERIFY_READY=1 VIVAZ_EMAIL_BIN="$canary_vivaz_email" CLAUDE_GUARD_STATE_DIR="$canary_state" "$TARGET/hooks/cc-pretooluse-guard.sh")"
if ! jq -e '.continue == true' <<<"$email_queue_no_mutation_out" >/dev/null; then
  printf 'fail: email-triage canary blocked no-mutation ready queue: %s\n' "$email_queue_no_mutation_out" >&2
  exit 1
fi

email_queue_bad_verify_out="$(printf '%s' "$email_queue_payload" | VIVAZ_EMAIL_VERIFY_NONZERO=1 VIVAZ_EMAIL_BIN="$canary_vivaz_email" CLAUDE_GUARD_STATE_DIR="$canary_state" "$TARGET/hooks/cc-pretooluse-guard.sh")"
if ! jq -e '.hookSpecificOutput.permissionDecision == "deny"' <<<"$email_queue_bad_verify_out" >/dev/null; then
  printf 'fail: email-triage canary accepted queue after nonzero provider verify: %s\n' "$email_queue_bad_verify_out" >&2
  exit 1
fi
if [[ "$email_queue_bad_verify_out" != *"provider verification proves Inbox Zero"* ]]; then
  printf 'fail: email-triage bad-verify canary rejected for unexpected reason: %s\n' "$email_queue_bad_verify_out" >&2
  exit 1
fi

printf 'ok: post-upgrade canary passed\n'

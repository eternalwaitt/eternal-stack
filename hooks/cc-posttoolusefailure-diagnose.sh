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

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
cc_state_init || exit 0

tool_name="$(cc_json_get '.tool_name // .toolName // .tool')"
command="$(cc_json_get '.tool_input.command // .input.command // .command')"
error_text="$(cc_json_get '.error // .stderr // .message // .tool_response.error // .toolResponse.error // .result.error')"
error_hash="$(jq -r '(.error // .stderr // .message // "") | @json' <<<"$HOOK_INPUT" | shasum -a 256 | cut -d' ' -f1)"
key="${tool_name}:${command}:${error_hash}"
cc_state_append_value failures "$key"

failure_hint() {
  local combined
  combined="$(printf '%s %s' "$command" "$error_text" | tr '[:upper:]' '[:lower:]')"
  case "$combined" in
    *"exceeds maximum"*|*"maximum allowed"*|*"too many tokens"*|*"output too large"*)
      printf 'Use a targeted read/search, offsets, or a bounded artifact summary before retrying the large-output command.'
      return 0
      ;;
    *"rtk: no such file"*|*"rtk command not found"*|*"command not found: rtk"*)
      printf 'The rtk wrapper is unavailable in this shell; verify PATH or use the repo-approved direct command only if this project policy allows it.'
      return 0
      ;;
    *"gh api"*404*|*"not found (http 404)"*|*"http 404"*)
      printf 'Verify the GitHub repo, endpoint, and resource id before retrying the same gh api call.'
      return 0
      ;;
    *"pathspec"*|*"no such file or directory"*|*"cannot stat"*)
      printf 'Re-check cwd and file paths with project inventory/status before retrying the path-sensitive command.'
      return 0
      ;;
    *"pnpm outdated"*|*"json"*parse*|*"unexpected end of json"*)
      printf 'pnpm outdated can exit non-zero when it has useful data; capture and inspect stdout/stderr before parsing JSON.'
      return 0
      ;;
    *"triage_guard_ml_disagreed"*|*"ml archive review found"*disagreement*)
      printf 'Email-triage ML disagreement is a recoverable guard path, not a question for Victor. Inspect the run with vivaz-email triage ml-reviews --latest --account <id> --limit 20, then patch deterministic rules/cache or rerun guarded-run with the exact run id from the runtime output.'
      return 0
      ;;
    *"veloz deploy"*|*"vercel deploy"*)
      printf 'Inspect the first build/deploy error and reproduce the matching local build gate before another deploy attempt.'
      return 0
      ;;
    *)
      printf 'Before retrying, inspect the error text, verify the command/tool syntax, and choose the next diagnostic step.'
      ;;
  esac
}

count="$(jq --arg key "$key" '[.failures[]? | select(.value == $key)] | length' "$(cc_state_file)")"
hint="$(failure_hint)"
if (( count >= 2 )); then
  cc_json_block "The same tool failure has repeated. $hint Stop retrying the exact action and pivot."
else
  cc_json_emit_context "PostToolUseFailure" "Tool failed. $hint"
fi

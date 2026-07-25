#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" || "${ETRNL_QUESTION_PREFERENCE:-1}" == "0" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=hooks/lib/profile.sh
source "$SCRIPT_DIR/lib/profile.sh" 2>/dev/null || true
if declare -F etrnl_profile_hook_skipped >/dev/null 2>&1 && etrnl_profile_hook_skipped; then
  exit 0
fi
# shellcheck source=hooks/lib/json.sh
source "$SCRIPT_DIR/lib/json.sh"
# shellcheck source=hooks/lib/event-extract.sh
source "$SCRIPT_DIR/lib/event-extract.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0

tool_name="$(cc_event_tool_name)"
[[ -n "$tool_name" ]] || exit 0
tool_lower="$(printf '%s' "$tool_name" | tr '[:upper:]' '[:lower:]')"
# The settings matcher is a coarse filter; the authoritative check is here so the
# hook stays correct when a host routes an MCP ask tool under another name.
case "$tool_lower" in
  askuserquestion|ask_user_question) ;;
  mcp__*ask_user*|mcp__*ask_question*|mcp__*askuserquestion*|mcp__*user_question*) ;;
  *) exit 0 ;;
esac

question_text="$(jq -r '
  [ (.tool_input // .input // {})
    | (.question // empty), (.header // empty), (.prompt // empty), (.message // empty),
      ((.questions // [])[]? | ((.question // empty), (.header // empty))),
      ((.options // [])[]? | if type == "string" then . else ((.label // empty), (.description // empty)) end),
      ((.questions // [])[]? | (.options // [])[]? | if type == "string" then . else ((.label // empty), (.description // empty)) end)
  ] | map(tostring) | join(" ")
' <<<"$HOOK_INPUT" 2>/dev/null || true)"
question_lower="$(printf '%s' "$question_text" | tr '[:upper:]' '[:lower:]')"

# MANDATORY SAFETY CLAMP — evaluated before any preference lookup, so no
# preference file, topic entry, or env override can auto-answer a one-way door.
# Deploy, production schema, auth, and money questions always reach the user.
one_way_pattern='deploy|deployment|rollout to (prod|production)|ship to (prod|production|users)|go[[:space:]/-]?no[[:space:]/-]?go|cut[[:space:]-]?over|production|prod database|prod db|live traffic|schema|migration|migrate|drop[^.?!]*(table|column|database|index|constraint)|truncate|backfill|auth|authentication|authorization|login|sign[[:space:]-]?in|session token|permission|credential|secret|api key|password|payment|billing|invoice|charge|refund|payout|subscription|pricing|price|money|currency|stripe|abacate|irreversible|destructive|cannot be undone|data loss|delete (the|all|every)'
if [[ "$question_lower" =~ $one_way_pattern ]]; then
  exit 0
fi

# Preference map lookup: explicit override, then repo-local, then home. First
# readable file wins; a malformed file is skipped rather than treated as empty.
preference_file=""
candidates=()
[[ -z "${ETRNL_QUESTION_PREFERENCE_FILE:-}" ]] || candidates+=("$ETRNL_QUESTION_PREFERENCE_FILE")
cwd="$(cc_event_cwd)"
[[ -n "$cwd" ]] || cwd="$PWD"
candidates+=("$cwd/.etrnl/question-preferences.json")
candidates+=("${CLAUDE_HOME:-$HOME/.claude}/etrnl/question-preferences.json")
for candidate in "${candidates[@]}"; do
  [[ -f "$candidate" && -r "$candidate" ]] || continue
  jq -e . "$candidate" >/dev/null 2>&1 || continue
  preference_file="$candidate"
  break
done

resolve_mode() {
  local raw="$1"
  case "$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')" in
    never-ask) printf 'never-ask\n' ;;
    always-ask) printf 'always-ask\n' ;;
    ask-only-for-one-way) printf 'ask-only-for-one-way\n' ;;
    *) printf '\n' ;;
  esac
}

mode=""
answer=""
topic=""
if [[ -n "$preference_file" ]]; then
  # A topic entry wins over the file-level mode when its `match` substring (or the
  # topic key itself) appears in the question text.
  topic_row="$(jq -r --arg q "$question_lower" '
    [ (.topics // {}) | to_entries[]
      | select(.value | type == "object")
      | select(((.value.match // .key) | ascii_downcase) as $m | ($m != "") and ($q | contains($m)))
    ] | first // empty
    | [(.key // ""), (.value.mode // ""), (.value.answer // .value.default // "")]
    | map(tostring) | @tsv
  ' "$preference_file" 2>/dev/null || true)"
  if [[ -n "$topic_row" ]]; then
    IFS=$'\t' read -r topic topic_mode answer <<<"$topic_row"
    mode="$(resolve_mode "${topic_mode:-}")"
  fi
  [[ -n "$mode" ]] || mode="$(resolve_mode "$(jq -r '.mode // ""' "$preference_file" 2>/dev/null || true)")"
fi
env_mode="$(resolve_mode "${ETRNL_QUESTION_PREFERENCE_MODE:-}")"
[[ -z "$env_mode" ]] || mode="$env_mode"
# No usable preference means the stack behaves exactly as it did before: ask.
[[ -n "$mode" ]] || mode="always-ask"
[[ "$mode" != "always-ask" ]] || exit 0

# Without a concrete option to carry, a deny would strand the turn with no way
# forward, so fall back to allowing the ask.
if [[ -z "$answer" ]]; then
  answer="$(jq -r '
    [ (.tool_input // .input // {})
      | ((.options // [])[]?), ((.questions // [])[]? | (.options // [])[]?)
    ] | map(if type == "string" then . else (.label // empty) end) | map(select(. != "")) | first // empty
  ' <<<"$HOOK_INPUT" 2>/dev/null || true)"
fi
[[ -n "$answer" ]] || exit 0

source_label="${preference_file:-env ETRNL_QUESTION_PREFERENCE_MODE}"
topic_label="${topic:-default}"
summary="${question_text:0:200}"
cc_json_deny_pretool "$(printf 'Question preference %s (topic %s, source %s): auto-decided "%s". Do not ask this; proceed with that option and state the assumption in your next message. Question was: %s. One-way doors (deploy, production schema, auth, money) always reach the user regardless of preference. Set ETRNL_QUESTION_PREFERENCE_MODE=always-ask or ETRNL_QUESTION_PREFERENCE=0 to restore prompting.' \
  "$mode" "$topic_label" "$source_label" "$answer" "$summary")"

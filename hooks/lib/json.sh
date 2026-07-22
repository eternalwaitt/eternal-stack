#!/usr/bin/env bash

_JSON_LIB_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=hooks/lib/event-extract.sh
source "$_JSON_LIB_DIR/event-extract.sh"

cc_json_read_stdin() {
  local system
  system="$(uname -s 2>/dev/null || printf 'unknown')"
  if [[ "$system" == "Linux" ]]; then
    if ! HOOK_INPUT="$(dd bs=1048576 count=4 iflag=fullblock 2>/dev/null)"; then
      printf 'claude-guard error: failed to read hook input\n' >&2
      return 1
    fi
    # A read that fills the 4MiB cap exactly is almost certainly truncated;
    # downstream jq will fail on the cut JSON and every hook fails open with
    # no explanation, so name the cause here.
    if ((${#HOOK_INPUT} >= 4194304)); then
      printf 'claude-guard warning: hook input reached the 4MiB stdin cap and may be truncated; hooks may fail open on invalid JSON\n' >&2
    fi
  else
    IFS= read -r -d '' HOOK_INPUT || true
  fi
  if [[ -z "${HOOK_INPUT}" ]]; then
    HOOK_INPUT="{}"
  fi
  # Keep exported hook input below 128 KiB so child tools do not hit ARG_MAX.
  if ((${#HOOK_INPUT} < 131072)); then
    export HOOK_INPUT
  elif ! export -n HOOK_INPUT 2>/dev/null; then
    printf 'claude-guard error: failed to unexport oversized HOOK_INPUT\n' >&2
    return 1
  fi
}

cc_json_require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    printf 'claude-guard warning: jq is unavailable; hook will fail open\n' >&2
    return 1
  fi
}

cc_json_valid() {
  jq -e . >/dev/null 2>&1 <<<"${HOOK_INPUT}"
}

cc_json_get() {
  local expr="$1"
  jq -r "${expr} // empty" <<<"${HOOK_INPUT}" 2>/dev/null || true
}

cc_json_emit_context() {
  local event="$1"
  local text="$2"
  jq -cn --arg event "$event" --arg text "$text" '{
    hookSpecificOutput: {
      hookEventName: $event,
      additionalContext: $text
    }
  }'
}

cc_json_allow() {
  jq -cn '{continue: true, suppressOutput: true}'
}

cc_json_allow_context() {
  local event="$1"
  local text="$2"
  jq -cn --arg event "$event" --arg text "$text" '{
    continue: true,
    suppressOutput: false,
    hookSpecificOutput: {
      hookEventName: $event,
      additionalContext: $text
    }
  }'
}

cc_json_deny_pretool() {
  local reason="$1"
  jq -cn --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
}

cc_json_block() {
  local reason="$1"
  jq -cn --arg reason "$reason" '{decision: "block", reason: $reason}'
}

cc_json_current_assistant_text() {
  local inline msg_id transcript
  inline="$(cc_json_get '.last_assistant_message // .message // .response')"
  if [[ -n "$inline" ]]; then
    printf '%s\n' "$inline"
    return 0
  fi

  msg_id="$(cc_event_assistant_message_id)"
  transcript="$(cc_event_transcript_path)"
  if [[ -n "$transcript" && -f "$transcript" && -n "$msg_id" ]]; then
    local transcript_text transcript_bytes scan_cap jq_program
    # Transcript fallback scans assistant entries for any of the supported id fields
    # (.id, .message.id, .messageId), extracts text blocks from message.content,
    # and returns the last matching text string for this message id.
    jq_program='
      [.[] | select(.type == "assistant")
      | select((.id // .message.id // .messageId // "") == $msg_id)
      | (.message.content // [])[]?
      | select(.type == "text")
      | .text]
      | last // empty
    '
    # The target message id is near the end of the transcript, and transcripts
    # grow to tens of MB in long sessions; slurping the whole file makes this
    # per-tool-call check slower the longer the session runs. Scan only the
    # tail once the file exceeds the cap, dropping the first (possibly partial)
    # line so jq sees valid JSONL.
    scan_cap="${ETRNL_TRANSCRIPT_SCAN_BYTES:-2000000}"
    [[ "$scan_cap" =~ ^[0-9]+$ ]] || scan_cap=2000000
    transcript_bytes="$(wc -c <"$transcript" 2>/dev/null | tr -d '[:space:]' || printf '0')"
    [[ "$transcript_bytes" =~ ^[0-9]+$ ]] || transcript_bytes=0
    if (( transcript_bytes > scan_cap )); then
      if ! transcript_text="$(tail -c "$scan_cap" "$transcript" | sed '1d' | jq -rs --arg msg_id "$msg_id" "$jq_program" 2>&1)"; then
        printf 'claude-guard warning: cc_json_current_assistant_text failed to parse transcript tail %s (msg_id=%s): %s\n' \
          "$transcript" "$msg_id" "$transcript_text" >&2
        return 1
      fi
    elif ! transcript_text="$(jq -rs --arg msg_id "$msg_id" "$jq_program" "$transcript" 2>&1)"; then
      printf 'claude-guard warning: cc_json_current_assistant_text failed to parse transcript %s (msg_id=%s): %s\n' \
        "$transcript" "$msg_id" "$transcript_text" >&2
      return 1
    fi
    printf '%s\n' "$transcript_text"
    return 0
  fi
  return 0
}

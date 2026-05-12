#!/usr/bin/env bash

cc_json_read_stdin() {
  local system
  system="$(uname -s 2>/dev/null || printf 'unknown')"
  if [[ "$system" == "Linux" ]]; then
    if ! HOOK_INPUT="$(dd bs=1048576 count=4 iflag=fullblock 2>/dev/null)"; then
      printf 'claude-guard error: failed to read hook input\n' >&2
      return 1
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

  msg_id="$(cc_json_get '.assistant_message_id // .message_id // .messageId')"
  transcript="$(cc_json_get '.transcript_path')"
  if [[ -n "$transcript" && -f "$transcript" && -n "$msg_id" ]]; then
    local transcript_text
    if ! transcript_text="$(jq -rs --arg msg_id "$msg_id" '
      [.[] | select(.type == "assistant")
      | select((.id // .message.id // .messageId // "") == $msg_id)
      | (.message.content // [])[]?
      | select(.type == "text")
      | .text]
      | last // empty
    ' "$transcript" 2>&1)"; then
      printf 'claude-guard warning: cc_json_current_assistant_text failed to parse transcript %s (msg_id=%s): %s\n' \
        "$transcript" "$msg_id" "$transcript_text" >&2
      return 1
    fi
    printf '%s\n' "$transcript_text"
  fi
}

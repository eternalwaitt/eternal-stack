#!/usr/bin/env bash

# Shared hook payload field extraction with documented fallbacks for Claude Code updates.
# See docs/troubleshooting.md: hook event payload shapes can drift across releases.

cc_event_json() {
  printf '%s' "${HOOK_INPUT:-{}}"
}

cc_event_get() {
  local expr="$1"
  jq -r "${expr} // empty" <<<"$(cc_event_json)" 2>/dev/null || true
}

cc_event_cwd() {
  cc_event_get '.cwd // .workspace.cwd // .workspace.root // env.PWD // empty'
}

cc_event_prompt() {
  cc_event_get '.prompt // .user_prompt // .userPrompt // .message // empty'
}

cc_event_tool_name() {
  cc_event_get '.tool_name // .toolName // .tool // empty'
}

cc_event_bash_command() {
  cc_event_get '.tool_input.command // .input.command // .command // empty'
}

cc_event_file_path() {
  cc_event_get '.tool_input.file_path // .input.file_path // .file_path // empty'
}

cc_event_assistant_message_id() {
  cc_event_get '.assistant_message_id // .message_id // .messageId // empty'
}

cc_event_transcript_path() {
  cc_event_get '.transcript_path // .transcriptPath // empty'
}

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
# shellcheck source=hooks/lib/paths.sh
source "$SCRIPT_DIR/lib/paths.sh"
# shellcheck source=hooks/lib/command-classifiers.sh
source "$SCRIPT_DIR/lib/command-classifiers.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
if ! cc_state_init; then
  printf 'claude-guard warning: state init failed in posttoolbatch observer; continuing with degraded state tracking\n' >&2
fi

# Centralized threshold for repeated edits before forcing review-trigger behavior.
REPEATED_EDIT_THRESHOLD=3
BUGLOG_WARN_INTERVAL_SEC=300
BUGLOG_LOCK_ROOT="${TMPDIR:-/tmp}/claude-guard-buglog-locks"
BUGLOG_RECORD_TIMEOUT_SEC=10
# find -mmin uses minutes; keeping "+${BUGLOG_RECORD_TIMEOUT_SEC}" intentionally yields
# a conservative 10-minute stale-lock cleanup window at the 10-second default timeout.
BUGLOG_STALE_LOCK_MMIN="+${BUGLOG_RECORD_TIMEOUT_SEC}"

rate_limited_buglog_warn() {
  local local_abs="$1"
  local session_id="$2"
  local stamp_file now last
  find "${TMPDIR:-/tmp}" -maxdepth 1 -type f -name 'claude-guard-buglog-warn-*.stamp' -mmin +1440 -delete 2>/dev/null || true
  stamp_file="${TMPDIR:-/tmp}/claude-guard-buglog-warn-${session_id}.stamp"
  now="$(date +%s)"
  last="0"
  if [[ -f "$stamp_file" ]]; then
    last="$(cat "$stamp_file" 2>/dev/null || printf '0')"
  fi
  if [[ "$last" =~ ^[0-9]+$ ]] && (( now - last < BUGLOG_WARN_INTERVAL_SEC )); then
    return 0
  fi
  printf 'claude-guard warning: project-buglog record failed for %s (session %s)\n' "$local_abs" "$session_id" >&2
  printf '%s\n' "$now" >"$stamp_file" 2>/dev/null || true
  chmod 600 "$stamp_file" 2>/dev/null || true
}

run_buglog_record_with_timeout() {
  local timeout_sec="$1"
  shift
  local timeout_bin status
  timeout_bin=""
  if command -v timeout >/dev/null 2>&1; then
    timeout_bin="timeout"
  elif command -v gtimeout >/dev/null 2>&1; then
    timeout_bin="gtimeout"
  fi
  if [[ -n "$timeout_bin" ]]; then
    "$timeout_bin" "$timeout_sec" "$@" >/dev/null 2>&1
    status=$?
    if (( status == 124 || status == 137 )); then
      return 124
    fi
    return "$status"
  fi
  local pid start now
  "$@" >/dev/null 2>&1 &
  pid=$!
  start="$(date +%s)"
  while kill -0 "$pid" 2>/dev/null; do
    now="$(date +%s)"
    if (( now - start >= timeout_sec )); then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      return 124
    fi
    # One-second polling keeps hook overhead low; timeout can overshoot by <1s.
    sleep 1
  done
  wait "$pid"
}

cwd="$(cc_project_cwd)"
tool_name="$(cc_json_get '.tool_name // .toolName // .tool')"
cmd="$(cc_json_get '.tool_input.command // .input.command // .command')"
file_path="$(cc_json_get '.tool_input.file_path')"
skill_name="$(cc_json_get '.tool_input.name // .tool_input.skill // .command_name')"

call_succeeded() {
  local payload="$1"
  local denied status
  denied="$(jq -r '.hookSpecificOutput.permissionDecision // .permissionDecision // empty' <<<"$payload" 2>/dev/null || true)"
  status="$(jq -r '.status // .tool_status // .result.status // empty' <<<"$payload" 2>/dev/null || true)"
  denied="$(printf '%s' "$denied" | tr '[:upper:]' '[:lower:]')"
  status="$(printf '%s' "$status" | tr '[:upper:]' '[:lower:]')"
  if [[ "$denied" == "deny" || "$status" == "error" || "$status" == "failed" ]]; then
    return 1
  fi
  if [[ "$denied" == "allow" ]]; then
    return 0
  fi
  case "$status" in
    success|succeeded|completed|ok) return 0 ;;
  esac
  return 1
}

mark_edit_in_batch() {
  local local_abs="$1"
  local count
  cc_state_batch_mark_path edits "$local_abs"
  cc_state_batch_increment_edit_count "$local_abs"
  count="$(cc_state_batch_get_edit_count "$local_abs" 2>/dev/null || printf '0')"
  if (( count >= REPEATED_EDIT_THRESHOLD )); then
    local session_id
    session_id="$(cc_session_id)"
    cc_state_batch_mark_path repeatedEditFiles "$local_abs"
    cc_state_batch_append_value reviewTriggers "repeated edits: $local_abs"
    if command -v node >/dev/null 2>&1 && [[ -f "$SCRIPT_DIR/../scripts/project-buglog.mjs" ]]; then
      local buglog_lock
      buglog_lock="${BUGLOG_LOCK_ROOT}/$(printf '%s' "$local_abs" | tr -cs '[:alnum:]' '_')"
      mkdir -p "$BUGLOG_LOCK_ROOT" 2>/dev/null || true
      find "$BUGLOG_LOCK_ROOT" -mindepth 1 -maxdepth 1 -type d -mmin "$BUGLOG_STALE_LOCK_MMIN" -exec rmdir {} + 2>/dev/null || true
      if mkdir "$buglog_lock" 2>/dev/null; then
        if ! run_buglog_record_with_timeout "$BUGLOG_RECORD_TIMEOUT_SEC" node "$SCRIPT_DIR/../scripts/project-buglog.mjs" record \
          --cwd "$cwd" \
          --file "$local_abs" \
          --category repeat-edit \
          --summary "This file was edited repeatedly in one session; check the previous failed approach before patching again." \
          --session "$session_id"; then
          rate_limited_buglog_warn "$local_abs" "$session_id"
        fi
        rmdir "$buglog_lock" 2>/dev/null || true
      fi
    fi
  fi
  if cc_is_source_path "$local_abs" && ! cc_is_exempt_path "$local_abs"; then
    cc_state_batch_increment_edit_generation
  fi
}

record_tool() {
  local name="$1"
  local path="$2"
  local command="$3"
  local succeeded="$4"
  case "$name" in
    Read)
      local read_abs
      read_abs="$(cc_abs_path "$path" "$cwd")"
      if [[ "$succeeded" != "true" ]]; then
        cc_state_batch_append_value failures "Read failed: $read_abs"
        return 0
      fi
      cc_state_batch_mark_path reads "$read_abs"
      ;;
    Bash)
      cc_state_batch_append_command_attempt "$command"
      if [[ "$succeeded" != "true" ]]; then
        return 0
      fi
      cc_state_batch_append_command_success "$command"
      if [[ "$command" =~ (^|[[:space:]])(rg|fd|sg|rtk[[:space:]]+grep|git[[:space:]]+grep)([[:space:]]|$) ]]; then
        cc_state_batch_mark_path searches "$command"
      fi
      if cc_command_is_quality_verification "$command"; then
        cc_state_batch_append_value verificationRuns "$command"
        cc_state_batch_append_value qualityRuns "$command"
      fi
      if cc_command_is_test_verification "$command"; then
        cc_state_batch_append_value testRuns "$command"
      fi
      if cc_command_is_browser_verification "$command"; then
        cc_state_batch_append_value browserRuns "$command"
      fi
      if cc_command_is_review_verification "$command"; then
        cc_state_batch_append_value reviewRuns "$command"
      fi
      ;;
    Edit|Write|MultiEdit)
      if [[ "$succeeded" != "true" ]]; then
        return 0
      fi
      mark_edit_in_batch "$(cc_abs_path "$path" "$cwd")"
      ;;
    Skill)
      if [[ "$succeeded" != "true" ]]; then
        cc_state_batch_append_value failures "Skill failed: $path"
        return 0
      fi
      cc_state_batch_append_value skillCalls "$path"
      ;;
    mcp__context7*|mcp__serena*)
      if [[ "$succeeded" != "true" ]]; then
        return 0
      fi
      cc_state_batch_mark_path searches "$name"
      ;;
  esac
}

if ! cc_state_begin_batch; then
  printf 'claude-guard warning: failed to begin state batch; skipping observer tracking\n' >&2
  exit 0
fi
if jq -e '.tool_calls or .toolCalls or .batch' <<<"$HOOK_INPUT" >/dev/null 2>&1; then
  while IFS= read -r item; do
    name="$(jq -r '.tool_name // .toolName // .tool // empty' <<<"$item")"
    if [[ "$name" == "Skill" ]]; then
      path="$(jq -r '.tool_input.name // .tool_input.skill // empty' <<<"$item")"
    else
      path="$(jq -r '.tool_input.file_path // empty' <<<"$item")"
    fi
    command="$(jq -r '.tool_input.command // empty' <<<"$item")"
    success="true"
    call_succeeded "$item" || success="false"
    record_tool "$name" "$path" "$command" "$success"
  done < <(jq -c '(.tool_calls // .toolCalls // .batch // [])[]' <<<"$HOOK_INPUT")
else
  success="true"
  call_succeeded "$HOOK_INPUT" || success="false"
  if [[ "$tool_name" == "Skill" ]]; then
    record_tool "$tool_name" "$skill_name" "$cmd" "$success"
  else
    record_tool "$tool_name" "$file_path" "$cmd" "$success"
  fi
fi
if ! cc_state_commit_batch; then
  printf 'claude-guard warning: failed to commit state batch; continuing without persisted observer updates\n' >&2
fi

state="$(cc_state_read)"
warnings=()
if jq -e '(.edits | length) > 0 and ((.qualityRuns | length) == 0)' <<<"$state" >/dev/null; then
  warnings+=("Quality verification is stale or missing after edits.")
fi
if jq -e '(.requestedSkills | length) > 0 and ((.skillCalls | length) == 0)' <<<"$state" >/dev/null; then
  warnings+=("A requested skill has not been recorded yet.")
fi
if jq -e '((.repeatedEditFiles // {}) | length) > 0' <<<"$state" >/dev/null; then
  warnings+=("Repeated edits detected; bug memory has been updated and a second-pass review may be required.")
fi

if (( ${#warnings[@]} > 0 )); then
  msg="$(printf '%s\n' "${warnings[@]}" | head -c 1200)"
  cc_json_emit_context "PostToolBatch" "$msg"
fi

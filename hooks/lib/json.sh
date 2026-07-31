#!/usr/bin/env bash

_JSON_LIB_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=hooks/lib/event-extract.sh
source "$_JSON_LIB_DIR/event-extract.sh"

_cc_json_read_stdin_python() {
  local cap="$1" idle_ms="$2" first_ms="$3" err_file="$4"
  python3 - "$cap" "$idle_ms" "$first_ms" 3<&0 2>"$err_file" <<'PY'
import os
import select
import sys

max_bytes = int(sys.argv[1])
idle_sec = int(sys.argv[2]) / 1000.0
first_byte_sec = int(sys.argv[3]) / 1000.0
data = bytearray()
fd = 3  # caller stdin duplicated before the script heredoc
stopped_on_idle = False
while len(data) < max_bytes:
    timeout = first_byte_sec if not data else idle_sec
    ready, _, _ = select.select([fd], [], [], timeout)
    if ready:
        chunk = os.read(fd, min(65536, max_bytes - len(data)))
        if not chunk:
            break
        data.extend(chunk)
    else:
        if data:
            stopped_on_idle = True
        break
sys.stdout.buffer.write(data)
sys.exit(0)
PY
}

_cc_json_read_stdin_perl() {
  local cap="$1" idle_ms="$2" first_ms="$3" err_file="$4"
  perl - "$cap" "$idle_ms" "$first_ms" 3<&0 2>"$err_file" <<'PERL'
use strict;
use warnings;
use IO::Select;

my $max_bytes = int($ARGV[0]);
my $idle_sec  = int($ARGV[1]) / 1000.0;
my $first_byte_sec = int($ARGV[2]) / 1000.0;
open(my $in, '<&=', 3) or exit 1;
my $data = "";
my $sel  = IO::Select->new($in);
my $stopped_on_idle = 0;
while (length($data) < $max_bytes) {
    my $timeout = length($data) ? $idle_sec : $first_byte_sec;
    my @ready = $sel->can_read($timeout);
    if (@ready) {
        my $chunk = "";
        my $n = sysread($in, $chunk, 65536 > ($max_bytes - length($data)) ? ($max_bytes - length($data)) : 65536);
        last if !defined($n) || $n == 0;
        $data .= $chunk;
    } else {
        $stopped_on_idle = 1 if length($data);
        last;
    }
}
print $data;
exit 0;
PERL
}

cc_json_read_stdin() {
  # Claude Code closes stdin on the first hook call of a session but keeps it
  # open afterward; read-to-EOF (head -c) then blocks until the hook timeout.
  # Use an idle-timeout reader instead: stop once stdin goes quiet after data.
  # macOS /bin/bash 3.2 read -t accepts integer seconds only (no fractional).
  local _stdin_cap=4194304
  # Measured inter-chunk gaps: ~1.3ms (fast writes), ~54ms max (50ms pauses).
  # 100ms idle gives 2x margin over the slow-chunk case.
  local _idle_ms=100
  # Wait longer for the first byte so delayed hook delivery is not mistaken for empty stdin.
  local _first_byte_wait_ms=500
  local _reader="${ETRNL_JSON_STDIN_READER:-auto}"
  local _use_python=false _use_perl=false _use_head=false
  local _reader_err _reader_rc=0 _retry_idle_ms _stdin_byte_len

  case "$_reader" in
    python|python3)
      _use_python=true
      ;;
    perl)
      _use_perl=true
      ;;
    head|blocking|block)
      _use_head=true
      ;;
    auto|"")
      if command -v python3 >/dev/null 2>&1; then
        _use_python=true
      elif command -v perl >/dev/null 2>&1; then
        _use_perl=true
      else
        _use_head=true
      fi
      ;;
    *)
      printf 'claude-guard error: unknown ETRNL_JSON_STDIN_READER=%s\n' "$_reader" >&2
      return 1
      ;;
  esac

  _reader_err="$(mktemp "${TMPDIR:-/tmp}/etrnl-json-stdin-err.XXXXXX")" || return 1

  if [[ "$_use_python" == true ]]; then
    if ! command -v python3 >/dev/null 2>&1; then
      rm -f -- "$_reader_err"
      printf 'claude-guard error: python3 reader requested but python3 is unavailable\n' >&2
      return 1
    fi
    HOOK_INPUT="$(_cc_json_read_stdin_python "$_stdin_cap" "$_idle_ms" "$_first_byte_wait_ms" "$_reader_err")" || _reader_rc=$?
    if (( _reader_rc != 0 )); then
      if [[ -s "$_reader_err" ]]; then
        printf 'claude-guard error: failed to read hook input: %s\n' "$(tr '\n' ' ' <"$_reader_err")" >&2
      else
        printf 'claude-guard error: failed to read hook input\n' >&2
      fi
      rm -f -- "$_reader_err"
      return 1
    fi
    if [[ -n "$HOOK_INPUT" ]] && ! jq -e . >/dev/null 2>&1 <<<"${HOOK_INPUT}"; then
      printf 'claude-guard warning: hook input read stopped on idle timeout with partial payload; retrying with extended wait\n' >&2
      _retry_idle_ms=$(( _idle_ms * 5 ))
      HOOK_INPUT="$(_cc_json_read_stdin_python "$_stdin_cap" "$_retry_idle_ms" "$_first_byte_wait_ms" "$_reader_err")" || _reader_rc=$?
      if (( _reader_rc != 0 )); then
        if [[ -s "$_reader_err" ]]; then
          printf 'claude-guard error: failed to read hook input on retry: %s\n' "$(tr '\n' ' ' <"$_reader_err")" >&2
        else
          printf 'claude-guard error: failed to read hook input on retry\n' >&2
        fi
        rm -f -- "$_reader_err"
        return 1
      fi
      if [[ -n "$HOOK_INPUT" ]] && ! jq -e . >/dev/null 2>&1 <<<"${HOOK_INPUT}"; then
        printf 'claude-guard warning: hook input still incomplete after idle-timeout retry; hooks may fail open on invalid JSON\n' >&2
      fi
    fi
  elif [[ "$_use_perl" == true ]]; then
    if ! command -v perl >/dev/null 2>&1; then
      rm -f -- "$_reader_err"
      printf 'claude-guard error: perl reader requested but perl is unavailable\n' >&2
      return 1
    fi
    HOOK_INPUT="$(_cc_json_read_stdin_perl "$_stdin_cap" "$_idle_ms" "$_first_byte_wait_ms" "$_reader_err")" || _reader_rc=$?
    if (( _reader_rc != 0 )); then
      if [[ -s "$_reader_err" ]]; then
        printf 'claude-guard error: failed to read hook input: %s\n' "$(tr '\n' ' ' <"$_reader_err")" >&2
      else
        printf 'claude-guard error: failed to read hook input\n' >&2
      fi
      rm -f -- "$_reader_err"
      return 1
    fi
    if [[ -n "$HOOK_INPUT" ]] && ! jq -e . >/dev/null 2>&1 <<<"${HOOK_INPUT}"; then
      printf 'claude-guard warning: hook input read stopped on idle timeout with partial payload; retrying with extended wait\n' >&2
      _retry_idle_ms=$(( _idle_ms * 5 ))
      HOOK_INPUT="$(_cc_json_read_stdin_perl "$_stdin_cap" "$_retry_idle_ms" "$_first_byte_wait_ms" "$_reader_err")" || _reader_rc=$?
      if (( _reader_rc != 0 )); then
        if [[ -s "$_reader_err" ]]; then
          printf 'claude-guard error: failed to read hook input on retry: %s\n' "$(tr '\n' ' ' <"$_reader_err")" >&2
        else
          printf 'claude-guard error: failed to read hook input on retry\n' >&2
        fi
        rm -f -- "$_reader_err"
        return 1
      fi
      if [[ -n "$HOOK_INPUT" ]] && ! jq -e . >/dev/null 2>&1 <<<"${HOOK_INPUT}"; then
        printf 'claude-guard warning: hook input still incomplete after idle-timeout retry; hooks may fail open on invalid JSON\n' >&2
      fi
    fi
  else
    # Fallback when no idle-timeout reader is available, or blocking was explicitly requested.
    if [[ "$_reader" == "head" || "$_reader" == "blocking" || "$_reader" == "block" ]]; then
      printf 'claude-guard warning: blocking stdin reader requested; falling back to blocking stdin read (may hang on held-open stdin)\n' >&2
    else
      printf 'claude-guard warning: no python3 or perl found; falling back to blocking stdin read (may hang on held-open stdin)\n' >&2
    fi
    if ! HOOK_INPUT="$(head -c "$_stdin_cap")"; then
      rm -f -- "$_reader_err"
      printf 'claude-guard error: failed to read hook input\n' >&2
      return 1
    fi
  fi
  rm -f -- "$_reader_err"

  # A read that fills the 4MiB cap exactly is almost certainly truncated;
  # downstream jq will fail on the cut JSON and every hook fails open with
  # no explanation, so name the cause here. Compare byte length, not characters.
  _stdin_byte_len="$(LC_ALL=C printf '%s' "$HOOK_INPUT" | wc -c | tr -d '[:space:]')"
  if (( _stdin_byte_len >= _stdin_cap )); then
    printf 'claude-guard warning: hook input reached the 4MiB stdin cap and may be truncated; hooks may fail open on invalid JSON\n' >&2
  fi
  if [[ -z "${HOOK_INPUT}" ]]; then
    HOOK_INPUT="{}"
  fi
  # Keep exported hook input below 128 KiB so child tools do not hit ARG_MAX.
  _stdin_byte_len="$(LC_ALL=C printf '%s' "$HOOK_INPUT" | wc -c | tr -d '[:space:]')"
  if (( _stdin_byte_len < 131072 )); then
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

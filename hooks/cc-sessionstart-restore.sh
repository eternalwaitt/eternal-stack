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
# shellcheck source=hooks/lib/skill-hints.sh
source "$SCRIPT_DIR/lib/skill-hints.sh"

trim_chars() {
  local limit="$1"
  if command -v node >/dev/null 2>&1; then
    node -e '
const limit = Number(process.argv[1]);
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  process.stdout.write(Array.from(input).slice(0, limit).join(""));
});
' "$limit"
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys; sys.stdout.write(sys.stdin.read()[:int(sys.argv[1])])' "$limit"
    return
  fi
  cat
}

cleanup_update_temp_files() {
  [[ -n "${update_stdout_file:-}" ]] && rm -f "$update_stdout_file"
  [[ -n "${update_stderr_file:-}" ]] && rm -f "$update_stderr_file"
}

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
cc_state_init

source_name="$(cc_json_get '.source')"
cwd="$(cc_project_cwd)"
branch=""
dirty=""
if command -v git >/dev/null 2>&1 && git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  branch="$(git -C "$cwd" branch --show-current 2>/dev/null || true)"
  dirty="$(git -C "$cwd" status --porcelain 2>/dev/null | wc -l | xargs)"
fi
cc_state_update --arg cwd "$cwd" ".cwd = \$cwd"

skill_hint="$(get_etrnl_skill_hint)"
update_hint=""
if [[ "${CLAUDE_CONTROL_PLANE_UPDATE_CHECK:-1}" != "0" && -f "$SCRIPT_DIR/../scripts/update-check.mjs" ]] && command -v node >/dev/null 2>&1; then
  update_check_cmd=(node "$SCRIPT_DIR/../scripts/update-check.mjs")
  [[ "${CLAUDE_CONTROL_PLANE_AUTO_UPDATE:-0}" == "1" ]] && update_check_cmd+=(--auto)
  [[ "${CLAUDE_CONTROL_PLANE_REMOTE_UPDATE_CHECK:-0}" == "1" ]] && update_check_cmd+=(--remote)
  update_check_enabled=1
  if ! update_stdout_file="$(mktemp "${TMPDIR:-/tmp}/cc-update-check-out.XXXXXX")"; then
    printf 'claude-guard warning: update-check skipped (stdout temp file unavailable)\n' >&2
    update_check_enabled=0
  elif ! chmod 600 "$update_stdout_file"; then
    printf 'claude-guard warning: update-check skipped (stdout temp file permissions unavailable)\n' >&2
    cleanup_update_temp_files
    update_check_enabled=0
  fi
  if (( update_check_enabled == 1 )) && ! update_stderr_file="$(mktemp "${TMPDIR:-/tmp}/cc-update-check-err.XXXXXX")"; then
    printf 'claude-guard warning: update-check skipped (stderr temp file unavailable)\n' >&2
    cleanup_update_temp_files
    update_check_enabled=0
  elif (( update_check_enabled == 1 )) && ! chmod 600 "$update_stderr_file"; then
    printf 'claude-guard warning: update-check skipped (stderr temp file permissions unavailable)\n' >&2
    cleanup_update_temp_files
    update_check_enabled=0
  fi
  if (( update_check_enabled == 1 )) && [[ ! -w "$update_stdout_file" || ! -w "$update_stderr_file" ]]; then
    printf 'claude-guard warning: update-check skipped (temp files not writable)\n' >&2
    cleanup_update_temp_files
    update_check_enabled=0
  fi
  if (( update_check_enabled == 1 )); then
    trap cleanup_update_temp_files EXIT INT TERM
    update_exit_status=0
    if "${update_check_cmd[@]}" >"$update_stdout_file" 2>"$update_stderr_file"; then
      update_exit_status=0
      update_hint="$(trim_chars 600 <"$update_stdout_file")"
    else
      update_exit_status=$?
      update_error="$(tr '\n' ' ' <"$update_stderr_file" | trim_chars 500)"
      update_hint="CONTROL_PLANE_UPDATE_WARNING update-check-failed(exit=${update_exit_status}): ${update_error:-unknown error}"
    fi
    update_stderr="$(tr '\n' ' ' <"$update_stderr_file" | trim_chars 500)"
    if [[ -n "$update_stderr" ]]; then
      printf 'claude-guard warning: update-check stderr (exit=%s): %s\n' "$update_exit_status" "$update_stderr" >&2
    fi
    cleanup_update_temp_files
    trap - EXIT INT TERM
  fi
fi
state="$(cc_state_read)"
if [[ "$source_name" == "compact" ]]; then
  msg="$(jq -r --arg hint "$skill_hint" '"Compact recovery: " + (.lastCompactSummary // "no saved summary") + "\n" + $hint' <<<"$state")"
  if [[ -n "$update_hint" ]]; then
    msg="$msg"$'\n'"$update_hint"
  fi
  msg="$(printf '%s' "$msg" | trim_chars 1200)"
else
  msg="Control-plane guard active. Fresh evidence beats memory. Cwd: $cwd"
  if [[ -n "$branch" ]]; then
    msg="$msg. Git: $branch, dirty files: ${dirty:-0}"
  fi
  msg="$msg. $skill_hint"
  if [[ -n "$update_hint" ]]; then
    msg="$msg Update: $update_hint"
  fi
  msg="$(printf '%s' "$msg" | trim_chars 1500)"
fi
cc_json_emit_context "SessionStart" "$msg"

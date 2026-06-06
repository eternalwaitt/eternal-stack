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
if [[ "$source_name" == "compact" ]]; then
  # Compact recovery stays deterministic: inject only the bounded handoff and
  # skill hint, not advisory workflow/update/learning projections.
  if handoff_json="$(cc_etrnl_state_compact_handoff_json "$(cc_session_id)" 2>/dev/null)" \
    && jq -e '.found == true and ((.text // "") | length > 0)' >/dev/null 2>&1 <<<"$handoff_json"; then
    msg="$(jq -r '.text' <<<"$handoff_json")"
    msg="$msg"$'\n'"$skill_hint"
    msg="$(printf '%s' "$msg" | trim_chars 1200)"
    cc_json_emit_context "SessionStart" "$msg"
    exit 0
  fi
  state="$(cc_state_read)"
  if jq -e '((.lastCompactSummary // "") | length) > 0' >/dev/null 2>&1 <<<"$state"; then
    msg="$(jq -r --arg hint "$skill_hint" '
      "Compact recovery: "
      + (.lastCompactSummary // "no saved summary")
      + (if ((.lastCompactAt // "") | length) > 0 then " (last compact: " + .lastCompactAt + ", count: " + ((.compactCount // 0) | tostring) + ")" else "" end)
      + "\n"
      + $hint
    ' <<<"$state")"
    msg="$(printf '%s' "$msg" | trim_chars 1200)"
    cc_json_emit_context "SessionStart" "$msg"
    exit 0
  fi
  exit 0
fi
update_hint=""
workflow_status_hint=""
workflow_status_json=""
learning_hint=""
WORKFLOW_ISSUE_FILTER='
  def workflow_issue:
    (.unfinishedTasks > 0)
      or (.blockedTasks > 0)
      or (.failedChecks > 0)
      or ((.staleRuns // .runs.stale // 0) > 0)
      or ((.uat.openFindings // 0) > 0)
      or ((.missingArtifacts // []) | length > 0);
'
if [[ "${CLAUDE_CONTROL_PLANE_UPDATE_CHECK:-1}" != "0" && -f "$SCRIPT_DIR/../scripts/update-check.mjs" ]] && command -v node >/dev/null 2>&1; then
  update_check_cmd=(node "$SCRIPT_DIR/../scripts/update-check.mjs")
  [[ "${CLAUDE_CONTROL_PLANE_AUTO_UPDATE:-1}" != "0" ]] && update_check_cmd+=(--auto)
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
if [[ -f "$SCRIPT_DIR/../scripts/workflow-health.mjs" ]] && command -v node >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
  if workflow_status_json="$(node "$SCRIPT_DIR/../scripts/workflow-health.mjs" status --json --cwd "$cwd" --session "$(cc_session_id)" 2>/dev/null)" \
    && jq -e . >/dev/null 2>&1 <<<"$workflow_status_json"; then
    workflow_status_hint="$(jq -r "$WORKFLOW_ISSUE_FILTER"'
      workflow_issue as $has_issue
      | if ((((.activeRunId // "") | tostring | length) > 0) or $has_issue) then
        [
          "run=\(.activeRunId // "none")",
          "unfinished=\(.unfinishedTasks)",
          "blocked=\(.blockedTasks)",
          "failedChecks=\(.failedChecks)",
          "staleRuns=\(.staleRuns // .runs.stale // 0)",
          "uatOpen=\(.uat.openFindings // 0)",
          "next=\(.nextAction)"
        ]
        | "Workflow status: " + join(" ")
      else
        ""
      end
    ' <<<"$workflow_status_json")"
    if (( ${#workflow_status_hint} > 220 )); then
      truncated="$(printf '%s' "$workflow_status_hint" | cut -c1-217)"
      word_truncated="${truncated% *}"
      if [[ -n "$word_truncated" && "$word_truncated" != "$truncated" ]]; then
        truncated="$word_truncated"
      fi
      workflow_status_hint="${truncated}..."
    fi
  else
    printf 'claude-guard warning: workflow status hint skipped\n' >&2
  fi
fi
if [[ "${CLAUDE_CONTROL_PLANE_LEARNING_STARTUP_HINTS:-}" != "0" \
  && -f "$SCRIPT_DIR/../scripts/project-buglog.mjs" ]] \
  && command -v node >/dev/null 2>&1 \
  && command -v jq >/dev/null 2>&1; then
  learning_enabled=false
  if [[ "${CLAUDE_CONTROL_PLANE_LEARNING_STARTUP_HINTS:-}" == "1" ]]; then
    learning_enabled=true
  elif [[ -n "$workflow_status_json" ]] && jq -e "$WORKFLOW_ISSUE_FILTER"' workflow_issue' >/dev/null 2>&1 <<<"$workflow_status_json"; then
    learning_enabled=true
  fi
  if [[ "$learning_enabled" == "true" ]]; then
    learning_json=""
    if learning_json="$(node "$SCRIPT_DIR/../scripts/project-buglog.mjs" suggest-project --cwd "$cwd" --json --limit 3 2>/dev/null)" \
      && jq -e . >/dev/null 2>&1 <<<"$learning_json"; then
      learning_limit="${CLAUDE_CONTROL_PLANE_LEARNING_HINT_MAX_CHARS:-500}"
      learning_hint_candidate="Project learning hints:"
      retained_learning_fps=()
      while IFS=$'\t' read -r bug_fp bug_severity bug_category bug_summary bug_guard; do
        [[ -n "$bug_fp" ]] || continue
        if cc_state_has_warning_fingerprint "startup-learning:$bug_fp"; then
          continue
        fi
        learning_line="- [$bug_severity] $bug_category: $bug_summary (suggested guard: $bug_guard)"
        next_learning_hint="$learning_hint_candidate"$'\n'"$learning_line"
        if [[ "$(printf '%s' "$next_learning_hint" | trim_chars "$learning_limit")" != "$next_learning_hint" ]]; then
          continue
        fi
        learning_hint_candidate="$next_learning_hint"
        retained_learning_fps+=("$bug_fp")
      done < <(jq -r '.suggestions[]? | [.fingerprint, .severity, .category, .summary, .suggestedGuard] | @tsv' <<<"$learning_json")
      if (( ${#retained_learning_fps[@]} > 0 )); then
        learning_hint="$learning_hint_candidate"
        for bug_fp in "${retained_learning_fps[@]}"; do
          cc_state_record_warning_fingerprint "startup-learning:$bug_fp" || true
        done
      fi
    else
      printf 'claude-guard warning: project learning hint skipped\n' >&2
    fi
  fi
fi
msg="Control-plane guard active. Fresh evidence beats memory. Cwd: $cwd"
if [[ -n "$branch" ]]; then
  msg="$msg. Git: $branch, dirty files: ${dirty:-0}"
fi
msg="$msg. $skill_hint"
if [[ -n "$workflow_status_hint" ]]; then
  msg="$msg $workflow_status_hint"
fi
if [[ -n "$update_hint" ]]; then
  msg="$msg Update: $update_hint"
fi
if [[ -n "$learning_hint" ]]; then
  msg="$msg $learning_hint"
fi
msg="$(printf '%s' "$msg" | trim_chars 1500)"
cc_json_emit_context "SessionStart" "$msg"

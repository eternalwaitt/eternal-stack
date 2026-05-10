#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/lib/json.sh"
source "$SCRIPT_DIR/lib/state.sh"
source "$SCRIPT_DIR/lib/paths.sh"
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
cc_state_update --arg cwd "$cwd" '.cwd = $cwd'

skill_hint="$(get_etrnl_skill_hint)"
state="$(cc_state_read)"
if [[ "$source_name" == "compact" ]]; then
  msg="$(jq -r --arg hint "$skill_hint" '"Compact recovery: " + (.lastCompactSummary // "no saved summary") + "\n" + $hint' <<<"$state")"
  msg="$(printf '%s' "$msg" | trim_chars 1200)"
else
  msg="Control-plane guard active. Fresh evidence beats memory. Cwd: $cwd"
  if [[ -n "$branch" ]]; then
    msg="$msg. Git: $branch, dirty files: ${dirty:-0}"
  fi
  msg="$msg. $skill_hint"
  msg="$(printf '%s' "$msg" | trim_chars 1500)"
fi
cc_json_emit_context "SessionStart" "$msg"

#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=hooks/lib/json.sh
source "$SCRIPT_DIR/lib/json.sh"
# shellcheck source=hooks/lib/paths.sh
source "$SCRIPT_DIR/lib/paths.sh"
# shellcheck source=hooks/lib/code-patterns.sh
source "$SCRIPT_DIR/lib/code-patterns.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0

tool_name="$(cc_json_get '.tool_name // .toolName // .tool')"
case "$tool_name" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

cwd="$(cc_project_cwd)"
file_path="$(cc_json_get '.tool_input.file_path')"
abs="$(cc_abs_path "$file_path" "$cwd")"

if [[ -z "$abs" || ! -f "$abs" || ! "$abs" =~ \.[cm]?[jt]sx?$ ]]; then
  exit 0
fi

if ! cc_is_exempt_path "$abs" && command -v node >/dev/null 2>&1; then
  if ! output="$(node "$SCRIPT_DIR/lib/complexity-check.mjs" "$abs" 2>&1)"; then
    cc_json_block "Full-file quality check failed after edit: $output"
    exit 0
  fi
fi

if [[ "$abs" =~ (\.test\.|\.spec\.|/tests?/|__tests__) ]]; then
  text="$(<"$abs")"
  if violation="$(cc_test_quality_violation "$text" "$abs")"; then
    cc_json_block "Test-quality violation. $violation"
    exit 0
  fi
fi

exit 0

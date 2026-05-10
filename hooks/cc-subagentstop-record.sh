#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/lib/json.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0

if ! output="$(node "$SCRIPT_DIR/../scripts/execution-ledger.mjs" record-subagent <<<"$HOOK_INPUT" 2>&1)"; then
  cc_json_block "$output"
  exit 0
fi

exit 0

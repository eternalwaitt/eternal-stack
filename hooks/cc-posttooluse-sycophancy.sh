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
# shellcheck source=hooks/lib/code-patterns.sh
source "$SCRIPT_DIR/lib/code-patterns.sh"
# shellcheck source=hooks/lib/command-classifiers.sh
source "$SCRIPT_DIR/lib/command-classifiers.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
skip_dedup=0
if ! cc_state_init; then
  printf 'claude-guard warning: failed to initialize state; running PostToolUse sycophancy check without dedup\n' >&2
  skip_dedup=1
fi

message="$(cc_json_current_assistant_text || true)"
if [[ -z "$message" ]]; then
  exit 0
fi

if violation="$(cc_evidence_discipline_violation "$message")"; then
  fingerprint="$(cc_command_fingerprint "$violation" 2>/dev/null || printf 'missing-hash')"
  if [[ "$skip_dedup" != "1" ]]; then
    if [[ "$fingerprint" != "missing-hash" ]] && cc_state_has_evidence_fingerprint "$fingerprint"; then
      exit 0
    fi
    cc_state_append_value evidenceDisciplineViolations "$violation"
    if [[ "$fingerprint" != "missing-hash" ]]; then
      cc_state_record_evidence_fingerprint "$fingerprint"
    fi
  fi
  if [[ "${CLAUDE_GUARD_DISABLE_HINDSIGHT_LESSON:-0}" != "1" ]]; then
    python3 "$SCRIPT_DIR/cc-hindsight-lesson.py" >/dev/null 2>&1 &
    disown || true
  fi
  cc_json_block "$violation"
  exit 0
fi

exit 0

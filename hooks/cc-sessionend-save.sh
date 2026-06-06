#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=hooks/lib/json.sh
source "$SCRIPT_DIR/lib/json.sh"
# shellcheck source=hooks/lib/state.sh
source "$SCRIPT_DIR/lib/state.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
cc_state_init
state="$(cc_state_read)"
cwd="$(cc_json_get '.cwd')"
[[ -n "$cwd" ]] || cwd="$(pwd -P)"
project_fingerprint="$(node -e 'const crypto = require("node:crypto"); const path = require("node:path"); process.stdout.write(crypto.createHash("sha256").update(path.resolve(process.argv[1] || "unknown")).digest("hex").slice(0, 16));' "$cwd" 2>/dev/null || true)"
event="$(jq -cn \
  --arg session "$(cc_session_id)" \
  --arg projectFingerprint "$project_fingerprint" \
  --argjson state "$state" '
  {
    eventKind: "session",
    sessionId: $session,
    projectFingerprint: $projectFingerprint,
    data: {
      status: "ended",
      verificationRuns: (($state.verificationRuns // []) | length),
      compactCount: ($state.compactCount // 0),
      editCount: (($state.edits // {}) | length)
    }
  }')"
cc_etrnl_state_append_json "$event" || true
rm -f -- "$(cc_state_file)" 2>/dev/null || true
rm -rf -- "$(cc_state_lock)" 2>/dev/null || true

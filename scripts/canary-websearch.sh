#!/usr/bin/env bash
set -Eeuo pipefail

OUT="${1:-$HOME/.claude/cache/websearch-canary.json}"
SETTINGS="${HOME}/.claude/settings.json"
mkdir -p "$(dirname "$OUT")"

settings_override=""
if [[ -f "$SETTINGS" ]]; then
  settings_override="$(jq -r '.env.CLAUDE_CODE_ALWAYS_ENABLE_EFFORT // empty' "$SETTINGS")"
fi

if [[ "${CLAUDE_CODE_ALWAYS_ENABLE_EFFORT:-0}" == "1" && "$settings_override" != "0" ]]; then
  jq -cn --arg status failed --arg reason "CLAUDE_CODE_ALWAYS_ENABLE_EFFORT=1" --argjson t "$(date +%s)" \
    '{status:$status,reason:$reason,checkedAtEpoch:$t}' >"$OUT"
  exit 1
fi

jq -cn --arg status ok --arg shell "${CLAUDE_CODE_ALWAYS_ENABLE_EFFORT:-}" --arg settings "$settings_override" --argjson t "$(date +%s)" \
  '{status:$status,env:{shellAlwaysEnableEffort:$shell,settingsAlwaysEnableEffort:$settings},checkedAtEpoch:$t}' >"$OUT"
printf 'ok: websearch environment canary passed\n'

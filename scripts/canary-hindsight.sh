#!/usr/bin/env bash
set -Eeuo pipefail

config="${HOME}/.hindsight/claude-code.json"
settings="${HOME}/.claude/settings.json"

if [[ ! -f "$settings" ]]; then
  printf 'fail: settings file not found: %s\n' "$settings" >&2
  exit 1
fi

if ! jq empty "$settings" >/dev/null 2>/dev/null; then
  printf 'fail: settings file contains invalid JSON: %s\n' "$settings" >&2
  exit 1
fi

if ! jq -e '.enabledPlugins["hindsight-memory@hindsight"] == true' "$settings" >/dev/null; then
  printf 'fail: hindsight-memory plugin is not enabled\n' >&2
  exit 1
fi

if [[ ! -f "$config" ]]; then
  printf 'fail: missing Hindsight config: %s\n' "$config" >&2
  exit 1
fi

jq -e '
  .dynamicBankId == true
  and (.dynamicBankGranularity == ["agent","project"])
  and (.recallContextTurns == 3)
  and ((.recallTypes | index("observation")) != null)
  and (.retainToolCalls == false)
  and (.recallPromptPreamble | test("Fresh repo/runtime evidence overrides memory"))
' "$config" >/dev/null || {
  printf 'fail: Hindsight config does not match strict control-plane profile\n' >&2
  exit 1
}

api_url="$(jq -r '.hindsightApiUrl // empty' "$config")"
if [[ -n "$api_url" ]]; then
  rtk proxy curl -fsS --max-time 2 "${api_url%/}/health" >/dev/null || {
    printf 'fail: Hindsight API health check failed: %s\n' "$api_url" >&2
    exit 1
  }
fi

printf 'ok: hindsight plugin, config, and API health passed\n'

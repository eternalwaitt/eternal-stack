#!/usr/bin/env bash
set -Eeuo pipefail

config="${HINDSIGHT_HOME:-$HOME/.hindsight}/claude-code.json"
settings="${CLAUDE_HOME:-$HOME/.claude}/settings.json"
json=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      config="${2:-}"
      [[ -n "$config" ]] || { printf 'usage: canary-hindsight.sh [--config <file>] [--settings <file>] [--json]\n' >&2; exit 2; }
      shift 2
      ;;
    --settings)
      settings="${2:-}"
      [[ -n "$settings" ]] || { printf 'usage: canary-hindsight.sh [--config <file>] [--settings <file>] [--json]\n' >&2; exit 2; }
      shift 2
      ;;
    --json)
      json=1
      shift
      ;;
    -h|--help)
      printf 'usage: canary-hindsight.sh [--config <file>] [--settings <file>] [--json]\n'
      exit 0
      ;;
    *)
      printf 'usage: canary-hindsight.sh [--config <file>] [--settings <file>] [--json]\n' >&2
      exit 2
      ;;
  esac
done

emit_fail() {
  local code="$1"
  local message="$2"
  if [[ "$json" == "1" ]]; then
    jq -cn --arg code "$code" --arg message "$message" --arg settings "$settings" --arg config "$config" \
      '{ok:false,command:"canary-hindsight",code:$code,message:$message,settings:$settings,config:$config}'
  else
    printf 'fail: %s\n' "$message" >&2
  fi
  exit 1
}

emit_ok() {
  local mode="$1"
  local health="$2"
  if [[ "$json" == "1" ]]; then
    jq -cn --arg mode "$mode" --arg health "$health" --arg settings "$settings" --arg config "$config" \
      '{ok:true,command:"canary-hindsight",mode:$mode,health:$health,settings:$settings,config:$config}'
  else
    printf 'ok: hindsight plugin, config, and %s %s\n' "$mode" "$health"
  fi
}

health_check() {
  local url="$1"
  if command -v rtk >/dev/null 2>&1; then
    rtk proxy curl -fsS --max-time 2 "$url" >/dev/null 2>/dev/null && return 0
  fi
  curl -fsS --max-time 2 "$url" >/dev/null
}

if [[ ! -f "$settings" ]]; then
  emit_fail "settings-missing" "settings file not found: $settings"
fi

if ! jq empty "$settings" >/dev/null 2>/dev/null; then
  emit_fail "settings-invalid-json" "settings file contains invalid JSON: $settings"
fi

if ! jq -e '.enabledPlugins["hindsight-memory@hindsight"] == true' "$settings" >/dev/null; then
  emit_fail "plugin-disabled" "hindsight-memory plugin is not enabled"
fi

if [[ ! -f "$config" ]]; then
  emit_fail "config-missing" "missing Hindsight config: $config"
fi

if jq -e '.retainTranscripts != false' "$config" >/dev/null; then
  emit_fail "config-unsafe" "retainTranscripts must be false"
fi

jq -e '
  .dynamicBankId == true
  and (.dynamicBankGranularity == ["agent","project"])
  and (.recallContextTurns == 3)
  and ((.recallTypes | index("observation")) != null)
  and (.retainToolCalls == false)
  and (.retainTranscripts == false)
  and (.recallPromptPreamble | test("Fresh repo/runtime evidence overrides memory"))
  ' "$config" >/dev/null || {
  emit_fail "config-unsafe" "Hindsight config does not match strict control-plane profile"
}

api_url="$(jq -r '.hindsightApiUrl // empty' "$config")"
if [[ -n "$api_url" ]]; then
  health_check "${api_url%/}/health" || emit_fail "external-api-down" "Hindsight API health check failed: $api_url"
  emit_ok "external-api" "healthy"
  exit 0
fi

api_port="$(jq -r '.apiPort // 9077' "$config")"
if [[ "${HINDSIGHT_CANARY_REQUIRE_HEALTH:-0}" == "1" ]]; then
  health_check "http://127.0.0.1:${api_port}/health" || emit_fail "local-daemon-down" "Hindsight local daemon health check failed: 127.0.0.1:${api_port}"
  emit_ok "local-daemon" "healthy"
else
  emit_ok "local-daemon" "health-skipped"
fi

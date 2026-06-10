#!/usr/bin/env bash

# Keep stack-managed hook merge compatible with personal Claude Code UI config.
readonly ETRNL_RESET_SETTINGS_JQ='{
  enabledPlugins: (.enabledPlugins // {})
} + (if .statusLine then {statusLine: .statusLine} else {} end)'

reset_settings_preserving_enabled_plugins() {
  local settings_file="$1"
  local backup_file="${2:-}"
  local tmp
  tmp="$(mktemp "$settings_file.tmp.XXXXXX")"
  if [[ -f "$settings_file" ]]; then
    if jq "$ETRNL_RESET_SETTINGS_JQ" "$settings_file" >"$tmp" 2>/dev/null; then
      :
    elif [[ -n "$backup_file" && -f "$backup_file" ]] \
      && jq "$ETRNL_RESET_SETTINGS_JQ" "$backup_file" >"$tmp" 2>/dev/null; then
      printf 'install warning: invalid JSON in %s; preserved enabledPlugins and statusLine from install backup\n' "$settings_file" >&2
    else
      printf 'install warning: invalid JSON in %s; resetting enabledPlugins to empty map\n' "$settings_file" >&2
      printf '{"enabledPlugins":{}}\n' >"$tmp"
    fi
  else
    printf '{"enabledPlugins":{}}\n' >"$tmp"
  fi
  install -m 600 "$tmp" "$settings_file"
  rm -f "$tmp"
}

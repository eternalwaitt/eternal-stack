#!/usr/bin/env bash

# Drop stack-owned hook wiring so merge-settings.mjs can re-apply the template cleanly.
readonly ETRNL_RESET_SETTINGS_JQ='del(.hooks)'

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
      printf 'install warning: invalid JSON in %s; restored user settings from install backup (dropped hooks)\n' "$settings_file" >&2
    else
      printf 'install warning: invalid JSON in %s; resetting to empty settings shell\n' "$settings_file" >&2
      printf '{}\n' >"$tmp"
    fi
  else
    printf '{}\n' >"$tmp"
  fi
  install -m 600 "$tmp" "$settings_file"
  rm -f "$tmp"
}

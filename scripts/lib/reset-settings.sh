#!/usr/bin/env bash

# Drop stack-owned hook wiring so merge-settings.mjs can re-apply the template cleanly.
# Foreign hooks whose commands do not live under ~/.claude/hooks/cc-* are preserved.
readonly ETRNL_RESET_SETTINGS_JQ='
  if has("hooks") then
    .hooks |= (
      if . == null then .
      else
        with_entries(
          .value |= (
            map(
              .hooks |= (
                map(select(
                  (.command // "") | test("^[[:space:]]*bash[[:space:]]+(~/.claude/|[^[:space:]]*/\\.claude/)hooks/cc-") | not
                ))
              )
            )
            | map(select((.hooks // []) | length > 0))
          )
        )
      end
    )
  else .
  end
'

reset_settings_preserving_user_settings() {
  local settings_file="$1"
  local backup_file="${2:-}"
  local tmp
  tmp="$(mktemp "$settings_file.tmp.XXXXXX")"
  if [[ -f "$settings_file" ]]; then
    if jq "$ETRNL_RESET_SETTINGS_JQ" "$settings_file" >"$tmp" 2>/dev/null; then
      :
    elif [[ -n "$backup_file" && -f "$backup_file" ]] \
      && jq "$ETRNL_RESET_SETTINGS_JQ" "$backup_file" >"$tmp" 2>/dev/null; then
      printf 'install warning: invalid JSON in %s; restored user settings from install backup (dropped stack hooks)\n' "$settings_file" >&2
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

# Backward-compatible alias for callers that still use the old name.
reset_settings_preserving_enabled_plugins() {
  reset_settings_preserving_user_settings "$@"
}

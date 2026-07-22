#!/usr/bin/env bash

# Hook profile helper. Fail-open: unset/invalid ETRNL_HOOK_PROFILE → standard.

etrnl_profile() {
  local raw="${ETRNL_HOOK_PROFILE:-standard}"
  raw="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    minimal|standard|strict) printf '%s\n' "$raw" ;;
    *) printf 'standard\n' ;;
  esac
}

# Exit early from advisory hooks when profile is minimal.
etrnl_profile_skip_advisory() {
  [[ "$(etrnl_profile)" == "minimal" ]]
}

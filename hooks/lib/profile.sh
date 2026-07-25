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

# Name of the hook entrypoint that sourced this library. BASH_SOURCE's last
# element is the outermost script regardless of function nesting, so this
# resolves the caller without every hook having to pass its own name.
etrnl_profile_hook_name() {
  local name="${1:-}"
  if [[ -z "$name" ]]; then
    name="${BASH_SOURCE[$(( ${#BASH_SOURCE[@]} - 1 ))]:-}"
  fi
  [[ -n "$name" ]] || return 1
  name="${name##*/}"
  printf '%s\n' "${name%.sh}"
}

# Per-hook opt-out. ETRNL_SKIP_HOOKS is a comma list of hook names, with or
# without the .sh suffix (`ETRNL_SKIP_HOOKS=cc-rate-limiter,cc-compact-suggest`),
# so one noisy hook can be turned off without dropping the whole stack to the
# minimal profile.
etrnl_profile_hook_skipped() {
  local raw="${ETRNL_SKIP_HOOKS:-}"
  [[ -n "$raw" ]] || return 1
  local target entry
  target="$(etrnl_profile_hook_name "${1:-}")" || return 1
  [[ -n "$target" ]] || return 1
  local IFS=','
  for entry in $raw; do
    entry="${entry//[[:space:]]/}"
    entry="${entry%.sh}"
    [[ -n "$entry" ]] || continue
    [[ "$entry" != "$target" ]] || return 0
  done
  return 1
}

# Exit early from advisory hooks when profile is minimal or the hook is named in
# ETRNL_SKIP_HOOKS. Hooks that already gate on this function inherit the named
# skip without changing their own code.
etrnl_profile_skip_advisory() {
  etrnl_profile_hook_skipped "${1:-}" && return 0
  [[ "$(etrnl_profile)" == "minimal" ]]
}

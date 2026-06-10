#!/usr/bin/env bash

# shellcheck source=hooks/lib/event-extract.sh
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/event-extract.sh"

cc_project_cwd() {
  local cwd
  cwd="$(cc_event_cwd)"
  if [[ -z "$cwd" ]]; then
    pwd -P
    return
  fi
  if [[ -d "$cwd" ]]; then
    (cd "$cwd" && pwd -P)
    return
  fi
  printf '%s\n' "$cwd"
}

cc_abs_path() {
  local path="$1"
  local cwd="${2:-$(pwd -P)}"
  if [[ -z "$path" ]]; then
    return 0
  fi
  if [[ "$path" == /* ]]; then
    if [[ -e "$path" ]]; then
      (cd "$(dirname "$path")" && printf '%s/%s\n' "$(pwd -P)" "$(basename "$path")")
    elif [[ -d "$(dirname "$path")" ]]; then
      (cd "$(dirname "$path")" && printf '%s/%s\n' "$(pwd -P)" "$(basename "$path")")
    else
      printf '%s\n' "$path"
    fi
    return
  fi
  if [[ -e "$cwd/$path" ]]; then
    (cd "$(dirname "$cwd/$path")" && printf '%s/%s\n' "$(pwd -P)" "$(basename "$path")")
  else
    printf '%s/%s\n' "$cwd" "$path"
  fi
}

cc_is_source_path() {
  local path="$1"
  case "$path" in
    *.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs|*.py|*.rs|*.go|*.php|*.rb|*.java|*.kt|*.swift|*.sh|*.bash|*.zsh) return 0 ;;
    *) return 1 ;;
  esac
}

cc_is_exempt_path() {
  local path="$1"
  case "$path" in
    */node_modules/*|*/dist/*|*/build/*|*/coverage/*|*/.next/*|*/generated/*|*/__generated__/*|*/migrations/*|*.test.*|*.spec.*|*.md) return 0 ;;
    *) return 1 ;;
  esac
}

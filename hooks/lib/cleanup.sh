#!/usr/bin/env bash

# Accumulate temp files and remove them on EXIT, including early deny/error paths.
CLEANUP_FILES=()

cc_register_cleanup() {
  local file="$1"
  [[ -n "$file" ]] || return 0
  CLEANUP_FILES+=("$file")
}

cc_cleanup_files() {
  if (( ${#CLEANUP_FILES[@]} > 0 )); then
    rm -f -- "${CLEANUP_FILES[@]}"
  fi
}

if [[ -z "${CC_CLEANUP_TRAP_REGISTERED:-}" ]]; then
  CC_CLEANUP_TRAP_REGISTERED=1
  trap cc_cleanup_files EXIT
fi

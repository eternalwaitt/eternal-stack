#!/usr/bin/env bash

command_is_broad_codex_memory_scan() {
  local cmd lower
  cmd="$1"
  lower="$(printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]')"
  [[ "$lower" == *".codex"* ]] || return 1
  [[ "$lower" =~ (^|[^a-z0-9_-])(rg|grep|fd|bat|cat|sed|awk)([^a-z0-9_-]|$) ]] || return 1
  [[ "$lower" == *".codex/hooks/rtk-pre-tool-use.sh"* ]] && return 1
  [[ "$lower" == *".codex/memories/memory.md"* || "$lower" == *".codex/memories/memory_summary.md"* ]] && return 1
  [[ "$lower" == *".codex/memories/rollout_summaries/"* ]] && return 1
  return 0
}

is_broad_codex_memory_scan() {
  command_is_broad_codex_memory_scan "$@"
}

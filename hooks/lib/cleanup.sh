#!/usr/bin/env bash

# Accumulate temp files and remove them on EXIT, including early deny/error paths.
# Initialize once: re-sourcing in the same process must not drop already-registered files.
if [[ -z "${CC_CLEANUP_INITIALIZED:-}" ]]; then
  CC_CLEANUP_INITIALIZED=1
  CLEANUP_FILES=()
  CLEANUP_DIRS=()
fi

cc_register_cleanup() {
  local file="$1"
  [[ -n "$file" ]] || return 0
  CLEANUP_FILES+=("$file")
}

# Register a lock dir so a SIGTERM (e.g. hook-timeout kill) releases it via the
# EXIT trap instead of orphaning it. Normal release unregisters it (below), so the
# trap only ever reaps a lock this process is still holding.
cc_register_cleanup_dir() {
  local dir="$1"
  [[ -n "$dir" ]] || return 0
  CLEANUP_DIRS+=("$dir")
}

# Drop a lock dir from the cleanup set after a normal release, so the EXIT trap
# cannot later rmdir a lock another process re-acquired at the same path. Rebuilds
# the array (bash 3.2 has no portable element delete) and guards empty expansion
# under `set -u`.
cc_unregister_cleanup_dir() {
  local dir="$1"
  [[ -n "$dir" ]] || return 0
  (( ${#CLEANUP_DIRS[@]} > 0 )) || return 0
  local kept=() d
  for d in "${CLEANUP_DIRS[@]}"; do
    [[ "$d" == "$dir" ]] || kept+=("$d")
  done
  if (( ${#kept[@]} > 0 )); then
    CLEANUP_DIRS=("${kept[@]}")
  else
    CLEANUP_DIRS=()
  fi
}

cc_cleanup_files() {
  if (( ${#CLEANUP_FILES[@]} > 0 )); then
    rm -f -- "${CLEANUP_FILES[@]}"
  fi
  # Reap ONLY a registered lock dir whose `<dir>.owner` sidecar records THIS process
  # ($$). A different PID means another process re-acquired the path after we
  # released it. An ABSENT owner is NOT safe to reap: acquisition writes the sidecar
  # fail-closed (state.sh), so an ownerless lock on disk is either another process in
  # the tiny window between its `mkdir` and its sidecar write, or a legacy/corrupt
  # lock — reaping it would destroy a live lock and admit a concurrent state writer.
  # Leave ownerless locks to acquisition-time stale handling (PID-liveness + age),
  # which reaps a genuinely abandoned one without racing a live acquirer.
  if (( ${#CLEANUP_DIRS[@]} > 0 )); then
    local dir owner
    for dir in "${CLEANUP_DIRS[@]}"; do
      owner="$(cat "${dir}.owner" 2>/dev/null || true)"
      if [[ "$owner" == "$$" ]]; then
        rm -f -- "${dir}.owner" 2>/dev/null || true
        rmdir -- "$dir" 2>/dev/null || true
      fi
    done
  fi
}

if [[ -z "${CC_CLEANUP_TRAP_REGISTERED:-}" ]]; then
  CC_CLEANUP_TRAP_REGISTERED=1
  trap cc_cleanup_files EXIT
fi

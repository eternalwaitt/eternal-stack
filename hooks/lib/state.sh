#!/usr/bin/env bash

cc_state_dir() {
  printf '%s\n' "${CLAUDE_GUARD_STATE_DIR:-${TMPDIR:-/tmp}}"
}

cc_session_id() {
  local id
  id="$(jq -r '.session_id // .sessionId // env.CLAUDE_SESSION_ID // empty' <<<"${HOOK_INPUT:-{}}" 2>/dev/null || true)"
  if [[ -z "$id" ]]; then
    id="${CLAUDE_SESSION_ID:-default}"
  fi
  printf '%s\n' "${id//[^A-Za-z0-9_.-]/_}"
}

cc_state_file() {
  printf '%s/claude-guard-%s.json\n' "$(cc_state_dir)" "$(cc_session_id)"
}

cc_state_lock() {
  printf '%s.lock\n' "$(cc_state_file)"
}

cc_state_default() {
  jq -cn --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{
    schemaVersion: 1,
    reads: {},
    searches: {},
    edits: {},
    commands: [],
    failures: [],
    skillCalls: [],
    requestedSkills: [],
    evidenceChallenges: [],
    evidenceDisciplineViolations: [],
    verificationRuns: [],
    qualityRuns: [],
    testRuns: [],
    browserRuns: [],
    reviewRuns: [],
    newFileSearches: [],
    newSourceFiles: {},
    editCounts: {},
    largeEdits: [],
    repeatedEditFiles: {},
    reviewTriggers: [],
    lastPrompt: "",
    lastCompactSummary: "",
    cwd: "",
    settingsFingerprint: "",
    startedAt: $now
  }'
}

cc_state_init() {
  local file
  file="$(cc_state_file)"
  if [[ ! -f "$file" ]]; then
    umask 077
    cc_state_default >"$file"
  fi
}

cc_state_acquire_lock() {
  local lock
  lock="$(cc_state_lock)"
  local i=0
  until mkdir "$lock" 2>/dev/null; do
    i=$((i + 1))
    if (( i > 50 )); then
      printf 'claude-guard warning: state lock timed out\n' >&2
      return 1
    fi
    sleep 0.05
  done
  printf '%s\n' "$lock"
}

cc_state_release_lock() {
  local lock="$1"
  if [[ -n "$lock" ]] && ! rmdir "$lock" 2>/dev/null; then
    printf 'claude-guard warning: failed to release state lock: %s\n' "$lock" >&2
  fi
}

cc_state_update() {
  local file lock tmp
  file="$(cc_state_file)"
  cc_state_init
  if ! lock="$(cc_state_acquire_lock)"; then
    printf 'claude-guard warning: state update skipped due to lock timeout\n' >&2
    return 1
  fi
  if ! tmp="$(mktemp "${file}.XXXXXX")"; then
    cc_state_release_lock "$lock"
    return 1
  fi
  if jq "$@" "$file" >"$tmp"; then
    if ! chmod 600 "$tmp" || ! mv -- "$tmp" "$file"; then
      rm -f -- "$tmp"
      cc_state_release_lock "$lock"
      return 1
    fi
  else
    rm -f -- "$tmp"
    cc_state_release_lock "$lock"
    return 1
  fi
  cc_state_release_lock "$lock"
}

cc_state_read() {
  local file
  file="$(cc_state_file)"
  cc_state_init
  jq -c . "$file"
}

cc_state_mark_path() {
  local bucket="$1"
  local path="$2"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --arg bucket "$bucket" --arg path "$path" --arg now "$now" \
    ".[\$bucket] = (.[\$bucket] // {}) | .[\$bucket][\$path] = \$now | .[\$bucket] |= with_entries(select(.key != \"\"))"
}

cc_state_increment_path() {
  local bucket="$1"
  local path="$2"
  cc_state_update --arg bucket "$bucket" --arg path "$path" \
    ".[\$bucket] = (.[\$bucket] // {}) | .[\$bucket][\$path] = ((.[\$bucket][\$path] // 0) + 1)"
  jq -r --arg bucket "$bucket" --arg path "$path" '.[$bucket][$path] // 0' "$(cc_state_file)" 2>/dev/null || printf '0\n'
}

cc_state_append_command() {
  local cmd="$1"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --arg cmd "$cmd" --arg now "$now" \
    ".commands += [{command: \$cmd, at: \$now}] | .commands = (.commands[-200:] // [])"
}

cc_state_append_value() {
  local bucket="$1"
  local value="$2"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --arg bucket "$bucket" --arg value "$value" --arg now "$now" \
    ".[\$bucket] = ((.[\$bucket] // []) + [{value: \$value, at: \$now}]) | .[\$bucket] = (.[\$bucket][-200:] // [])"
}

cc_state_count_command() {
  local cmd="$1"
  jq --arg cmd "$cmd" '[.commands[]? | select(.command == $cmd)] | length' "$(cc_state_file)" 2>/dev/null || printf '0\n'
}

cc_state_has_read() {
  local path="$1"
  jq -e --arg path "$path" '.reads[$path] != null' "$(cc_state_file)" >/dev/null 2>&1
}

cc_state_has_search() {
  jq -e '(.searches | length) > 0 or (.newFileSearches | length) > 0' "$(cc_state_file)" >/dev/null 2>&1
}

#!/usr/bin/env bash

# State transition map:
# [hook event]
#    |
#    v
# [init + migrate to v2]
#    |
#    v
# [apply event mutations]
#    |
#    v
# [persist once under lock]
#    |
#    +--> commands[] (attempts)
#    +--> successfulCommands[] / blockedCommands[]
#    +--> editGeneration / commandLastEditGeneration
#    +--> evidenceViolationFingerprints / prodApprovalMarkers

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
    schemaVersion: 2,
    reads: {},
    searches: {},
    edits: {},
    commands: [],
    blockedCommands: [],
    successfulCommands: [],
    failures: [],
    skillCalls: [],
    requestedSkills: [],
    evidenceChallenges: [],
    evidenceDisciplineViolations: [],
    evidenceViolationFingerprints: {},
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
    editGeneration: 0,
    commandLastEditGeneration: {},
    prodApprovalMarkers: [],
    lastPrompt: "",
    lastCompactSummary: "",
    cwd: "",
    settingsFingerprint: "",
    startedAt: $now
  }'
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

cc_state_upgrade_filter() {
  cat <<'JQ'
def arr(v): if (v | type) == "array" then v else [] end;
def obj(v): if (v | type) == "object" then v else {} end;
def num(v): if (v | type) == "number" then v else 0 end;
{
  schemaVersion: 2,
  reads: obj(.reads),
  searches: obj(.searches),
  edits: obj(.edits),
  commands: arr(.commands),
  blockedCommands: arr(.blockedCommands),
  successfulCommands: arr(.successfulCommands),
  failures: arr(.failures),
  skillCalls: arr(.skillCalls),
  requestedSkills: arr(.requestedSkills),
  evidenceChallenges: arr(.evidenceChallenges),
  evidenceDisciplineViolations: arr(.evidenceDisciplineViolations),
  evidenceViolationFingerprints: obj(.evidenceViolationFingerprints),
  verificationRuns: arr(.verificationRuns),
  qualityRuns: arr(.qualityRuns),
  testRuns: arr(.testRuns),
  browserRuns: arr(.browserRuns),
  reviewRuns: arr(.reviewRuns),
  newFileSearches: arr(.newFileSearches),
  newSourceFiles: obj(.newSourceFiles),
  editCounts: obj(.editCounts),
  largeEdits: arr(.largeEdits),
  repeatedEditFiles: obj(.repeatedEditFiles),
  reviewTriggers: arr(.reviewTriggers),
  editGeneration: num(.editGeneration),
  commandLastEditGeneration: obj(.commandLastEditGeneration),
  prodApprovalMarkers: arr(.prodApprovalMarkers),
  lastPrompt: (.lastPrompt // ""),
  lastCompactSummary: (.lastCompactSummary // ""),
  cwd: (.cwd // ""),
  settingsFingerprint: (.settingsFingerprint // ""),
  startedAt: (.startedAt // "")
}
JQ
}

cc_state_reset_to_default() {
  local file="$1"
  local backup
  backup="${file}.broken.$(date +%s)"
  if [[ -f "$file" ]]; then
    mv -- "$file" "$backup" 2>/dev/null || true
  fi
  umask 077
  cc_state_default >"$file"
  printf 'claude-guard warning: state reset to default (backup: %s)\n' "$backup" >&2
}

cc_state_install_default_if_missing() {
  local file="$1"
  local tmp
  if ! tmp="$(mktemp "${file}.default.XXXXXX")"; then
    return 1
  fi
  if ! cc_state_default >"$tmp" || ! chmod 600 "$tmp"; then
    rm -f -- "$tmp"
    return 1
  fi
  if ln -- "$tmp" "$file" 2>/dev/null; then
    rm -f -- "$tmp"
    return 0
  fi
  if [[ -f "$file" ]]; then
    rm -f -- "$tmp"
    return 0
  fi
  if mv -- "$tmp" "$file" 2>/dev/null && chmod 600 "$file" 2>/dev/null; then
    return 0
  fi
  rm -f -- "$tmp"
  return 1
}

cc_state_init() {
  local file lock tmp
  file="$(cc_state_file)"
  if ! lock="$(cc_state_acquire_lock)"; then
    printf 'claude-guard warning: state init skipped due to lock timeout\n' >&2
    return 1
  fi
  if [[ ! -f "$file" ]]; then
    if ! cc_state_install_default_if_missing "$file"; then
      cc_state_release_lock "$lock"
      printf 'claude-guard warning: failed to create default state file: %s\n' "$file" >&2
      return 1
    fi
    cc_state_release_lock "$lock"
    return 0
  fi
  if ! jq -e . "$file" >/dev/null 2>&1; then
    cc_state_reset_to_default "$file"
    cc_state_release_lock "$lock"
    return 0
  fi
  if ! tmp="$(mktemp "${file}.XXXXXX")"; then
    cc_state_release_lock "$lock"
    return 1
  fi
  if jq "$(cc_state_upgrade_filter)" "$file" >"$tmp"; then
    if ! chmod 600 "$tmp" || ! mv -- "$tmp" "$file"; then
      rm -f -- "$tmp"
      cc_state_release_lock "$lock"
      return 1
    fi
  else
    rm -f -- "$tmp"
    cc_state_reset_to_default "$file"
  fi
  cc_state_release_lock "$lock"
}

cc_state_update() {
  local file lock tmp
  file="$(cc_state_file)"
  cc_state_init || true
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
  cc_state_init || true
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

cc_state_max_items() {
  local value="${CC_STATE_MAX_ITEMS:-200}"
  if [[ ! "$value" =~ ^[0-9]+$ ]] || (( value <= 0 )); then
    value=200
  fi
  printf '%s\n' "$value"
}

cc_state_append_value() {
  local bucket="$1"
  local value="$2"
  local max_items
  local now
  max_items="$(cc_state_max_items)"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --arg bucket "$bucket" --arg value "$value" --arg now "$now" --argjson max_items "$max_items" \
    ".[\$bucket] = ((.[\$bucket] // []) + [{value: \$value, at: \$now}]) | .[\$bucket] = (.[\$bucket][-\$max_items:] // [])"
}

cc_state_append_command() {
  local cmd="$1"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --arg cmd "$cmd" --arg now "$now" \
    ".commands += [{command: \$cmd, at: \$now}] | .commands = (.commands[-200:] // [])"
}

cc_state_record_command_attempt() {
  cc_state_append_command "$1"
}

cc_state_record_command_success() {
  local cmd="$1"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --arg cmd "$cmd" --arg now "$now" \
    '.successfulCommands += [{command: $cmd, at: $now}] |
     .successfulCommands = (.successfulCommands[-200:] // []) |
     .commandLastEditGeneration[$cmd] = (.editGeneration // 0)'
}

cc_state_record_command_blocked() {
  local cmd="$1"
  local reason="$2"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --arg cmd "$cmd" --arg reason "$reason" --arg now "$now" \
    '.blockedCommands += [{command: $cmd, reason: $reason, at: $now}] |
     .blockedCommands = (.blockedCommands[-200:] // []) |
     .commandLastEditGeneration[$cmd] = (.editGeneration // 0)'
}

cc_state_count_successful_command() {
  local cmd="$1"
  cc_state_read | jq --arg cmd "$cmd" '[.successfulCommands[]? | select(.command == $cmd)] | length' 2>/dev/null || printf '0\n'
}

cc_state_count_command() {
  local cmd="$1"
  jq --arg cmd "$cmd" '[.commands[]? | select(.command == $cmd)] | length' "$(cc_state_file)" 2>/dev/null || printf '0\n'
}

cc_state_get_edit_generation() {
  jq -r '.editGeneration // 0' "$(cc_state_file)" 2>/dev/null || printf '0\n'
}

cc_state_increment_edit_generation() {
  cc_state_update '.editGeneration = ((.editGeneration // 0) + 1)'
  cc_state_get_edit_generation
}

cc_state_has_read() {
  local path="$1"
  jq -e --arg path "$path" '.reads[$path] != null' "$(cc_state_file)" >/dev/null 2>&1
}

cc_state_has_search() {
  jq -e '(.searches | length) > 0 or (.newFileSearches | length) > 0' "$(cc_state_file)" >/dev/null 2>&1
}

cc_state_record_evidence_fingerprint() {
  local fingerprint="$1"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --arg fp "$fingerprint" --arg now "$now" '.evidenceViolationFingerprints[$fp] = $now'
}

cc_state_has_evidence_fingerprint() {
  local fingerprint="$1"
  jq -e --arg fp "$fingerprint" '.evidenceViolationFingerprints[$fp] != null' "$(cc_state_file)" >/dev/null 2>&1
}

cc_state_record_prod_approval_marker() {
  local marker="$1"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --arg marker "$marker" --arg now "$now" \
    '.prodApprovalMarkers += [{value: $marker, at: $now}] | .prodApprovalMarkers = (.prodApprovalMarkers[-200:] // [])'
}

cc_state_begin_batch() {
  # NOTE: This is an in-memory snapshot batch API: begin reads once, mutators edit
  # _CC_STATE_BATCH_PAYLOAD, and commit writes that payload back. Concurrent writers
  # updating the same state file between begin and commit can be overwritten.
  # Hooks currently assume single-writer, per-event processing for this batch path.
  _CC_STATE_BATCH_PAYLOAD="$(cc_state_read)"
  _CC_STATE_BATCH_START_GEN="$(jq -r '.editGeneration // 0' <<<"$_CC_STATE_BATCH_PAYLOAD" 2>/dev/null || printf '0')"
}

cc_state_abort_batch() {
  unset _CC_STATE_BATCH_PAYLOAD
  unset _CC_STATE_BATCH_START_GEN
}

cc_state_require_batch() {
  if [[ -z "${_CC_STATE_BATCH_PAYLOAD:-}" ]]; then
    cc_state_abort_batch
    return 1
  fi
}

cc_state_batch_mark_path() {
  local bucket="$1"
  local path="$2"
  local now
  cc_state_require_batch || return 1
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if ! _CC_STATE_BATCH_PAYLOAD="$(jq -c --arg bucket "$bucket" --arg path "$path" --arg now "$now" \
    '.[ $bucket ] = (.[ $bucket ] // {}) | .[$bucket][$path] = $now | .[$bucket] |= with_entries(select(.key != ""))' <<<"$_CC_STATE_BATCH_PAYLOAD")"; then
    cc_state_abort_batch
    return 1
  fi
}

cc_state_batch_append_value() {
  local bucket="$1"
  local value="$2"
  local now
  cc_state_require_batch || return 1
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if ! _CC_STATE_BATCH_PAYLOAD="$(jq -c --arg bucket "$bucket" --arg value "$value" --arg now "$now" \
    '.[ $bucket ] = ((.[ $bucket ] // []) + [{value: $value, at: $now}]) | .[$bucket] = (.[ $bucket ][-200:] // [])' <<<"$_CC_STATE_BATCH_PAYLOAD")"; then
    cc_state_abort_batch
    return 1
  fi
}

cc_state_batch_increment_edit_count() {
  local path="$1"
  cc_state_require_batch || return 1
  if ! _CC_STATE_BATCH_PAYLOAD="$(jq -c --arg path "$path" '.editCounts[$path] = ((.editCounts[$path] // 0) + 1)' <<<"$_CC_STATE_BATCH_PAYLOAD")"; then
    cc_state_abort_batch
    return 1
  fi
}

cc_state_batch_get_edit_count() {
  local path="$1"
  cc_state_require_batch || return 1
  jq -r --arg path "$path" '.editCounts[$path] // 0' <<<"$_CC_STATE_BATCH_PAYLOAD"
}

cc_state_batch_append_command_attempt() {
  local cmd="$1"
  local now
  cc_state_require_batch || return 1
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if ! _CC_STATE_BATCH_PAYLOAD="$(jq -c --arg cmd "$cmd" --arg now "$now" \
    '.commands += [{command: $cmd, at: $now}] | .commands = (.commands[-200:] // [])' <<<"$_CC_STATE_BATCH_PAYLOAD")"; then
    cc_state_abort_batch
    return 1
  fi
}

cc_state_batch_append_command_success() {
  local cmd="$1"
  local now generation
  cc_state_require_batch || return 1
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  generation="$(jq -r '.editGeneration // 0' <<<"$_CC_STATE_BATCH_PAYLOAD")"
  if ! _CC_STATE_BATCH_PAYLOAD="$(jq -c --arg cmd "$cmd" --arg now "$now" --argjson generation "$generation" \
    '.successfulCommands += [{command: $cmd, at: $now}] |
     .successfulCommands = (.successfulCommands[-200:] // []) |
     .commandLastEditGeneration[$cmd] = $generation' <<<"$_CC_STATE_BATCH_PAYLOAD")"; then
    cc_state_abort_batch
    return 1
  fi
}

cc_state_batch_increment_edit_generation() {
  cc_state_require_batch || return 1
  if ! _CC_STATE_BATCH_PAYLOAD="$(jq -c '.editGeneration = ((.editGeneration // 0) + 1)' <<<"$_CC_STATE_BATCH_PAYLOAD")"; then
    cc_state_abort_batch
    return 1
  fi
}

cc_state_commit_batch() {
  local file lock tmp started_on_disk started_batch on_disk_generation start_generation
  cc_state_require_batch || return 1
  file="$(cc_state_file)"
  if ! lock="$(cc_state_acquire_lock)"; then
    printf 'claude-guard warning: batch commit skipped due to lock timeout\n' >&2
    cc_state_abort_batch
    return 1
  fi
  if [[ ! -f "$file" ]] && ! cc_state_install_default_if_missing "$file"; then
    cc_state_release_lock "$lock"
    cc_state_abort_batch
    return 1
  fi
  if ! jq -e . "$file" >/dev/null 2>&1; then
    cc_state_reset_to_default "$file"
  fi
  if ! tmp="$(mktemp "${file}.XXXXXX")"; then
    cc_state_release_lock "$lock"
    cc_state_abort_batch
    return 1
  fi
  started_on_disk="$(jq -r '.startedAt // empty' "$file" 2>/dev/null || true)"
  started_batch="$(jq -r '.startedAt // empty' <<<"$_CC_STATE_BATCH_PAYLOAD" 2>/dev/null || true)"
  if [[ -n "$started_on_disk" && -n "$started_batch" && "$started_on_disk" != "$started_batch" ]]; then
    printf 'claude-guard warning: batch commit aborted due to startedAt mismatch on-disk=%s batch=%s\n' "$started_on_disk" "$started_batch" >&2
    rm -f -- "$tmp"
    cc_state_release_lock "$lock"
    cc_state_abort_batch
    return 1
  fi
  # Optimistic lock: this catches concurrent batch commits that bump editGeneration.
  # Non-batch mutators do not increment editGeneration and therefore won't trip this check.
  on_disk_generation="$(jq -r '.editGeneration // 0' "$file" 2>/dev/null || printf '0')"
  start_generation="${_CC_STATE_BATCH_START_GEN:-0}"
  if [[ "$on_disk_generation" != "$start_generation" ]]; then
    printf 'claude-guard warning: batch commit aborted due to editGeneration mismatch on-disk=%s batch-start=%s\n' "$on_disk_generation" "$start_generation" >&2
    rm -f -- "$tmp"
    cc_state_release_lock "$lock"
    cc_state_abort_batch
    return 1
  fi
  if jq -c "$(cc_state_upgrade_filter)" <<<"$_CC_STATE_BATCH_PAYLOAD" >"$tmp"; then
    if ! chmod 600 "$tmp" || ! mv -- "$tmp" "$file"; then
      rm -f -- "$tmp"
      cc_state_release_lock "$lock"
      cc_state_abort_batch
      return 1
    fi
  else
    rm -f -- "$tmp"
    cc_state_release_lock "$lock"
    cc_state_abort_batch
    return 1
  fi
  cc_state_release_lock "$lock"
  cc_state_abort_batch
}

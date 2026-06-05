#!/usr/bin/env bash

# State transition map:
# [hook event]
#    |
#    v
# [init + migrate to v5; v3 was an internal-only schema during hook hardening]
#    |
#    v
# [apply event mutations]
#    |
#    v
# [persist once under lock]
#    |
#    +--> tmp cache fields for legacy compatibility
#    +--> ETRNL JSONL state for durable compact handoff
#    +--> commands[] (attempts)
#    +--> successfulCommands[] / blockedCommands[]
#    +--> editGeneration / commandLastEditGeneration
#    +--> evidenceViolationFingerprints / prodApprovalMarkers

cc_state_dir() {
  printf '%s\n' "${CLAUDE_GUARD_STATE_DIR:-${TMPDIR:-/tmp}}"
}

cc_etrnl_state_script() {
  printf '%s/../scripts/etrnl-state.mjs\n' "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
}

cc_etrnl_state_available() {
  command -v node >/dev/null 2>&1 && [[ -f "$(cc_etrnl_state_script)" ]]
}

cc_etrnl_state_append_json() {
  local payload="$1"
  local output status
  # Durable ETRNL writes are best-effort for observer hooks: this helper logs
  # failures and returns non-zero so callers can choose fail-open or fail-closed.
  if ! cc_etrnl_state_available; then
    printf 'claude-guard warning: ETRNL state append unavailable\n' >&2
    return 1
  fi
  status=0
  output="$(node "$(cc_etrnl_state_script)" append --json --cwd "$(pwd -P)" <<<"$payload" 2>&1 >/dev/null)" || status=$?
  if [[ "$status" != "0" ]]; then
    printf 'claude-guard warning: ETRNL state append failed (exit %s): %s\n' "$status" "${output%%$'\n'*}" >&2
    return "$status"
  fi
}

cc_etrnl_state_compact_handoff_json() {
  local session_id="$1"
  local max_chars="${2:-1200}"
  if [[ ! "$max_chars" =~ ^[0-9]+$ ]] || (( max_chars <= 0 )); then
    max_chars=1200
  fi
  cc_etrnl_state_available || return 1
  node "$(cc_etrnl_state_script)" compact-handoff --session "$session_id" --json --max-chars "$max_chars"
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
    schemaVersion: 5,
    reads: {},
    searches: {},
    edits: {},
    commands: [],
    blockedCommands: [],
    successfulCommands: [],
    failures: [],
    skillCalls: [],
    agentCalls: [],
    reviewerAgentCalls: [],
    requestedSkills: [],
    evidenceChallenges: [],
    evidenceDisciplineViolations: [],
    evidenceViolationFingerprints: {},
    warningFingerprints: {},
    verificationRuns: [],
    qualityRuns: [],
    testRuns: [],
    browserRuns: [],
    reviewRuns: [],
    toolSignals: [],
    firstEditAt: "",
    firstEditGeneration: 0,
    toolUseBeforeFirstEdit: {},
    toolNoise: {},
    effectivenessCounters: {},
    newFileSearches: [],
    newSourceFiles: {},
    editCounts: {},
    largeEdits: [],
    repeatedEditFiles: {},
    reviewTriggers: [],
    editGeneration: 0,
    commandLastEditGeneration: {},
    prodApprovalMarkers: [],
    activePlanPath: "",
    activePlanPathUpdatedAt: "",
    planExecutionRequested: false,
    planExecutionRequestedAt: "",
    lastPrompt: "",
    lastCompactSummary: "",
    lastCompactAt: "",
    compactCount: 0,
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

cc_state_persist_warning() {
  local message="$1"
  local metrics_path now
  metrics_path="${CLAUDE_GUARD_METRICS_PATH:-${TMPDIR:-/tmp}/claude-guard-metrics.jsonl}"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '%s state-warning %s\n' "$now" "$message" >>"$metrics_path" 2>/dev/null || true
}

cc_state_upgrade_filter() {
  cat <<'JQ'
def arr(v): if (v | type) == "array" then v else [] end;
def obj(v): if (v | type) == "object" then v else {} end;
def num(v): if (v | type) == "number" then v else 0 end;
{
  schemaVersion: 5,
  reads: obj(.reads),
  searches: obj(.searches),
  edits: obj(.edits),
  commands: arr(.commands),
  blockedCommands: arr(.blockedCommands),
  successfulCommands: arr(.successfulCommands),
  failures: arr(.failures),
  skillCalls: arr(.skillCalls),
  agentCalls: arr(.agentCalls),
  reviewerAgentCalls: arr(.reviewerAgentCalls),
  requestedSkills: arr(.requestedSkills),
  evidenceChallenges: arr(.evidenceChallenges),
  evidenceDisciplineViolations: arr(.evidenceDisciplineViolations),
  evidenceViolationFingerprints: obj(.evidenceViolationFingerprints),
  warningFingerprints: obj(.warningFingerprints),
  verificationRuns: arr(.verificationRuns),
  qualityRuns: arr(.qualityRuns),
  testRuns: arr(.testRuns),
  browserRuns: arr(.browserRuns),
  reviewRuns: arr(.reviewRuns),
  toolSignals: arr(.toolSignals),
  firstEditAt: (.firstEditAt // ""),
  firstEditGeneration: num(.firstEditGeneration),
  toolUseBeforeFirstEdit: obj(.toolUseBeforeFirstEdit),
  toolNoise: obj(.toolNoise),
  effectivenessCounters: obj(.effectivenessCounters),
  newFileSearches: arr(.newFileSearches),
  newSourceFiles: obj(.newSourceFiles),
  editCounts: obj(.editCounts),
  largeEdits: arr(.largeEdits),
  repeatedEditFiles: obj(.repeatedEditFiles),
  reviewTriggers: arr(.reviewTriggers),
  editGeneration: num(.editGeneration),
  commandLastEditGeneration: obj(.commandLastEditGeneration),
  prodApprovalMarkers: arr(.prodApprovalMarkers),
  activePlanPath: (.activePlanPath // ""),
  activePlanPathUpdatedAt: (.activePlanPathUpdatedAt // ""),
  planExecutionRequested: (.planExecutionRequested // false),
  planExecutionRequestedAt: (.planExecutionRequestedAt // ""),
  lastPrompt: (.lastPrompt // ""),
  lastCompactSummary: (.lastCompactSummary // ""),
  lastCompactAt: (.lastCompactAt // ""),
  compactCount: num(.compactCount),
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
  local file lock tmp tmp_next critical_update skip_generation_bump
  critical_update=0
  skip_generation_bump=0
  if [[ "${1:-}" == "--critical" ]]; then
    critical_update=1
    shift
  fi
  if [[ "${1:-}" == "--skip-edit-generation-bump" ]]; then
    skip_generation_bump=1
    shift
  fi
  file="$(cc_state_file)"
  if ! cc_state_init; then
    local critical_suffix
    critical_suffix=""
    if (( critical_update == 1 )); then
      critical_suffix=" (critical write blocked)"
    fi
    cc_state_persist_warning "state init failed before update (critical=${critical_update}) file=${file}"
    printf 'claude-guard warning: state init failed before update%s\n' "$critical_suffix" >&2
    if (( critical_update == 1 )); then
      return 1
    fi
  fi
  if ! lock="$(cc_state_acquire_lock)"; then
    printf 'claude-guard warning: state update skipped due to lock timeout\n' >&2
    return 1
  fi
  if ! tmp="$(mktemp "${file}.XXXXXX")"; then
    cc_state_release_lock "$lock"
    return 1
  fi
  if jq "$@" "$file" >"$tmp"; then
    if (( skip_generation_bump == 0 )); then
      tmp_next="${tmp}.next"
      if ! jq '.editGeneration = ((.editGeneration // 0) + 1)' "$tmp" >"$tmp_next"; then
        rm -f -- "$tmp" "$tmp_next"
        cc_state_release_lock "$lock"
        return 1
      fi
      mv -- "$tmp_next" "$tmp"
    fi
    if ! chmod 600 "$tmp" || ! mv -- "$tmp" "$file"; then
      rm -f -- "$tmp" "${tmp}.next"
      cc_state_release_lock "$lock"
      return 1
    fi
  else
    rm -f -- "$tmp" "${tmp}.next"
    cc_state_release_lock "$lock"
    return 1
  fi
  cc_state_release_lock "$lock"
}

cc_state_read() {
  local file
  file="$(cc_state_file)"
  if ! cc_state_init; then
    cc_state_persist_warning "state init failed before read file=${file}"
    printf 'claude-guard warning: state init failed before read; resetting default state: %s\n' "$file" >&2
    cc_state_reset_to_default "$file"
  fi
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
  local max_items
  local now
  max_items="$(cc_state_max_items)"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --arg cmd "$cmd" --arg now "$now" --argjson max_items "$max_items" \
    ".commands += [{command: \$cmd, at: \$now}] | .commands = (.commands[-\$max_items:] // [])"
}

cc_state_record_command_attempt() {
  cc_state_append_command "$1"
}

cc_state_record_command_success() {
  local cmd="$1"
  local max_items
  local now
  max_items="$(cc_state_max_items)"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --arg cmd "$cmd" --arg now "$now" --argjson max_items "$max_items" \
    ".successfulCommands += [{command: \$cmd, at: \$now}] |
     .successfulCommands = (.successfulCommands[-\$max_items:] // []) |
     .commandLastEditGeneration[\$cmd] = (.editGeneration // 0)"
}

cc_state_record_command_blocked() {
  local cmd="$1"
  local reason="$2"
  local max_items
  local now
  max_items="$(cc_state_max_items)"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --arg cmd "$cmd" --arg reason "$reason" --arg now "$now" --argjson max_items "$max_items" \
    ".blockedCommands += [{command: \$cmd, reason: \$reason, at: \$now}] |
     .blockedCommands = (.blockedCommands[-\$max_items:] // []) |
     .commandLastEditGeneration[\$cmd] = (.editGeneration // 0)"
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
  cc_state_update --skip-edit-generation-bump '.editGeneration = ((.editGeneration // 0) + 1)'
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
  cc_state_update --critical --arg fp "$fingerprint" --arg now "$now" ".evidenceViolationFingerprints[\$fp] = \$now"
}

cc_state_has_evidence_fingerprint() {
  local fingerprint="$1"
  jq -e --arg fp "$fingerprint" '.evidenceViolationFingerprints[$fp] != null' "$(cc_state_file)" >/dev/null 2>&1
}

cc_state_record_warning_fingerprint() {
  local fingerprint="$1"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --skip-edit-generation-bump --arg fp "$fingerprint" --arg now "$now" ".warningFingerprints[\$fp] = \$now"
}

cc_state_has_warning_fingerprint() {
  local fingerprint="$1"
  jq -e --arg fp "$fingerprint" '.warningFingerprints[$fp] != null' "$(cc_state_file)" >/dev/null 2>&1
}

cc_state_record_prod_approval_marker() {
  local marker="$1"
  local max_items
  local now
  max_items="$(cc_state_max_items)"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --critical --arg marker "$marker" --arg now "$now" --argjson max_items "$max_items" \
    ".prodApprovalMarkers += [{value: \$marker, at: \$now}] | .prodApprovalMarkers = (.prodApprovalMarkers[-\$max_items:] // [])"
}

cc_state_begin_batch() {
  # NOTE: In-memory snapshot batch API: begin reads once, mutators edit
  # _CC_STATE_BATCH_PAYLOAD, and commit writes that payload back.
  # Concurrency model: hooks assume single-writer, per-event processing.
  # Optimistic concurrency is enforced at commit by editGeneration mismatch checks.
  # There is no built-in retry/backoff on mismatch; callers should treat mismatch as
  # a non-fatal degraded write and continue the hook path.
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
  local max_items
  local now
  cc_state_require_batch || return 1
  max_items="$(cc_state_max_items)"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if ! _CC_STATE_BATCH_PAYLOAD="$(jq -c --arg bucket "$bucket" --arg value "$value" --arg now "$now" --argjson max_items "$max_items" \
    '.[ $bucket ] = ((.[ $bucket ] // []) + [{value: $value, at: $now}]) | .[$bucket] = (.[ $bucket ][-$max_items:] // [])' <<<"$_CC_STATE_BATCH_PAYLOAD")"; then
    cc_state_abort_batch
    return 1
  fi
}

cc_state_batch_append_tool_signal() {
  local tool="$1"
  local tool_kind="$2"
  local event="$3"
  local max_items now
  cc_state_require_batch || return 1
  max_items="$(cc_state_max_items)"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if ! _CC_STATE_BATCH_PAYLOAD="$(jq -c \
    --arg tool "$tool" \
    --arg tool_kind "$tool_kind" \
    --arg event "$event" \
    --arg now "$now" \
    --argjson max_items "$max_items" \
    '
      (.editGeneration // 0) as $generation
      | ((.firstEditAt // "") == "") as $beforeFirstEdit
      | .toolSignals = ((.toolSignals // []) + [{
          tool: $tool,
          toolKind: $tool_kind,
          event: $event,
          toolUsed: true,
          eligible: false,
          usedBeforeFirstEdit: $beforeFirstEdit,
          editGeneration: $generation,
          at: $now
        }])
      | .toolSignals = (.toolSignals[-$max_items:] // [])
      | .effectivenessCounters[$tool] = ((.effectivenessCounters[$tool] // 0) + 1)
      | if $beforeFirstEdit then .toolUseBeforeFirstEdit[$tool] = ((.toolUseBeforeFirstEdit[$tool] // 0) + 1) else . end
      | .editGeneration = ((.editGeneration // 0) + 1)
    ' <<<"$_CC_STATE_BATCH_PAYLOAD")"; then
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
  local max_items
  local now
  cc_state_require_batch || return 1
  max_items="$(cc_state_max_items)"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if ! _CC_STATE_BATCH_PAYLOAD="$(jq -c --arg cmd "$cmd" --arg now "$now" --argjson max_items "$max_items" \
    '.commands += [{command: $cmd, at: $now}] | .commands = (.commands[-$max_items:] // [])' <<<"$_CC_STATE_BATCH_PAYLOAD")"; then
    cc_state_abort_batch
    return 1
  fi
}

cc_state_batch_append_command_success() {
  local cmd="$1"
  local max_items now generation
  cc_state_require_batch || return 1
  max_items="$(cc_state_max_items)"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  generation="$(jq -r '.editGeneration // 0' <<<"$_CC_STATE_BATCH_PAYLOAD")"
  if ! _CC_STATE_BATCH_PAYLOAD="$(jq -c --arg cmd "$cmd" --arg now "$now" --argjson generation "$generation" --argjson max_items "$max_items" \
    '.successfulCommands += [{command: $cmd, at: $now}] |
     .successfulCommands = (.successfulCommands[-$max_items:] // []) |
     .commandLastEditGeneration[$cmd] = $generation' <<<"$_CC_STATE_BATCH_PAYLOAD")"; then
    cc_state_abort_batch
    return 1
  fi
}

cc_state_batch_increment_edit_generation() {
  cc_state_require_batch || return 1
  if ! _CC_STATE_BATCH_PAYLOAD="$(jq -c --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
    if ((.firstEditAt // "") == "") then
      .firstEditAt = $now | .firstEditGeneration = (.editGeneration // 0)
    else
      .
    end
    | .editGeneration = ((.editGeneration // 0) + 1)
  ' <<<"$_CC_STATE_BATCH_PAYLOAD")"; then
    cc_state_abort_batch
    return 1
  fi
}

cc_state_commit_batch() {
  local file lock tmp started_on_disk started_batch on_disk_generation start_generation merged_payload max_items
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
  # Concurrency model for batch commits:
  # - Hooks are expected to be single-writer per session, but overlapping invocations can still happen.
  # - startedAt is immutable for a session; a mismatch means the payload is from a different session state.
  # - Only batch mutators increment editGeneration, so editGeneration is the batch-level optimistic-lock marker.
  # - Any startedAt/editGeneration mismatch is a deliberate fail-safe: abort this commit instead of racing writes.
  started_on_disk="$(jq -r '.startedAt // empty' "$file" 2>/dev/null || true)"
  started_batch="$(jq -r '.startedAt // empty' <<<"$_CC_STATE_BATCH_PAYLOAD" 2>/dev/null || true)"
  if [[ -n "$started_on_disk" && -n "$started_batch" && "$started_on_disk" != "$started_batch" ]]; then
    printf 'claude-guard warning: batch commit aborted due to startedAt mismatch on-disk=%s batch=%s\n' "$started_on_disk" "$started_batch" >&2
    rm -f -- "$tmp"
    cc_state_release_lock "$lock"
    cc_state_abort_batch
    return 1
  fi
  # Optimistic lock: catches concurrent batch commits that bump editGeneration.
  # Non-batch mutators do not increment editGeneration, so this check alone does
  # not detect those writes.
  # Callers are expected to continue without retry if this guard aborts commit.
  on_disk_generation="$(jq -r '.editGeneration // 0' "$file" 2>/dev/null || printf '0')"
  start_generation="${_CC_STATE_BATCH_START_GEN:-0}"
  if [[ "$on_disk_generation" != "$start_generation" ]]; then
    printf 'claude-guard warning: batch commit aborted due to editGeneration mismatch on-disk=%s batch-start=%s\n' "$on_disk_generation" "$start_generation" >&2
    rm -f -- "$tmp"
    cc_state_release_lock "$lock"
    cc_state_abort_batch
    return 1
  fi
  max_items="$(cc_state_max_items)"
  if ! merged_payload="$(jq -c --argjson max_items "$max_items" --slurpfile on_disk "$file" '
      . as $batch
      | ($on_disk[0] // {}) as $disk
      | $batch
      | .evidenceViolationFingerprints = (($disk.evidenceViolationFingerprints // {}) + (.evidenceViolationFingerprints // {}))
      | .prodApprovalMarkers = (((($disk.prodApprovalMarkers // []) + (.prodApprovalMarkers // []))[-$max_items:] // []))
    ' <<<"$_CC_STATE_BATCH_PAYLOAD")"; then
    rm -f -- "$tmp"
    cc_state_release_lock "$lock"
    cc_state_abort_batch
    return 1
  fi
  if jq -c "$(cc_state_upgrade_filter)" <<<"$merged_payload" >"$tmp"; then
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

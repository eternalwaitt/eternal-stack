#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=hooks/lib/json.sh
source "$SCRIPT_DIR/lib/json.sh"
# shellcheck source=hooks/lib/state.sh
source "$SCRIPT_DIR/lib/state.sh"
# shellcheck source=hooks/lib/event-extract.sh
source "$SCRIPT_DIR/lib/event-extract.sh"
# shellcheck source=hooks/lib/cleanup.sh
source "$SCRIPT_DIR/lib/cleanup.sh"
# shellcheck source=hooks/lib/profile.sh
source "$SCRIPT_DIR/lib/profile.sh" 2>/dev/null || true

# Naming the router in ETRNL_SKIP_HOOKS disables it completely, including the
# skill-routing state other hooks read. The minimal profile is the softer lever:
# it drops advisory context but keeps that state.
if declare -F etrnl_profile_hook_skipped >/dev/null 2>&1 && etrnl_profile_hook_skipped; then
  exit 0
fi

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
cc_state_init

prompt="$(cc_event_prompt)"
cwd="$(cc_event_cwd)"
[[ -n "$cwd" ]] || cwd="$PWD"
cc_state_update --arg prompt "$prompt" ".lastPrompt = \$prompt"
prompt_lower="$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')"

record_skill() {
  local skill="$1"
  [[ -n "$skill" ]] && cc_state_append_value requestedSkills "$skill"
}

mark_plan_execution_requested() {
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --arg now "$now" \
    ".planExecutionRequested = true | .planExecutionRequestedAt = \$now" >/dev/null || true
}

record_execute_skill() {
  record_skill "etrnl-dev-execute"
  mark_plan_execution_requested
}

record_active_plan_path() {
  local plan_path=""
  local now
  if [[ "$prompt" =~ (/[^[:space:]]+\.md) ]]; then
    plan_path="${BASH_REMATCH[1]}"
  elif [[ "$prompt" =~ ([A-Za-z0-9_./-]*(\.claude/plans|\.planning)/[A-Za-z0-9_.-]+\.md) ]]; then
    plan_path="${BASH_REMATCH[1]}"
  fi
  [[ -n "$plan_path" ]] || return 0

  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --arg plan "$plan_path" --arg now "$now" \
    ".activePlanPath = \$plan | .activePlanPathUpdatedAt = \$now" >/dev/null || true
}

record_active_plan_path
active_plan_path="$(cc_state_read | jq -r '.activePlanPath // ""' 2>/dev/null || true)"

cc_prompt_context_cap() {
  local value="${1:-}"
  if [[ "$value" =~ ^[0-9]+$ ]] && (( value > 0 )); then
    printf '%s\n' "$value"
  else
    printf '20000\n'
  fi
}

cc_prompt_record_skill_update_state_failure() {
  local state_status="$1"
  local requested_count="$2"
  local payload
  payload="$(jq -cn \
    --arg session "$(cc_session_id)" \
    --arg cwd "$cwd" \
    --arg state_status "$state_status" \
    --argjson requested_count "$requested_count" \
    '{eventKind:"settings_observation",sessionId:$session,cwd:$cwd,data:{event:"skill_update_state_read_failed",stateStatus:$state_status,requestedCount:$requested_count}}' 2>/dev/null)" || return 0
  cc_etrnl_state_append_json "$payload" || true
}

cc_prompt_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | cut -d' ' -f1 && return 0
    return 1
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | cut -d' ' -f1 && return 0
    return 1
  fi
  return 1
}

cc_prompt_collect_upward() {
  local start="$1"
  local dir candidate
  local files=()
  local dir_files=()
  if [[ -d "$start" ]]; then
    dir="$(cd -- "$start" 2>/dev/null && pwd -P)" || return 0
  else
    dir="$(cd -- "$(dirname -- "$start")" 2>/dev/null && pwd -P)" || return 0
  fi
  while [[ "$dir" != "/" ]]; do
    dir_files=()
    for candidate in "$dir/CLAUDE.md" "$dir/.claude/CLAUDE.md" "$dir/CLAUDE.local.md"; do
      [[ -f "$candidate" ]] && dir_files+=("$candidate")
    done
    if (( ${#dir_files[@]} > 0 )); then
      if (( ${#files[@]} > 0 )); then
        files=("${dir_files[@]}" "${files[@]}")
      else
        files=("${dir_files[@]}")
      fi
    fi
    dir="$(dirname -- "$dir")"
  done
  (( ${#files[@]} > 0 )) || return 0
  printf '%s\n' "${files[@]}"
}

cc_prompt_add_context_file() {
  local label="$1"
  local file="$2"
  local resolved content block remaining
  [[ -f "$file" ]] || return 0
  resolved="$(cd -- "$(dirname -- "$file")" 2>/dev/null && pwd -P)/$(basename -- "$file")" || return 0
  [[ "$cc_prompt_seen_files" != *"|$resolved|"* ]] || return 0
  cc_prompt_seen_files+="|$resolved|"
  # Mtime-aware companion used by the final injected-context fingerprint, so an
  # edited file reinjects instead of matching the stale paths-only fingerprint.
  local seen_mtime
  seen_mtime="$(stat -f %m "$resolved" 2>/dev/null || stat -c %Y "$resolved" 2>/dev/null || printf '0')"
  cc_prompt_seen_fingerprint+="|$resolved@$seen_mtime|"
  content="$(<"$resolved")"
  [[ -n "$content" ]] || return 0
  block=$'\n'"## $label: $resolved"$'\n'"$content"$'\n'
  remaining=$((cc_prompt_remaining_chars - ${#cc_prompt_context}))
  (( remaining > 0 )) || return 0
  if (( ${#block} > remaining )); then
    block="${block:0:remaining}"$'\n''[truncated]'
  fi
  cc_prompt_context+="$block"
}

cc_prompt_add_referenced_markdown() {
  local source_file="$1"
  local allowed_base="$2"
  local depth="${3:-1}"
  local source_dir allowed_root ref resolved line rest source_name source_content
  (( depth <= 5 )) || return 0
  source_dir="$(cd -- "$(dirname -- "$source_file")" 2>/dev/null && pwd -P)" || return 0
  allowed_root="$(cd -- "$allowed_base" 2>/dev/null && pwd -P)" || return 0
  source_name="$(basename -- "$source_file")"
  source_content="$(<"$source_file")" || return 0
  while IFS= read -r line; do
    rest="$line"
    while [[ "$rest" =~ @([~A-Za-z0-9._/-]+\.md) ]]; do
      ref="${BASH_REMATCH[1]}"
      rest="${rest#*"@$ref"}"
      case "$ref" in
        \~/*) ref="$HOME/${ref#\~/}" ;;
        /*) ;;
        *) ref="$source_dir/$ref" ;;
      esac
      [[ -f "$ref" ]] || continue
      resolved="$(cd -- "$(dirname -- "$ref")" 2>/dev/null && pwd -P)/$(basename -- "$ref")" || continue
      case "$resolved" in
        "$allowed_root"|"$allowed_root"/*) ;;
        *) continue ;;
      esac
      cc_prompt_add_context_file "Referenced by $source_name" "$ref"
      cc_prompt_add_referenced_markdown "$resolved" "$allowed_root" "$((depth + 1))"
    done
  done <<<"$source_content"
}

cc_prompt_claude_context() {
  local inject_mode force_always global_claude project_file fingerprint fingerprint_hash cc_prompt_context cc_prompt_seen_files cc_prompt_seen_fingerprint cc_prompt_remaining_chars raw_mode
  raw_mode="${ETRNL_INJECT_CLAUDE_MD:-once}"
  inject_mode="$(printf '%s' "$raw_mode" | tr '[:upper:]' '[:lower:]')"
  case "$inject_mode" in
    0|false|no|off) return 0 ;;
  esac

  force_always=false
  [[ "$inject_mode" == "always" ]] && force_always=true

  cc_prompt_context=""
  cc_prompt_seen_files=""
  cc_prompt_seen_fingerprint=""
  cc_prompt_remaining_chars="$(cc_prompt_context_cap "${ETRNL_CLAUDE_MD_MAX_CHARS:-}")"
  global_claude="$HOME/.claude/CLAUDE.md"

  # Fast path: fingerprint the root file set (paths + mtimes) before reading
  # anything. The full build below forks ~180 subshells per prompt (recursive
  # @-reference expansion) only to be discarded when this session already
  # injected the same context. Mtimes in the fingerprint make an edited root
  # reinject, which also covers newly added @-references (adding one edits the
  # parent file).
  local roots_list roots_fp root_file root_mtime
  if [[ "$force_always" != "true" ]]; then
    roots_list=""
    while IFS= read -r root_file; do
      [[ -n "$root_file" && -f "$root_file" ]] || continue
      root_mtime="$(stat -f %m "$root_file" 2>/dev/null || stat -c %Y "$root_file" 2>/dev/null || printf '0')"
      roots_list+="$root_file:$root_mtime|"
    done < <(
      printf '%s\n' "$global_claude"
      cc_prompt_collect_upward "$cwd"
    )
    if [[ -n "$roots_list" ]] && roots_fp="$(printf '%s' "$roots_list" | cc_prompt_sha256)"; then
      roots_fp="claude-md-roots:$roots_fp"
      if cc_state_has_warning_fingerprint "$roots_fp"; then
        return 0
      fi
      cc_state_record_warning_fingerprint "$roots_fp" || true
    fi
  fi

  cc_prompt_context+="CLAUDE.md reinjection: treat the following as active instructions for this prompt. This mirrors Claude's startup hierarchy where possible. Disable with ETRNL_INJECT_CLAUDE_MD=0."
  cc_prompt_add_context_file "Global CLAUDE.md" "$global_claude"
  [[ ! -f "$global_claude" ]] || cc_prompt_add_referenced_markdown "$global_claude" "$HOME/.claude"
  while IFS= read -r project_file; do
    [[ -n "$project_file" ]] || continue
    cc_prompt_add_context_file "Project $(basename -- "$project_file")" "$project_file"
    cc_prompt_add_referenced_markdown "$project_file" "$(dirname -- "$project_file")"
  done < <(cc_prompt_collect_upward "$cwd")

  [[ -n "$cc_prompt_seen_files" ]] || return 0
  if fingerprint_hash="$(printf '%s' "$cc_prompt_seen_fingerprint" | cc_prompt_sha256)"; then
    fingerprint="claude-md-context-injected:$fingerprint_hash"
  else
    fingerprint="claude-md-context-paths:$cc_prompt_seen_fingerprint"
  fi
  if [[ "$force_always" != "true" ]] \
    && cc_state_has_warning_fingerprint "$fingerprint"; then
    return 0
  fi
  if [[ "$force_always" != "true" ]]; then
    cc_state_record_warning_fingerprint "$fingerprint" || true
  fi
  printf '%s\n' "$cc_prompt_context"
}

if [[ "$prompt" =~ (use|load|call)[[:space:]]+([A-Za-z0-9:_-]+)[[:space:]]+skill ]]; then
  record_skill "${BASH_REMATCH[2]}"
fi
if [[ "$prompt" =~ Skill\(([A-Za-z0-9:_/-]+)\) ]]; then
  record_skill "${BASH_REMATCH[1]}"
fi
# Group 2 is the requested skill name for etrnl-* slash commands.
slash_skill_re="(^|[[:space:]])/(etrnl-[A-Za-z0-9_-]+)([[:space:]]|$)"
if [[ "$prompt" =~ $slash_skill_re ]]; then
  slash_skill="${BASH_REMATCH[2]}"
  record_skill "$slash_skill"
  case "$slash_skill" in
    etrnl-dev-execute) mark_plan_execution_requested ;;
  esac
fi

notes=()
# CLAUDE.md reinjection is advisory context; the minimal profile skips it (the
# skill-routing state recorded above still runs — other hooks depend on it).
# It is kept out of `notes` because it carries its own char cap
# (ETRNL_CLAUDE_MD_MAX_CHARS) and its own once-per-session fingerprint, including
# the ETRNL_INJECT_CLAUDE_MD=always escape that note-level dedup would defeat.
claude_context=""
if ! declare -F etrnl_profile_skip_advisory >/dev/null 2>&1 || ! etrnl_profile_skip_advisory; then
  claude_context="$(cc_prompt_claude_context)"
fi

cc_prompt_skill_update_note() {
  [[ "${ETRNL_SKILL_UPDATE_CHECK:-1}" != "0" ]] || return 0
  command -v node >/dev/null 2>&1 || return 0

  local state requested_count state_status update_script update_output update_status max_chars
  state_status=0
  state="$(cc_state_read 2>/dev/null)" || state_status=$?
  if [[ "$state_status" != "0" || -z "$state" ]]; then
    requested_count=0
    cc_state_persist_warning "skill update state read failed status=${state_status} requested_count=${requested_count}" || true
    cc_prompt_record_skill_update_state_failure "$state_status" "$requested_count"
    printf 'claude-guard warning: skill update state read failed; requested_count=%s\n' "$requested_count" >&2
  else
    requested_count="$(jq -r '(.requestedSkills // []) | length' <<<"$state" 2>/dev/null || printf '0')"
  fi
  [[ "$requested_count" =~ ^[0-9]+$ ]] || requested_count=0
  (( requested_count > 0 )) || return 0

  update_script="${ETRNL_UPDATE_CHECK_SCRIPT:-$SCRIPT_DIR/../scripts/update-check.mjs}"
  [[ -f "$update_script" ]] || return 0
  [[ -r "$update_script" ]] || return 0

  # update-check.mjs hashes every tracked stack file and spawns git (plus a
  # possible network fetch when its remote cache expires); requestedSkills is
  # never cleared, so without a gate this runs on EVERY prompt after the first
  # skill match (~1.2-5s each). Stamp-gate it: skip when the last completed
  # check is fresher than the interval.
  local update_stamp update_interval now_epoch stamp_epoch
  update_interval="${ETRNL_SKILL_UPDATE_INTERVAL_SEC:-1800}"
  [[ "$update_interval" =~ ^[0-9]+$ ]] || update_interval=1800
  update_stamp="${ETRNL_SKILL_UPDATE_STAMP:-${TMPDIR:-/tmp}/etrnl-skill-update-check.stamp}"
  if (( update_interval > 0 )) && [[ -f "$update_stamp" ]]; then
    now_epoch="$(date +%s)"
    stamp_epoch="$(stat -f %m "$update_stamp" 2>/dev/null || stat -c %Y "$update_stamp" 2>/dev/null || printf '0')"
    [[ "$stamp_epoch" =~ ^[0-9]+$ ]] || stamp_epoch=0
    if (( now_epoch - stamp_epoch < update_interval )); then
      return 0
    fi
  fi

  update_status=0
  local update_timeout update_check_cmd
  update_timeout="${ETRNL_SKILL_UPDATE_TIMEOUT_SEC:-5}"
  if [[ ! "$update_timeout" =~ ^[0-9]+$ ]] || (( update_timeout <= 0 )); then
    update_timeout=5
  fi
  update_check_cmd=(node "$update_script")
  if [[ "${ETRNL_AUTO_UPDATE:-1}" != "0" ]]; then
    update_check_cmd+=(--auto)
  fi
  # Stamp before running (any outcome): a repeatedly failing or slow check must
  # not retry on every prompt; it retries after the interval.
  touch "$update_stamp" 2>/dev/null || true
  if command -v timeout >/dev/null 2>&1; then
    update_output="$(timeout "${update_timeout}s" "${update_check_cmd[@]}" 2>/dev/null)" || update_status=$?
  else
    local update_output_file update_pid update_elapsed
    update_output_file="$(mktemp "${TMPDIR:-/tmp}/cc-skill-update.XXXXXX")"
    cc_register_cleanup "$update_output_file"
    update_status=124
    "${update_check_cmd[@]}" >"$update_output_file" 2>/dev/null &
    update_pid=$!
    update_elapsed=0
    while kill -0 "$update_pid" >/dev/null 2>&1; do
      if (( update_elapsed >= update_timeout )); then
        kill "$update_pid" >/dev/null 2>&1 || true
        wait "$update_pid" >/dev/null 2>&1 || true
        break
      fi
      sleep 1
      update_elapsed=$((update_elapsed + 1))
    done
    if ! kill -0 "$update_pid" >/dev/null 2>&1; then
      update_status=0
      wait "$update_pid" >/dev/null 2>&1 || update_status=$?
    fi
    update_output="$(cat "$update_output_file")"
  fi
  [[ "$update_status" == "0" ]] || return 0
  [[ "$update_output" =~ (ETRNL_UPDATE_AVAILABLE|ETRNL_REMOTE_UPDATE_AVAILABLE|TOOL_STACK_UPDATE_AVAILABLE|TOOL_STACK_MISSING) ]] || return 0

  max_chars="$(cc_prompt_context_cap "${ETRNL_SKILL_UPDATE_MAX_CHARS:-1200}")"
  update_output="${update_output:0:max_chars}"
  notes+=("Skill update check before requested skill: $update_output"$'\n'"This is an informational update status only — do NOT stop or ask the user about updates; continue the requested work. Local Eternal Stack updates auto-apply on their own when enabled and safe; any remote/tool-stack items above are for a later manual run, not something to act on mid-task.")
}

documentation_health_pattern='documentation[[:space:]-]+health|docs[[:space:]-]+health|documentation[[:space:]-]+audit|docs[[:space:]-]+audit|documentation[[:space:]-]+drift|docs[[:space:]-]+drift|stale[[:space:]]+docs|readme[[:space:]-]+audit|adr[[:space:]-]+health|runbook[[:space:]-]+audit|api[[:space:]-]+docs[[:space:]-]+audit|tsdoc|jsdoc|code[[:space:]-]+documentation[[:space:]-]+health|onboarding[[:space:]-]+docs|documentation[[:space:]-]+pass'
code_health_pattern='code[[:space:]]+health|repo[[:space:]]+rot|audit[[:space:]]+.*(whole|entire)[[:space:]]+codebase|no[[:space:]]+skips|dead[[:space:]]+code|pr-gate|architecture[[:space:]]+health'
ci_cd_pattern='ci/cd|ci-cd|ci[[:space:]-]+pipeline|pr[[:space:]-]+ci|ci[[:space:]-]+.*pr|pipeline[[:space:]-]+(failed|failure|broken|failing)|workflow[[:space:]-]+run[[:space:]-]+(failed|failure|broken|failing)|continuous[[:space:]]+integration|continuous[[:space:]]+delivery|github[[:space:]]+actions?|gitlab[[:space:]]+ci|jenkins|branch[[:space:]-]+protection|deployment[[:space:]-]+automation|release[[:space:]-]+gate|deploy[[:space:]-]+gate|oidc|sbom|cosign|docker[[:space:]-]+image[[:space:]-]+build|canary[[:space:]-]+deploy|blue[[:space:]-]+green|rollback[[:space:]-]+pipeline|flaky[[:space:]-]+ci|slow[[:space:]-]+build'
code_excellence_pattern='code[[:space:]-]+excellence|code[[:space:]-]+review[[:space:]-]+excellence|engineering[[:space:]-]+excellence|code[[:space:]-]+quality[[:space:]-]+audit|maintainability[[:space:]-]+audit|architecture[[:space:]-]+quality|type[[:space:]-]+safety[[:space:]-]+audit|error[[:space:]-]+handling[[:space:]-]+audit|brooks[[:space:]-]+(audit|health|lint)|circular[[:space:]]+import|module[[:space:]]+dependenc|layering[[:space:]]+integrit|clean[[:space:]]+architecture|structural[[:space:]]+decay|codebase[[:space:]]+tour|explain[[:space:]].*codebase[[:space:]]+to[[:space:]]+a[[:space:]]+new[[:space:]]+developer'
ui_ux_pattern='ui[[:space:]/-]*ux|ux[[:space:]-]+(audit|review|pass)|ui[[:space:]-]+(audit|review|qa|polish|improvements?)|(audit|review|critique|polish|improve)[[:space:]-]+(the|my|our|this)?[[:space:]-]*(ui|ux|interface|screens?)([^a-z]|$)|product[[:space:]-]+audit|design[[:space:]-]+audit|accessibility[[:space:]-]+audit|responsive[[:space:]-]+audit|interaction[[:space:]-]+quality|visual[[:space:]-]+qa'
reuse_pattern='shared[[:space:]-]+reuse|reuse[[:space:]-]+audit|duplication[[:space:]-]+audit|duplicate[[:space:]-]+logic|component[[:space:]-]+reuse|helper[[:space:]-]+reuse|abstraction[[:space:]-]+audit'
repo_hygiene_pattern='repo[[:space:]-]+hygiene|repository[[:space:]-]+hygiene|repo[[:space:]-]+health|file[[:space:]-]+organization|dead[[:space:]-]+files|generated[[:space:]-]+artifact|gitignore|readme[[:space:]-]+health'
tooling_ecosystem_pattern='tooling[[:space:]-]+ecosystem|developer[[:space:]-]+experience[[:space:]-]+audit|devex[[:space:]-]+audit|toolchain[[:space:]-]+audit|scripts?[[:space:]-]+audit|formatter[[:space:]-]+lint|local[[:space:]-]+setup|onboarding[[:space:]-]+tooling'
case "$prompt_lower" in
  *"why"*|*"are you sure"*|*"that's not"*|*"thats not"*|*"not what"*|*"wrong"*|*"still"*|*"wasn't"*|*"wasnt"*|*"i thought"*|*"you said"*|*"she said"*|*"loose ends"*|*"wdym"*)
    cc_state_append_value evidenceChallenges "$prompt"
    notes+=("The user is challenging a prior answer. Do not agree first. If evidence is missing, say \"I have not verified that yet\" and run or name the concrete check.")
    ;;
esac

# Precedence guard: an explicit "which skill/agent should I use" meta-question is a
# routing request, not a request to run the named task. Without this, a prompt like
# "which skill should I use to ship this feature?" matches both the ship branch and
# the router branch and records two skills. When set, task-selection branches
# short-circuit and only etrnl-router is recorded.
explicit_skill_selection=0
if [[ "$prompt_lower" =~ which[[:space:]]+(etrnl[[:space:]-]?)?(skill|agent)[[:space:]]+should[[:space:]]+i[[:space:]]+use|what[[:space:]]+(etrnl[[:space:]-]?)?(skill|agent)[[:space:]]+should[[:space:]]+i[[:space:]]+use|pick[[:space:]]+the[[:space:]]+right[[:space:]]+(skill|agent)|help[[:space:]]+me[[:space:]]+(pick|choose)[[:space:]]+.*(skill|agent) ]]; then
  explicit_skill_selection=1
fi
if [[ "$prompt_lower" =~ brainstorm|scope[[:space:]]+this|think[[:space:]]+through|design[[:space:]]+this ]]; then
  record_skill "etrnl-dev-brainstorm"
  notes+=("Use etrnl-dev-brainstorm first: clarify, produce a design/spec file, get approval, then move to planning.")
fi
if [[ "$prompt_lower" =~ auto[[:space:]-]?plan|autoplan|run[[:space:]]+all[[:space:]]+reviews|review[[:space:]]+.*plan[[:space:]]+automatically ]]; then
  record_skill "etrnl-dev-autoplan"
  notes+=("Use etrnl-dev-autoplan: run the automated plan review gauntlet and write decisions back to the plan artifact.")
fi
if [[ "$prompt_lower" =~ /email-triage|email[[:space:]-]+triage ]]; then
  record_skill "email-triage"
  email_triage_account=""
  if [[ "$prompt_lower" =~ /email-triage[[:space:]]+([a-z0-9_-]+) ]]; then
    email_triage_account="${BASH_REMATCH[1]}"
  elif [[ "$prompt_lower" =~ email[[:space:]-]+triage[[:space:]]+(for[[:space:]]+)?([a-z0-9_-]+) ]]; then
    email_triage_account="${BASH_REMATCH[2]}"
  fi
  if [[ -n "$email_triage_account" ]]; then
    notes+=("Use /email-triage as two phases. Phase 1: Inbox Zero first. Run: vivaz-email triage guarded-run --account $email_triage_account --max-inbox 500 --apply --require-insights, then verify with vivaz-email triage verify --latest --account $email_triage_account. Do not open the queue unless verify reports inbox_zero_verified true and inbox_count 0. Phase 2: only after Inbox Zero, paste one generated queue item with vivaz-email triage queue --run-id <run-id> --mode reply --format markdown --next. Do not say triage complete while an item is active.")
  else
    notes+=("Use /email-triage as two phases. If no account id is present, ask for it. Phase 1: Inbox Zero first with vivaz-email triage guarded-run --account <id> --max-inbox 500 --apply --require-insights, then vivaz-email triage verify --latest --account <id>. Do not open the queue unless verify reports inbox_zero_verified true and inbox_count 0. Phase 2: only after Inbox Zero, paste one generated queue item with vivaz-email triage queue --run-id <run-id> --mode reply --format markdown --next. Do not say triage complete while an item is active.")
  fi
fi
if [[ "$prompt_lower" =~ disk[[:space:]-]+cleanup|clean[[:space:]]+up[[:space:]]+disk|free[[:space:]]+(disk|ssd|storage)[[:space:]]+space|reclaim[[:space:]]+(disk|ssd|storage)[[:space:]]+space ]]; then
  record_skill "etrnl-ops-disk-cleanup"
  notes+=("Use etrnl-ops-disk-cleanup: inspect disk usage first, write a dry-run deletion manifest with exact paths and byte counts, then use trash only for approved cache/build/log paths. Do not use rm -r/rm -rf for cleanup.")
fi
if [[ "$prompt_lower" =~ email[[:space:]-]+reply[[:space:]-]+quality|brazilian[[:space:]]+portuguese[[:space:]]+email|bad[[:space:]]+portuguese[[:space:]]+.*repl|em[[:space:]-]+dash.*email|humanize[[:space:]]+email[[:space:]]+reply|draft[[:space:]-]+checker|ai[[:space:]-]+tell.*email|vivaz[[:space:]]+email[[:space:]]+reply ]]; then
  record_skill "etrnl-comm-email-reply-quality"
  notes+=("Use etrnl-comm-email-reply-quality: run vivaz-email drafts check, rewrite failed drafts with natural Brazilian Portuguese and humanizer cleanup, then rerun the checker before approval.")
fi
if [[ "$prompt_lower" =~ agent[[:space:]-]?files|instruction[[:space:]]+files|startup[[:space:]]+guidance|align[[:space:]]+.*agents\.md|align[[:space:]]+.*claude\.md|prune[[:space:]]+(agents|claude|rules)|rule[[:space:]-]?bloat|agents\.md[[:space:]]+(too[[:space:]]+long|too[[:space:]]+big|bloated)|claude\.md[[:space:]]+(too[[:space:]]+long|too[[:space:]]+big|bloated)|startup[[:space:]]+(file|context)[[:space:]]+(too[[:space:]]+long|bloated)|trim[[:space:]]+(agents|claude)\.md ]]; then
  record_skill "etrnl-ops-agent-files"
  notes+=("Use etrnl-ops-agent-files: keep AGENTS.md, CLAUDE.md, rules, and agent instructions aligned without bloating startup context.")
fi
if [[ "$prompt_lower" =~ write[[:space:]]+a[[:space:]]+plan|implementation[[:space:]]+plan|planning|turn.*into[[:space:]]+tasks ]]; then
  record_skill "etrnl-dev-plan"
  notes+=("Use etrnl-dev-plan: write the plan to disk, review it, improve it, mark it Final, and keep chat short.")
fi
if [[ "$prompt_lower" =~ execute[[:space:]]+.*plan|implement[[:space:]]+.*plan|carry[[:space:]]+out[[:space:]]+.*plan ]]; then
  record_execute_skill
  notes+=("Use etrnl-dev-execute only for user-requested plan execution; preserve checkpoints and verification evidence.")
fi
if [[ -n "$active_plan_path" ]] && [[ "$prompt_lower" =~ (^|[[:space:]])(implement now|do it|execute now|continue the plan|continue plan|finish the plan|finish it|carry on)([[:space:]]|$) ]]; then
  record_execute_skill
  notes+=("Use etrnl-dev-execute for the active plan: $active_plan_path. Complete every in-scope phase or stop with a blocker.")
fi
if [[ "$prompt_lower" =~ $code_health_pattern ]]; then
  record_skill "etrnl-audit-code"
  notes+=("Use etrnl-audit-code: inventory every tracked file, load the repo Health Stack, create a findings ledger, and close every finding as fixed, false-positive, accepted-risk, or blocked.")
fi
if [[ "$prompt_lower" =~ $ci_cd_pattern ]]; then
  record_skill "etrnl-dev-ci"
  notes+=("Use etrnl-dev-ci: map lanes, preserve required check names through an aggregate job, harden workflow permissions/secrets, and verify with local syntax plus a real CI run or source-limited blocker.")
fi
if [[ "$prompt_lower" =~ $documentation_health_pattern ]]; then
  record_skill "etrnl-audit-docs"
  notes+=("Use etrnl-audit-docs: inventory docs first, verify claims against source/runtime truth, fan out read-only documentation lanes when broad, and close every finding with evidence.")
fi
if [[ "$prompt_lower" =~ $code_excellence_pattern ]]; then
  record_skill "etrnl-code-review-excellence"
  notes+=("Use etrnl-code-review-excellence: load references/routing.md, pick minimum modules (audit-checks, brooks-architecture, brooks-onboarding), state loaded modules, then review with source-backed findings.")
fi
if [[ "$prompt_lower" =~ $ui_ux_pattern ]]; then
  record_skill "etrnl-deep-audit-ux"
  notes+=("Use etrnl-deep-audit-ux: run the ui-ux-product deep-audit category with shared worklists, browser evidence for runtime UI claims, and artifact validation. Do not fold UI/UX into etrnl-deep-audit all_registered.")
fi
if [[ "$prompt_lower" =~ $reuse_pattern ]]; then
  record_skill "etrnl-deep-audit"
  notes+=("Use etrnl-deep-audit --category shared-reuse: load references/categories/shared-reuse.md after shared worklists exist.")
fi
if [[ "$prompt_lower" =~ $repo_hygiene_pattern ]]; then
  record_skill "etrnl-deep-audit"
  notes+=("Use etrnl-deep-audit --category repo-hygiene: load references/categories/repo-hygiene.md after shared worklists exist.")
fi
if [[ "$prompt_lower" =~ $tooling_ecosystem_pattern ]]; then
  record_skill "etrnl-audit-tooling"
  notes+=("Use etrnl-audit-tooling: inspect scripts, local setup, linters, formatters, test commands, CI parity, update paths, and developer experience gates.")
fi
if [[ "$prompt_lower" =~ deep[[:space:]-]+audit|full[[:space:]]+registered[[:space:]]+audit|full[[:space:]]+registered[[:space:]]+deep[[:space:]]+audit|all_registered ]]; then
  record_skill "etrnl-deep-audit"
  notes+=("Use etrnl-deep-audit: create shared worklists, run registered deep-audit categories, require lane receipts where applicable, and validate the final artifact.")
fi
if [[ "$prompt_lower" =~ security[[:space:]-]+audit|exploitable[[:space:]-]+bug|injection[[:space:]-]+review|authz[[:space:]-]+review|secret[[:space:]-]+handling|csrf|origin[[:space:]-]+review ]]; then
  record_skill "etrnl-audit-security"
  notes+=("Use etrnl-audit-security: prove source, sink, missing control, exploit, reachability, confidence, and explicit non-findings.")
fi
if [[ "$prompt_lower" =~ production[[:space:]-]+readiness|auth[[:space:]]+edge[[:space:]]+cases|webhook[[:space:]-]+reliability|webhook[[:space:]-]+safety|webhook.*tenan|tenan.*migration|error[[:space:]]+boundar ]]; then
  record_skill "etrnl-audit-production"
  notes+=("Use etrnl-audit-production: audit validation, auth, webhooks, tenancy, migrations, env access, route states, and error boundaries using shared deep-audit worklists.")
fi
if [[ "$prompt_lower" =~ performance[[:space:]-]+audit|speed[[:space:]-]+audit|latency[[:space:]-]+audit|route[[:space:]]+latency|bundle[[:space:]]+size|react[[:space:]]+rendering|infrastructure[[:space:]]+speed|cold[[:space:]]+and[[:space:]]+warm[[:space:]]+performance ]]; then
  record_skill "etrnl-audit-performance"
  notes+=("Use etrnl-audit-performance: fan out database, API, bundle, React rendering, background work, and infrastructure lanes after shared worklists exist.")
fi
if [[ "$prompt_lower" =~ browser[[:space:]]+qa|browser[[:space:]]+test|route.*viewport|screenshot|console.*network|ui[[:space:]]+verification ]]; then
  record_skill "etrnl-audit-browser"
  notes+=("Use etrnl-audit-browser for route, viewport, console, network, accessibility, and screenshot evidence.")
fi
if [[ "$prompt_lower" =~ save[[:space:]]+context|context[[:space:]]+save|handover[[:space:]]+prompt|fresh[[:space:]]+session ]]; then
  record_skill "etrnl-ops-context-save"
  notes+=("Use etrnl-ops-context-save: write concise resumable state without transcripts, credentials, or private memories.")
fi
if [[ "$prompt_lower" =~ restore[[:space:]]+context|context[[:space:]]+restore|resume[[:space:]]+saved|pick[[:space:]]+up[[:space:]]+from[[:space:]]+context ]]; then
  record_skill "etrnl-ops-context-restore"
  notes+=("Use etrnl-ops-context-restore: load saved workflow state and flag stale continuation risk.")
fi
if [[ "$prompt_lower" =~ dependency|dependencies|dependabot|renovate|security[[:space:]-]+dependency[[:space:]-]+alert|dependency[[:space:]-]+alert|upgrade[[:space:]]+package|update[[:space:]]+package|dep[[:space:]]+audit ]]; then
  record_skill "etrnl-dev-deps"
  notes+=("Use etrnl-dev-deps for targeted dependency maintenance with migration and audit checks.")
fi
if [[ "$prompt_lower" =~ commit[[:space:]]+(the|all|these|verified|changes)|stage[[:space:]]+.*commit ]]; then
  record_skill "etrnl-dev-commit"
  notes+=("Use etrnl-dev-commit only after reviewing the diff and running relevant verification.")
fi
if [[ "$prompt_lower" =~ pull[[:space:]]+request|prepare[[:space:]]+pr|create[[:space:]]+pr|update[[:space:]]+pr|pr[[:space:]-]+ci|ci[[:space:]-]+.*pr|copilot[[:space:]-]+review[[:space:]-]+comments.*pr|review[[:space:]-]+comments.*pr ]]; then
  record_skill "etrnl-dev-pr"
  notes+=("Use etrnl-dev-pr: run pr-preflight template + validate-body, then dual-audience PR (TL;DR, why, add/change/remove, impact, rollout, verification).")
fi
if [[ "$prompt_lower" =~ systematic[[:space:]-]+debugging|root[[:space:]-]+cause|fix[[:space:]]+issue|issue[[:space:]]+#[0-9]+|bug[[:space:]]+#[0-9]+|debug[[:space:]]+.*(bug|failure|failing|error|issue)|investigate[[:space:]]+.*(bug|failure|failing|error|issue)|reproduce[[:space:]]+.*fix ]]; then
  record_skill "etrnl-dev-debug"
  notes+=("Use etrnl-dev-debug: prove the symptom, trace root cause before fixes, patch the smallest source surface, and verify the original failure.")
fi
if [[ "$prompt_lower" =~ parallel|fan[[:space:]-]?out|split[[:space:]]+.*agents|multiple[[:space:]]+agents ]]; then
  notes+=("For bounded parallel fanout during plan execution, use etrnl-dev-execute references/parallel-fanout.md. Generate each Task packet with node \${CLAUDE_HOME:-\$HOME/.claude}/scripts/agent-task-packet-check.mjs --template read-only or --template write; do not handwrite partial packets.")
fi
if [[ "$prompt_lower" =~ subagent|agent[[:space:]]+packet|task[[:space:]]+packet|delegate[[:space:]]+to[[:space:]]+agent ]]; then
  notes+=("Before any Agent/Task call, generate a complete packet with node \${CLAUDE_HOME:-\$HOME/.claude}/scripts/agent-task-packet-check.mjs --template read-only or --template write, then pass the JSON-only packet to the agent call.")
fi
if [[ "$prompt_lower" =~ stress[[:space:]-]?test|red[[:space:]-]?team|failure[[:space:]]+modes|adversarial[[:space:]]+stress ]]; then
  record_skill "etrnl-dev-stress-test"
  notes+=("Use etrnl-dev-stress-test for adversarial rollout, migration, automation, and safety assumptions.")
fi
if [[ "$prompt_lower" =~ run[[:space:]]+tests|test[[:space:]]+the[[:space:]]+repo|preflight|fix[[:space:]]+tests|test[[:space:]]+failures ]]; then
  record_skill "etrnl-dev-test"
  notes+=("Use etrnl-dev-test for project preflight and focused failure remediation.")
fi
if (( explicit_skill_selection == 0 )) && [[ "$prompt_lower" =~ deprecat|sunset[[:space:]]+.*(feature|api|endpoint|module|code)|retire[[:space:]]+.*(feature|api|endpoint|module)|remove[[:space:]]+.*(dead|legacy|unused|old)[[:space:]]+(code|module|feature)|delete[[:space:]]+.*(dead|legacy|unused)[[:space:]]+code|migrate[[:space:]]+.*callers[[:space:]]+.*(remov|delet) ]]; then
  record_skill "etrnl-dev-deprecate"
  notes+=("Use etrnl-dev-deprecate: audit every caller first, remove dead code rather than wrap it, ship the migration path before removal, set a removal deadline and owner, and never delete a tenant/Money/auth/validation/a11y/data-loss guard or its tests.")
fi
if (( explicit_skill_selection == 0 )) && [[ "$prompt_lower" =~ staged[[:space:]-]+rollout|ship[[:space:]]+.*(to[[:space:]]+users|to[[:space:]]+production|feature|change)|launch[[:space:]]+.*(to[[:space:]]+production|to[[:space:]]+users)|cut[[:space:]-]?over[[:space:]]+.*(release|traffic|users)|go[[:space:]/-]?no[[:space:]/-]?go|rollback[[:space:]]+readiness|promote[[:space:]]+.*(traffic|by[[:space:]]+signal) ]]; then
  record_skill "etrnl-ops-ship"
  notes+=("Use etrnl-ops-ship: stage the rollout with a promotion signal per stage, arm and rehearse a named rollback with a trigger threshold, instrument logs/metrics/alerts/traces BEFORE ship, and record a named go/no-go with etrnl-audit-production green.")
fi
if [[ "$prompt_lower" =~ which[[:space:]]+(etrnl[[:space:]-]?)?(skill|agent)|what[[:space:]]+(etrnl[[:space:]-]?)?skill[[:space:]]+should|route[[:space:]]+(this|my)[[:space:]]+(request|task|prompt)|which[[:space:]]+(skill|agent)[[:space:]]+should[[:space:]]+i[[:space:]]+use|pick[[:space:]]+the[[:space:]]+right[[:space:]]+(skill|agent)|help[[:space:]]+me[[:space:]]+(pick|choose)[[:space:]]+.*(skill|agent) ]]; then
  record_skill "etrnl-router"
  notes+=("Use etrnl-router: walk the decision tree over dev/audit/ops families and reviewer/worker agents, then invoke the single best-fit skill or agent under the always-on operating-behaviors preamble.")
fi
# Backend patterns orchestrator: route design/build prompts to one skill; it loads
# only the references/ modules the task needs (orpc, api, data, prisma, sql-optimization,
# security, resilience, observability, architecture). Do not route backend audits here.
if [[ "$prompt_lower" =~ orpc|@orpc|typesafe[[:space:]]+api|rpc[[:space:]]+procedure|event[[:space:]]+iterator|rest[[:space:]]+api|graphql|api[[:space:]-]+(contract|endpoint|versioning|design)|endpoint[[:space:]-]+(design|contract)|idempotency[[:space:]-]?key|cursor[[:space:]-]+pagination|error[[:space:]-]+envelope|http[[:space:]]+middleware[[:space:]-]+order|relational[[:space:]]+(schema|model)|database[[:space:]]+schema|schema[[:space:]]+modeling|n\+1|cache[[:space:]-]?aside|repository[[:space:]]+(pattern|layer|abstraction)|composite[[:space:]]+index|covering[[:space:]]+index|(^|[^a-z0-9])prisma([^a-z0-9]|$)|schema\.prisma|prisma[[:space:]]+migrate|slow[[:space:]]+quer|explain[[:space:]]+(analyze|plan)|sql[[:space:]]+optim|missing[[:space:]]+index|pg_stat|query[[:space:]]+plan|authentication|authorization|rbac|abac|input[[:space:]]+validation|owasp|circuit[[:space:]]+breaker|exponential[[:space:]]+backoff|retr(y|ies)[[:space:]]+with[[:space:]]+backoff|backoff[[:space:]]+and[[:space:]]+jitter|bulkhead|dead[[:space:]-]?letter[[:space:]-]?queue|structured[[:space:]]+logging|distributed[[:space:]]+tracing|red[[:space:]]+metrics|error[[:space:]]+budget|sli[[:space:]]+and[[:space:]]+slo|slo[[:space:]]+target|service[[:space:]]+layer|microservice[[:space:]-]+boundar|event[[:space:]-]?driven|outbox[[:space:]]+pattern|(^|[[:space:]])saga([[:space:]]|$)|cqrs|event[[:space:]]+sourcing|bounded[[:space:]]+context ]]; then
  record_skill "etrnl-backend-patterns"
  notes+=("Use etrnl-backend-patterns: load references/routing.md, pick the minimum reference modules for the task, state loaded modules, then design. Do not preload all nine modules unless the user asks for a full backend pass.")
fi
# Frontend patterns orchestrator: route UI design/build prompts to one skill; it owns
# the DESIGN.md convention and the generation-skill disambiguation table
# (frontend-design vs impeccable vs design-taste-frontend). Do not route UX audits here.
if [[ "$prompt_lower" =~ design[[:space:]]+system|design[[:space:]]+tokens?|ui[[:space:]]+component|component[[:space:]]+librar|frontend[[:space:]]+(design|ui|pattern)|landing[[:space:]]+page|hero[[:space:]]+section|visual[[:space:]]+(hierarchy|polish|design)|micro[[:space:]-]?interaction|motion[[:space:]]+design|typography|type[[:space:]]+scale|spacing[[:space:]]+scale|design\.md|tailwind|responsive[[:space:]]+(layout|breakpoint|design)|css[[:space:]]+(animation|transition)|dark[[:space:]]+mode|skeleton[[:space:]]+(loader|state)|empty[[:space:]]+state ]]; then
  record_skill "etrnl-frontend-patterns"
  notes+=("Use etrnl-frontend-patterns: check for a repo DESIGN.md (authoritative when present), load the minimum reference modules for the task, and pick at most one generation skill via the disambiguation table.")
fi
if [[ "$prompt_lower" =~ plan[[:space:]]+review|review[[:space:]]+.*plan|code[[:space:]]+review[[:space:]]+.*plan ]]; then
  record_skill "etrnl-dev-autoplan"
  notes+=("Use etrnl-dev-autoplan references/review-contract.md for findings-first plan review and gap mapping.")
fi
if [[ "$prompt" =~ (current|latest|docs|API|library|package) ]]; then
  notes+=("Use context7 or official/current docs before relying on memory.")
fi
if [[ "$prompt_lower" =~ (^|[^a-z0-9_])(recommend[[:space:]].*(buy|purchase|choose|for)|which[[:space:]].*should[[:space:]]+i|what[[:space:]].*should[[:space:]]+i[[:space:]]+buy|shopping|buying|purchase|iphone|airpods|apple[[:space:]]+watch|travel|restaurant|look[[:space:]]+up[[:space:]].*(price|review|news)|compare[[:space:]].*(price|model|plan))([^a-z0-9_]|$) ]]; then
  notes+=("For advice/search answers, use current source evidence when facts can drift. Completion evidence is dated URLs/sources, not repo lint/test preflight.")
fi
if [[ "$prompt" =~ (implement|fix|edit|code|repo|project) ]]; then
  notes+=("Read before edit and search for existing references/helpers before creating new code.")
fi
if [[ "$prompt" =~ (Gmail|Drive|Sheets|Calendar|GWS|Google) ]]; then
  notes+=("Confirm account identity before any Google Workspace write.")
fi

# The update note spawns node when its stamp is stale; skip in minimal profile.
if ! declare -F etrnl_profile_skip_advisory >/dev/null 2>&1 || ! etrnl_profile_skip_advisory; then
  cc_prompt_skill_update_note
fi

# Standing protocol text is appended last so a tight session budget is spent on
# task-specific routing hints before generic boilerplate.
notes+=("Evidence-first correction protocol: do not use reflexive agreement phrases like \"You're right\". State what is verified or unverified, then name the evidence check or correction.")

cc_prompt_note_fingerprint() {
  local text="$1" hash
  if hash="$(printf '%s' "$text" | cc_prompt_sha256)"; then
    printf 'userprompt-note:%s\n' "$hash"
  else
    printf 'userprompt-note-raw:%s\n' "${text:0:200}"
  fi
}

# Deliberately not cc_prompt_context_cap: that helper folds 0 into its default because a
# zero-length CLAUDE.md cap is meaningless, but 0 here is a valid operator setting that
# means "inject no advisory notes at all". Only an unset or malformed value falls back.
cc_prompt_note_budget() {
  local raw="${ETRNL_USERPROMPT_CONTEXT_MAX_CHARS:-}"
  if [[ "$raw" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$raw"
  else
    printf '8000\n'
  fi
}

cc_prompt_session_injected_chars() {
  local value
  value="$(cc_state_read 2>/dev/null | jq -r '.userPromptInjectedChars // 0' 2>/dev/null || printf '0')"
  [[ "$value" =~ ^[0-9]+$ ]] || value=0
  printf '%s\n' "$value"
}

# Hint dedup plus a per-session character budget. Re-sent context, not
# generation, is the measured token cost driver, so an identical hint is injected
# once per session and the running total is capped by
# ETRNL_USERPROMPT_CONTEXT_MAX_CHARS. Routing decisions are recorded in
# requestedSkills before this filter runs, so a hint suppressed here has still
# routed its skill.
cc_prompt_emit_notes() {
  local budget used remaining note fingerprint block emitted fingerprints_json now
  local turn_seen="" msg="" fingerprint_lines=""
  budget="$(cc_prompt_note_budget)"
  used="$(cc_prompt_session_injected_chars)"
  remaining=$(( budget - used ))
  emitted=0
  for note in "${notes[@]}"; do
    [[ -n "$note" ]] || continue
    (( remaining > 0 )) || break
    fingerprint="$(cc_prompt_note_fingerprint "$note")"
    [[ "$turn_seen" != *"|$fingerprint|"* ]] || continue
    turn_seen+="|$fingerprint|"
    if [[ "${ETRNL_USERPROMPT_DEDUP:-1}" != "0" ]] \
      && cc_state_has_warning_fingerprint "$fingerprint"; then
      continue
    fi
    block="$note"
    (( ${#block} <= remaining )) || block="${block:0:remaining}"
    msg+="$block"$'\n'
    remaining=$(( remaining - ${#block} ))
    emitted=$(( emitted + ${#block} ))
    fingerprint_lines+="$fingerprint"$'\n'
  done
  (( emitted > 0 )) || return 0
  fingerprints_json="$(printf '%s' "$fingerprint_lines" | jq -R -s 'split("\n") | map(select(. != ""))' 2>/dev/null || printf '[]')"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_update --skip-edit-generation-bump \
    --argjson fingerprints "$fingerprints_json" --arg now "$now" --argjson added "$emitted" \
    '.warningFingerprints = ((.warningFingerprints // {}) + (reduce $fingerprints[] as $fp ({}; .[$fp] = $now)))
     | .userPromptInjectedChars = ((.userPromptInjectedChars // 0) + $added)' >/dev/null || true
  printf '%s' "$msg"
}

notes_context=""
if (( ${#notes[@]} > 0 )); then
  notes_context="$(cc_prompt_emit_notes)"
fi
# Emptiness is tracked with explicit flags rather than a whitespace-stripping
# parameter substitution: bash 3.2 evaluates `${var//[[:space:]]/}` in quadratic
# time, and the reinjected CLAUDE.md block is large enough to stall the hook.
if [[ -n "$claude_context" || -n "$notes_context" ]]; then
  msg="$claude_context"
  if [[ -n "$notes_context" ]]; then
    [[ -z "$msg" ]] || msg+=$'\n'
    msg+="$notes_context"
  fi
  cc_json_emit_context "UserPromptSubmit" "$msg"
fi

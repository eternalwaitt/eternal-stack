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

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
cc_state_init

prompt="$(cc_json_get '.prompt // .user_prompt // .message')"
cwd="$(cc_json_get '.cwd')"
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
  record_skill "etrnl-execute"
  mark_plan_execution_requested
}

record_active_plan_path() {
  local plan_path=""
  local now
  if [[ "$prompt" =~ (/[^[:space:]]+\.md) ]]; then
    plan_path="${BASH_REMATCH[1]}"
  elif [[ "$prompt" =~ ([A-Za-z0-9_./-]*(docs/plans|plans|\.claude/plans)/[A-Za-z0-9_.-]+\.md) ]]; then
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
  case "${CLAUDE_CONTROL_PLANE_INJECT_CLAUDE_MD:-1}" in
    0|false|FALSE|no|NO|off|OFF) return 0 ;;
  esac

  local inject_mode force_always global_claude project_file project_context fingerprint cc_prompt_context cc_prompt_seen_files cc_prompt_remaining_chars
  inject_mode="$(printf '%s' "${CLAUDE_CONTROL_PLANE_INJECT_CLAUDE_MD:-once}" | tr '[:upper:]' '[:lower:]')"
  force_always=false
  [[ "$inject_mode" == "always" ]] && force_always=true
  project_context="$(cd -- "$cwd" 2>/dev/null && pwd -P || printf '%s' "$cwd")"
  fingerprint="claude-md-context-injected:$project_context"
  if [[ "$force_always" != "true" ]] \
    && cc_state_has_warning_fingerprint "$fingerprint"; then
    return 0
  fi

  cc_prompt_context=""
  cc_prompt_seen_files=""
  cc_prompt_remaining_chars="$(cc_prompt_context_cap "${CLAUDE_CONTROL_PLANE_CLAUDE_MD_MAX_CHARS:-}")"
  global_claude="$HOME/.claude/CLAUDE.md"

  cc_prompt_context+="CLAUDE.md reinjection: treat the following as active instructions for this prompt. This mirrors Claude's startup hierarchy where possible. Disable with CLAUDE_CONTROL_PLANE_INJECT_CLAUDE_MD=0."
  cc_prompt_add_context_file "Global CLAUDE.md" "$global_claude"
  [[ ! -f "$global_claude" ]] || cc_prompt_add_referenced_markdown "$global_claude" "$HOME/.claude"
  while IFS= read -r project_file; do
    [[ -n "$project_file" ]] || continue
    cc_prompt_add_context_file "Project $(basename -- "$project_file")" "$project_file"
    cc_prompt_add_referenced_markdown "$project_file" "$(dirname -- "$project_file")"
  done < <(cc_prompt_collect_upward "$cwd")

  [[ -n "$cc_prompt_seen_files" ]] || return 0
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
legacy_aliases="writing-plans|execute-plan|run-plan|code-review|commit|deps|test|pr|fix-issue|parallel-fan-out|devils-advocate|agent-file-doctor|audit-pipeline"
# Group 2 is the requested skill name for etrnl-* slash commands and legacy aliases.
slash_skill_re="(^|[[:space:]])/(etrnl-[A-Za-z0-9_-]+|${legacy_aliases})([[:space:]]|$)"
if [[ "$prompt" =~ $slash_skill_re ]]; then
  slash_skill="${BASH_REMATCH[2]}"
  record_skill "$slash_skill"
  case "$slash_skill" in
    etrnl-execute|execute-plan|run-plan) mark_plan_execution_requested ;;
  esac
fi

notes=()
claude_context="$(cc_prompt_claude_context)"
[[ -z "$claude_context" ]] || notes+=("$claude_context")
notes+=("Evidence-first correction protocol: do not use reflexive agreement phrases like \"You're right\". State what is verified or unverified, then name the evidence check or correction.")
documentation_health_pattern='documentation[[:space:]-]+health|docs[[:space:]-]+health|documentation[[:space:]-]+audit|docs[[:space:]-]+audit|documentation[[:space:]-]+drift|docs[[:space:]-]+drift|stale[[:space:]]+docs|readme[[:space:]-]+audit|adr[[:space:]-]+health|runbook[[:space:]-]+audit|api[[:space:]-]+docs[[:space:]-]+audit|tsdoc|jsdoc|code[[:space:]-]+documentation[[:space:]-]+health|onboarding[[:space:]-]+docs|documentation[[:space:]-]+pass'
code_health_pattern='code[[:space:]]+health|health[[:space:]]+check|repo[[:space:]]+rot|audit[[:space:]]+.*(whole|entire)[[:space:]]+codebase|no[[:space:]]+skips|dead[[:space:]]+code|pr-gate'
case "$prompt_lower" in
  *"why"*|*"are you sure"*|*"that's not"*|*"thats not"*|*"not what"*|*"wrong"*|*"still"*|*"wasn't"*|*"wasnt"*|*"i thought"*|*"you said"*|*"she said"*|*"loose ends"*|*"wdym"*)
    cc_state_append_value evidenceChallenges "$prompt"
    notes+=("The user is challenging a prior answer. Do not agree first. If evidence is missing, say \"I have not verified that yet\" and run or name the concrete check.")
    ;;
esac
if [[ "$prompt_lower" =~ brainstorm|scope[[:space:]]+this|think[[:space:]]+through|design[[:space:]]+this ]]; then
  record_skill "etrnl-brainstorm"
  notes+=("Use etrnl-brainstorm first: clarify, produce a design/spec file, get approval, then move to planning.")
fi
if [[ "$prompt_lower" =~ auto[[:space:]-]?plan|autoplan|run[[:space:]]+all[[:space:]]+reviews|review[[:space:]]+.*plan[[:space:]]+automatically ]]; then
  record_skill "etrnl-autoplan"
  notes+=("Use etrnl-autoplan: run the automated plan review gauntlet and write decisions back to the plan artifact.")
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
  record_skill "etrnl-disk-cleanup"
  notes+=("Use etrnl-disk-cleanup: inspect disk usage first, write a dry-run deletion manifest with exact paths and byte counts, then use trash only for approved cache/build/log paths. Do not use rm -r/rm -rf for cleanup.")
fi
if [[ "$prompt_lower" =~ email[[:space:]-]+reply[[:space:]-]+quality|brazilian[[:space:]]+portuguese[[:space:]]+email|bad[[:space:]]+portuguese[[:space:]]+.*repl|em[[:space:]-]+dash.*email|humanize[[:space:]]+email[[:space:]]+reply|draft[[:space:]-]+checker|ai[[:space:]-]+tell.*email|vivaz[[:space:]]+email[[:space:]]+reply ]]; then
  record_skill "etrnl-email-reply-quality"
  notes+=("Use etrnl-email-reply-quality: run vivaz-email drafts check, rewrite failed drafts with natural Brazilian Portuguese and humanizer cleanup, then rerun the checker before approval.")
fi
if [[ "$prompt_lower" =~ agent[[:space:]-]?files|instruction[[:space:]]+files|startup[[:space:]]+guidance|align[[:space:]]+.*agents\.md|align[[:space:]]+.*claude\.md ]]; then
  record_skill "etrnl-agent-files"
  notes+=("Use etrnl-agent-files: keep AGENTS.md, CLAUDE.md, rules, and agent instructions aligned without bloating startup context.")
fi
if [[ "$prompt_lower" =~ write[[:space:]]+a[[:space:]]+plan|implementation[[:space:]]+plan|planning|turn.*into[[:space:]]+tasks ]]; then
  record_skill "etrnl-plan"
  notes+=("Use etrnl-plan: write the plan to disk, review it, improve it, mark it Final, and keep chat short.")
fi
if [[ "$prompt_lower" =~ execute[[:space:]]+.*plan|implement[[:space:]]+.*plan|carry[[:space:]]+out[[:space:]]+.*plan ]]; then
  record_execute_skill
  notes+=("Use etrnl-execute only for user-requested plan execution; preserve checkpoints and verification evidence.")
fi
if [[ -n "$active_plan_path" ]] && [[ "$prompt_lower" =~ (^|[[:space:]])(implement now|do it|execute now|continue the plan|continue plan|finish the plan|finish it|carry on)([[:space:]]|$) ]]; then
  record_execute_skill
  notes+=("Use etrnl-execute for the active plan: $active_plan_path. Complete every in-scope phase or stop with a blocker.")
fi
if [[ "$prompt_lower" =~ $code_health_pattern ]]; then
  record_skill "etrnl-code-health"
  notes+=("Use etrnl-code-health: inventory every tracked file, load the repo Health Stack, create a findings ledger, and close every finding as fixed, false-positive, accepted-risk, or blocked.")
fi
if [[ "$prompt_lower" =~ $documentation_health_pattern ]]; then
  record_skill "etrnl-documentation-health"
  notes+=("Use etrnl-documentation-health: inventory docs first, verify claims against source/runtime truth, fan out read-only documentation lanes when broad, and close every finding with evidence.")
fi
if [[ "$prompt_lower" =~ browser[[:space:]]+qa|browser[[:space:]]+test|route.*viewport|screenshot|console.*network|ui[[:space:]]+verification ]]; then
  record_skill "etrnl-qa-browser"
  notes+=("Use etrnl-qa-browser for route, viewport, console, network, accessibility, and screenshot evidence.")
fi
if [[ "$prompt_lower" =~ save[[:space:]]+context|context[[:space:]]+save|handover[[:space:]]+prompt|fresh[[:space:]]+session ]]; then
  record_skill "etrnl-context-save"
  notes+=("Use etrnl-context-save: write concise resumable state without transcripts, credentials, or private memories.")
fi
if [[ "$prompt_lower" =~ restore[[:space:]]+context|context[[:space:]]+restore|resume[[:space:]]+saved|pick[[:space:]]+up[[:space:]]+from[[:space:]]+context ]]; then
  record_skill "etrnl-context-restore"
  notes+=("Use etrnl-context-restore: load saved workflow state and flag stale continuation risk.")
fi
if [[ "$prompt_lower" =~ dependency|dependencies|upgrade[[:space:]]+package|update[[:space:]]+package|dep[[:space:]]+audit ]]; then
  record_skill "etrnl-deps"
  notes+=("Use etrnl-deps for targeted dependency maintenance with migration and audit checks.")
fi
if [[ "$prompt_lower" =~ commit[[:space:]]+(the|all|these|verified|changes)|stage[[:space:]]+.*commit ]]; then
  record_skill "etrnl-commit"
  notes+=("Use etrnl-commit only after reviewing the diff and running relevant verification.")
fi
if [[ "$prompt_lower" =~ pull[[:space:]]+request|prepare[[:space:]]+pr|create[[:space:]]+pr|update[[:space:]]+pr ]]; then
  record_skill "etrnl-pr"
  notes+=("Use etrnl-pr for PR preparation with verification evidence and risk summary.")
fi
if [[ "$prompt_lower" =~ fix[[:space:]]+issue|issue[[:space:]]+#[0-9]+|bug[[:space:]]+#[0-9]+|reproduce[[:space:]]+.*fix ]]; then
  record_skill "etrnl-fix-issue"
  notes+=("Use etrnl-fix-issue: reproduce or prove the issue, patch the smallest surface, and verify the original symptom.")
fi
if [[ "$prompt_lower" =~ parallel|fan[[:space:]-]?out|split[[:space:]]+.*agents|multiple[[:space:]]+agents ]]; then
  record_skill "etrnl-parallel"
  notes+=("Use etrnl-parallel only for explicit bounded fanout with disjoint ownership and final integration checks. Generate each Task packet first with node \${CLAUDE_HOME:-\$HOME/.claude}/scripts/agent-task-packet-check.mjs --template read-only or --template write; do not handwrite partial packets.")
fi
if [[ "$prompt_lower" =~ subagent|agent[[:space:]]+packet|task[[:space:]]+packet|delegate[[:space:]]+to[[:space:]]+agent ]]; then
  notes+=("Before any Agent/Task call, generate a complete packet with node \${CLAUDE_HOME:-\$HOME/.claude}/scripts/agent-task-packet-check.mjs --template read-only or --template write, then pass the JSON-only packet to the agent call.")
fi
if [[ "$prompt_lower" =~ stress[[:space:]-]?test|red[[:space:]-]?team|failure[[:space:]]+modes|adversarial[[:space:]]+stress ]]; then
  record_skill "etrnl-stress-test"
  notes+=("Use etrnl-stress-test for adversarial rollout, migration, automation, and safety assumptions.")
fi
if [[ "$prompt_lower" =~ run[[:space:]]+tests|test[[:space:]]+the[[:space:]]+repo|preflight|fix[[:space:]]+tests|test[[:space:]]+failures ]]; then
  record_skill "etrnl-test"
  notes+=("Use etrnl-test for project preflight and focused failure remediation.")
fi
if [[ "$prompt_lower" =~ audit|code[[:space:]]+review|pr[[:space:]]+review|design[[:space:]]+review|plan[[:space:]]+review|final[[:space:]]+review|review[[:space:]]+pass|loose[[:space:]]+ends|final[[:space:]]+pass|compare[[:space:]]+changes ]]; then
  record_skill "etrnl-review"
  notes+=("Use etrnl-review for findings-first review, gap mapping, and evidence against the original request.")
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

if (( ${#notes[@]} > 0 )); then
  msg="$(printf '%s\n' "${notes[@]}")"
  max_msg="$(cc_prompt_context_cap "${CLAUDE_CONTROL_PLANE_USERPROMPT_CONTEXT_MAX_CHARS:-}")"
  msg="${msg:0:max_msg}"
  cc_json_emit_context "UserPromptSubmit" "$msg"
fi

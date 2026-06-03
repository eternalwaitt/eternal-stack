#!/usr/bin/env bash

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  printf 'error: %s is a library and must be sourced\n' "${BASH_SOURCE[0]}" >&2
  exit 1
fi

cc_command_normalize() {
  local cmd="$1"
  cmd="$(cc_command_trim "$cmd")"
  printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]'
}

cc_command_trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s\n' "$value"
}

cc_command_primary_segment() {
  local cmd segment
  cmd="$(cc_command_trim "$1")"
  segment="${cmd%%|*}"
  segment="${segment%%;*}"
  segment="${segment%%&&*}"
  segment="${segment%%||*}"
  # cc_command_primary_segment trims && first; this strips a later background '&'
  # for simple background commands without breaking the earlier && split.
  segment="${segment%%&*}"
  cc_command_trim "$segment"
}

cc_command_wrapper_consumes_next_arg() {
  local wrapper="$1"
  local token="$2"
  case "$wrapper" in
    sudo)
      case "$token" in
        -u|-g|-h|-C|-T|-p|-r|-t|--user|--group|--host|--chdir|--prompt|--role|--type) return 0 ;;
      esac
      ;;
    timeout)
      case "$token" in
        -k|--kill-after|-s|--signal) return 0 ;;
      esac
      ;;
    nice)
      case "$token" in
        -n|--adjustment) return 0 ;;
      esac
      ;;
    env)
      case "$token" in
        -u|--unset|-S|--split-string|-C|--chdir) return 0 ;;
      esac
      ;;
    time)
      case "$token" in
        -f|--format|-o|--output) return 0 ;;
      esac
      ;;
  esac
  return 1
}

cc_command_primary_token() {
  local segment token wrapper timeout_duration_pending i
  local -a tokens
  segment="$(cc_command_primary_segment "$1")"
  if [[ -z "${segment//[[:space:]]/}" ]]; then
    return 1
  fi
  read -r -a tokens <<<"$segment"
  wrapper=""
  timeout_duration_pending=0
  i=0
  while (( i < ${#tokens[@]} )); do
    token="${tokens[i]}"
    if [[ -n "$wrapper" ]] && cc_command_wrapper_consumes_next_arg "$wrapper" "$token"; then
      i=$((i + 2))
      continue
    fi
    if [[ "$timeout_duration_pending" == "1" && "$token" != -* ]]; then
      timeout_duration_pending=0
      i=$((i + 1))
      continue
    fi
    case "$token" in
      "") i=$((i + 1)); continue ;;
      env|command|builtin|time|nohup|sudo|timeout|nice)
        wrapper="$token"
        if [[ "$wrapper" == "timeout" ]]; then
          timeout_duration_pending=1
        fi
        i=$((i + 1))
        continue
        ;;
      [A-Za-z_][A-Za-z0-9_]*=*) i=$((i + 1)); continue ;;
      -*) i=$((i + 1)); continue ;;
      *) printf '%s\n' "$token"; return 0 ;;
    esac
  done
  return 1
}

cc_command_secondary_token() {
  # Intentionally returns the literal second token from the primary segment.
  # This is used for patterns like `rtk <legacy-command>` without wrapper rewrites.
  local segment
  local -a tokens
  segment="$(cc_command_primary_segment "$1")"
  read -r -a tokens <<<"$segment"
  if (( ${#tokens[@]} >= 2 )); then
    printf '%s\n' "${tokens[1]}"
    return 0
  fi
  return 1
}

cc_command_has_output_limiter() {
  local cmd
  cmd="$(cc_command_normalize "$1")"
  if [[ "$cmd" =~ \|[[:space:]]*(head|tail)([[:space:]]|$) ]]; then
    return 0
  fi
  # Extract sed args after a pipe with `[^|;&[:cntrl:]]*`, which excludes control
  # characters (including newlines), so multiline payload matches are disallowed.
  if [[ "$cmd" =~ \|[[:space:]]*sed[[:space:]]+([^|;&[:cntrl:]]*) ]]; then
    local sed_args
    sed_args="${BASH_REMATCH[1]}"
    [[ "$sed_args" =~ (^|[[:space:]])(--(quiet|silent)|-[[:alnum:]]*n)([[:space:]]|$) ]]
    return $?
  fi
  return 1
}

cc_command_output_limiter_is_diagnostic() {
  local cmd
  cmd="$(cc_command_normalize "$1")"
  # Allow bounded tails/heads for long diagnostic streams, while keeping search
  # output untrimmed so evidence and hook classifiers can see full matches.
  if [[ ! "$cmd" =~ \|[[:space:]]*(head|tail)[[:space:]]+(-n[[:space:]]*)?-?[0-9]{1,4}([[:space:]]|$) ]]; then
    return 1
  fi
  if [[ "$cmd" =~ (^|[[:space:];&|])(rg|fd|sg|git[[:space:]]+grep|rtk[[:space:]]+grep)([[:space:];&|]|$) ]]; then
    return 1
  fi
  if cc_command_is_quality_verification "$cmd"; then
    return 0
  fi
  [[ "$cmd" =~ (^|[[:space:];&|])(pnpm|npm|yarn|bun|gh|vercel|veloz|pm2|journalctl|playwright|playwright-cli)([[:space:];&|]|$) ]] \
    || [[ "$cmd" =~ (^|[[:space:];&|])(docker|kubectl)[[:space:]]+logs([[:space:];&|]|$) ]] \
    || [[ "$cmd" =~ (build|lint|log|logs|test|typecheck) ]]
}

cc_command_is_primary_legacy_search() {
  local token next
  if ! token="$(cc_command_primary_token "$1")"; then
    return 1
  fi
  if [[ "$token" == "rtk" ]]; then
    if ! next="$(cc_command_secondary_token "$1")"; then
      return 1
    fi
    case "$next" in
      grep|find|locate|ls|cat|head|tail|sed|awk|du) return 0 ;;
    esac
    return 1
  fi
  case "$token" in
    grep|find|locate|ls|cat|head|tail|sed|awk|du) return 0 ;;
  esac
  return 1
}

cc_command_is_verification() {
  cc_command_is_quality_verification "$1"
}

cc_command_is_quality_verification() {
  local cmd
  cmd="$(cc_command_normalize "$1")"
  [[ "$cmd" =~ (^|[[:space:];&|])(tsc|eslint|oxlint|biome|prettier|typecheck|lint|test|build|pytest|ruff|mypy|pyright|cargo[[:space:]]+(test|clippy|build|check)|go[[:space:]]+(test|vet)|composer[[:space:]]+test)([[:space:];&|]|$) ]] \
    || [[ "$cmd" =~ (^|[[:space:];&|])(rtk[[:space:]]+)?(pnpm|npm|yarn|bun)([[:space:]]+[^[:space:];&|]+)*[[:space:]]+(run[[:space:]]+)?(typecheck|check-types|lint|test|build|check)([[:space:];&|]|$) ]]
}

cc_command_is_test_verification() {
  local cmd
  cmd="$(cc_command_normalize "$1")"
  [[ "$cmd" =~ (^|[[:space:];&|])(test|pytest|vitest|jest|mocha|ava|tap|cargo[[:space:]]+test|go[[:space:]]+test|composer[[:space:]]+test)([[:space:];&|]|$) ]] \
    || [[ "$cmd" =~ (pnpm|npm|yarn|bun)[[:space:]]+(run[[:space:]]+)?test([[:space:];&|]|$) ]]
}

cc_command_is_browser_verification() {
  local cmd
  cmd="$(cc_command_normalize "$1")"
  [[ "$cmd" =~ (^|[[:space:];&|])(playwright|playwright-cli|cypress|browser)([[:space:];&|]|$) ]] \
    || [[ "$cmd" =~ (^|[[:space:];&|])curl[[:space:]]+ ]]
}

cc_command_is_review_verification() {
  local cmd
  cmd="$(cc_command_normalize "$1")"
  [[ "$cmd" =~ (etrnl-review|code[[:space:]-]?review|review-log|coderabbit|adversarial|redline|second[[:space:]-]?pass) ]]
}

cc_command_is_unbounded_json_dump() {
  local cmd redirect_re
  cmd="$(cc_command_normalize "$1")"
  redirect_re='[0-9]*(>>|>)[[:space:]]*[^[:space:];&|]+'
  [[ "$cmd" =~ (^|[[:space:]])--json([=[:space:];&|>]|$) ]] || return 1
  [[ "$cmd" =~ $redirect_re ]] && return 1
  if [[ "$cmd" =~ (^|[[:space:];&|])node([[:space:]]+[^[:space:];&|]+)*[[:space:]]+([^[:space:];&|]+/)?code-health-inventory\.mjs([[:space:];&|]|$) ]]; then
    [[ "$cmd" =~ (^|[[:space:]])--quiet([[:space:];&|]|$) ]] && return 1
    return 0
  fi
  if [[ "$cmd" =~ (^|[[:space:];&|])node([[:space:]]+[^[:space:];&|]+)*[[:space:]]+([^[:space:];&|]+/)?workflow-health\.mjs([[:space:];&|]|$) ]]; then
    [[ "$cmd" =~ (^|[[:space:]])(status|doctor)([[:space:];&|]|$) ]] && return 1
    return 0
  fi
  return 1
}

cc_command_is_dev_server_start() {
  local cmd token
  cmd="$(cc_command_normalize "$1")"
  if ! token="$(cc_command_primary_token "$cmd")"; then
    token=""
  fi
  [[ "$cmd" =~ (^|[[:space:];&|])(pnpm|npm|yarn|bun)[[:space:]]+(run[[:space:]]+)?(dev(:[a-z0-9_.-]+)?|start|preview|serve)([[:space:];&|]|$) ]] \
    || [[ "$token" =~ ^(node|deno)$ && "$cmd" =~ (^|[[:space:];&|])(dev|start|serve)([[:space:];&|]|$) ]] \
    || [[ "$cmd" =~ (next[[:space:]]+dev|vite([[:space:]]|$)|astro[[:space:]]+dev|nuxt([[:space:]]|$)|rails[[:space:]]+s|python[[:space:]]+-m[[:space:]]+http\.server) ]]
}

cc_command_is_risky_completion_operation() {
  local cmd
  cmd="$(cc_command_normalize "$1")"
  [[ "$cmd" =~ (^|[[:space:];&|])(git[[:space:]]+(commit|push)|vercel[[:space:]]+deploy|veloz[[:space:]]+deploy|gh[[:space:]]+pr|release|publish)([[:space:];&|]|$) ]] \
    || [[ "$cmd" =~ prisma[[:space:]]+db[[:space:]]+push ]]
}

cc_command_is_migration_evidence_command() {
  local cmd
  cmd="$(cc_command_normalize "$1")"
  [[ "$cmd" =~ prisma[[:space:]]+migrate[[:space:]]+(status|deploy|resolve) ]] \
    || [[ "$cmd" =~ migrate[[:space:]]+status ]]
}

cc_command_is_prod_schema_mutation() {
  local cmd env_hint local_hint_re
  cmd="$(cc_command_normalize "$1")"
  env_hint="$(cc_command_normalize "${2:-}")"
  # Treat dev/test as local hints only when they are separated host-like labels.
  local_hint_re='(localhost(:[0-9]{1,5})?|127\.0\.0\.1(:[0-9]{1,5})?|[./:_-](dev|test|local|staging|qa)(:[0-9]{1,5}|[./:_-]|$))'
  if [[ ! "$cmd" =~ prisma[[:space:]]+db[[:space:]]+push ]]; then
    return 1
  fi
  if [[ "$cmd" =~ --(url|schema)(=|[[:space:]]+)[^[:space:]]*${local_hint_re} ]]; then
    return 1
  fi
  if [[ "$cmd" =~ (postgres(ql)?|mysql|https?)://[^[:space:]]*${local_hint_re} ]]; then
    return 1
  fi
  if [[ "$cmd" =~ (\?|&)(sslmode=disable|ssl=false|ssl=0|tls=false|insecure=true)([&#[:space:]]|$) ]]; then
    return 1
  fi
  if [[ -n "$env_hint" && "$env_hint" =~ (database_url|schema|url).*${local_hint_re} ]]; then
    return 1
  fi
  if [[ -n "$env_hint" && "$env_hint" =~ (\?|&)(sslmode=disable|ssl=false|ssl=0|tls=false|insecure=true)([&#[:space:]]|$) ]]; then
    return 1
  fi
  return 0
}

cc_command_may_disclose_secret() {
  local cmd
  cmd="$(cc_command_normalize "$1")"
  [[ "$cmd" =~ veloz[[:space:]]+db[[:space:]]+credentials ]] \
    || [[ "$cmd" =~ (^|[[:space:]])printenv([[:space:]]|$) ]] \
    || [[ "$cmd" =~ (env[[:space:]]*\|[[:space:]]*cat) ]] \
    || [[ "$cmd" =~ database_url= ]] \
    || [[ "$cmd" =~ (aws[[:space:]]+secretsmanager|op[[:space:]]+read|vault[[:space:]]+kv) ]] \
    || [[ "$cmd" =~ git[[:space:]]+credential ]] \
    || [[ "$cmd" =~ aws[[:space:]]+sts[[:space:]]+get-session-token ]] \
    || [[ "$cmd" =~ kubectl[[:space:]]+get[[:space:]]+secret([[:space:]]|$).*(-o|--output)[[:space:]]*(yaml|json) ]] \
    || [[ "$cmd" =~ docker[[:space:]]+inspect ]] \
    || [[ "$cmd" =~ (^|[[:space:]])export[[:space:]]+[A-Za-z_][A-Za-z0-9_]*= ]] \
    || [[ "$cmd" =~ base64[[:space:]]+(-d|--decode) ]]
}

cc_command_fingerprint() {
  local cmd hash
  cmd="$(cc_command_trim "$1")"
  if command -v sha256sum >/dev/null 2>&1; then
    hash="$(printf '%s' "$cmd" | sha256sum | cut -d' ' -f1)"
  elif command -v shasum >/dev/null 2>&1; then
    hash="$(printf '%s' "$cmd" | shasum -a 256 | cut -d' ' -f1)"
  elif command -v openssl >/dev/null 2>&1; then
    hash="$(printf '%s' "$cmd" | openssl dgst -sha256 -hex 2>/dev/null | sed -E 's/^.*= //')"
  else
    hash=""
  fi
  if [[ -z "$hash" || ! "$hash" =~ ^[a-f0-9]{64}$ ]]; then
    printf 'missing-hash\n'
    return 1
  fi
  printf '%s\n' "$hash"
}

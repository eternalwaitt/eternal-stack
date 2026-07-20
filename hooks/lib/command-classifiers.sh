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

# Test RUNNER detection for the weakening guard. Unlike cc_command_is_test_verification,
# this deliberately does NOT match the bare `test` token — that is the POSIX `test`/`[`
# conditional builtin (e.g. `test -f x`), not a test suite. Matching it hard-denied
# common shell idioms like `test -f x || true`, `echo test || true`, `grep test file || true`.
# Here we require a genuine test-runner token. A bare `test` counts ONLY when it is
# immediately followed by another test-runner keyword (never a `-` flag or `[`/`[[`).
cc_command_is_test_runner() {
  local cmd pm_re runner_re jsvm_re node_re toolchain_re projtest_re
  cmd="$(cc_command_normalize "$1")"
  pm_re='(^|[[:space:];&|])(rtk[[:space:]]+)?(pnpm|npm|yarn|bun)([[:space:]]+run)?[[:space:]]+test([[:space:];&|]|$)'
  runner_re='(^|[[:space:];&|])(pytest|vitest|jest|mocha|rspec|phpunit)([[:space:];&|]|$)'
  jsvm_re='(^|[[:space:];&|])(ava|tap)([[:space:];&|]|$)'
  # Node's built-in test runner: `node --test` and `node --test=<pattern>` are real
  # suites whose failure `|| true` would otherwise swallow undetected.
  node_re='(^|[[:space:];&|])node[[:space:]]+--test([=[:space:];&|]|$)'
  toolchain_re='(^|[[:space:];&|])(cargo|go|deno|composer|make|rake)[[:space:]]+test([[:space:];&|]|$)'
  projtest_re='(^|[[:space:];&|])(bash[[:space:]]+)?([^[:space:];&|]*/)?(tests/test-[^[:space:];&|]*\.sh|run-node-tests)([[:space:];&|]|$)'
  [[ "$cmd" =~ $pm_re ]] && return 0
  [[ "$cmd" =~ $runner_re ]] && return 0
  [[ "$cmd" =~ $jsvm_re ]] && return 0
  [[ "$cmd" =~ $node_re ]] && return 0
  [[ "$cmd" =~ $toolchain_re ]] && return 0
  [[ "$cmd" =~ $projtest_re ]] && return 0
  return 1
}

# Swallowed-runner detection for the weakening guard. Returns 0 when a genuine test
# RUNNER (same token set as cc_command_is_test_runner) is directly followed — after
# its own args — by `|| true`/`|| :`, so the runner's non-zero exit is discarded.
# Unlike an end-of-segment anchor, the `|| true`/`|| :` is matched even when trailing
# `&&`/further commands follow it inside a boolean list, so
# `pnpm test || true && echo done` is caught. The runner's args are `[^|&;]*` — chars
# that cannot cross into another command — so the swallow binds to the runner's OWN
# command, keeping `cleanup || true; pnpm test` (swallow on cleanup, not the runner)
# allowed. Callers scope this to a single statement segment.
cc_command_runner_failure_swallowed() {
  local seg pm_sw runner_sw jsvm_sw node_sw toolchain_sw projtest_sw
  seg="$(cc_command_normalize "$1")"
  # `[^|&;]*` after the runner keyword consumes its args without crossing a boolean
  # operator; the trailing `[|][|][[:space:]]*(true|:)` is the swallow.
  local swallow_tail='[^|&;]*[|][|][[:space:]]*(true|:)([[:space:];&|]|$)'
  pm_sw="(^|[[:space:];&|])(rtk[[:space:]]+)?(pnpm|npm|yarn|bun)([[:space:]]+run)?[[:space:]]+test[[:space:]]*${swallow_tail}"
  runner_sw="(^|[[:space:];&|])(pytest|vitest|jest|mocha|rspec|phpunit)[[:space:]]*${swallow_tail}"
  jsvm_sw="(^|[[:space:];&|])(ava|tap)[[:space:]]*${swallow_tail}"
  node_sw="(^|[[:space:];&|])node[[:space:]]+--test(=[^|&;]*)?[[:space:]]*${swallow_tail}"
  toolchain_sw="(^|[[:space:];&|])(cargo|go|deno|composer|make|rake)[[:space:]]+test[[:space:]]*${swallow_tail}"
  projtest_sw="(^|[[:space:];&|])(bash[[:space:]]+)?([^[:space:];&|]*/)?(tests/test-[^[:space:];&|]*\.sh|run-node-tests)[[:space:]]*${swallow_tail}"
  [[ "$seg" =~ $pm_sw ]] && return 0
  [[ "$seg" =~ $runner_sw ]] && return 0
  [[ "$seg" =~ $jsvm_sw ]] && return 0
  [[ "$seg" =~ $node_sw ]] && return 0
  [[ "$seg" =~ $toolchain_sw ]] && return 0
  [[ "$seg" =~ $projtest_sw ]] && return 0
  return 1
}

# Test-weakening: neutralizing a red gate rather than fixing it. Covers the four
# P3 patterns — swallowing a test failure with `|| true`/`|| :`, disabling errexit
# with `set +e` around a test run, deleting a *.test/*.spec/__tests__ file, and
# bypassing pre-commit/pre-push gates with git --no-verify.
#
# The swallow and set+e branches require a genuine test RUNNER token (see
# cc_command_is_test_runner) rather than the bare `test` conditional builtin, so
# legitimate idioms like `test -f x || true` and `grep test file || true` stay allowed.
cc_command_is_test_weakening() {
  local cmd sete_re restore_re rmtest_re noverify_re
  cmd="$(cc_command_normalize "$1")"

  # Statement-scoped weakening association. Splitting on `;` and newlines isolates
  # each statement so the swallow/set+e verdict binds to the runner's OWN statement,
  # not to any command anywhere in the string. This keeps `cleanup || true; pnpm test`
  # and `set +e; cleanup; set -e; pnpm test` allowed while still denying
  # `pnpm test || true` and `set +e; pnpm test`.
  sete_re='(^|[[:space:]])set[[:space:]]+\+e([[:space:]]|$)'
  restore_re='(^|[[:space:]])set[[:space:]]+(-e|-o[[:space:]]+errexit)([[:space:]]|$)'
  local -a segments=()
  local seg errexit_disabled=0
  # Split on statement separators (semicolons and newlines) into segments.
  local rest="$cmd"
  while [[ "$rest" == *";"* || "$rest" == *$'\n'* ]]; do
    if [[ "$rest" == *";"* && ( "$rest" != *$'\n'* || "${rest%%;*}" != *$'\n'* ) ]]; then
      segments+=("${rest%%;*}")
      rest="${rest#*;}"
    else
      segments+=("${rest%%$'\n'*}")
      rest="${rest#*$'\n'}"
    fi
  done
  segments+=("$rest")

  for seg in "${segments[@]}"; do
    # Within a statement segment, walk boolean-list sub-parts (`&&`/`||`) LEFT TO
    # RIGHT so set +e / set -e apply positionally relative to the runner. This makes
    # `set +e; set -e && pnpm test` ALLOW (errexit restored via `set -e &&` before the
    # runner) while `set +e; pnpm test && set -e` still BLOCKs (the runner executes
    # before the trailing restore). errexit_disabled carries across sub-parts and
    # segments, matching shell scope.
    local subrest="$seg" subpart
    while :; do
      # Peel the next boolean-list sub-part. Split on the first `&&` or `||`, keeping
      # the operator out of the sub-part so a bare `||` does not read as a swallow.
      if [[ "$subrest" == *"&&"* || "$subrest" == *"||"* ]]; then
        local amp="${subrest%%&&*}" pipe="${subrest%%||*}"
        if (( ${#amp} <= ${#pipe} )); then
          subpart="$amp"
          subrest="${subrest#*&&}"
        else
          subpart="$pipe"
          subrest="${subrest#*||}"
        fi
      else
        subpart="$subrest"
        subrest=""
      fi

      if [[ "$subpart" =~ $sete_re ]]; then
        errexit_disabled=1
      fi
      if [[ "$subpart" =~ $restore_re ]]; then
        errexit_disabled=0
      fi
      if cc_command_is_test_runner "$subpart"; then
        # set+e branch: errexit is still disabled when the runner executes.
        if (( errexit_disabled )); then
          return 0
        fi
      fi

      [[ -n "$subrest" ]] || break
    done

    # Swallow branch runs over the WHOLE segment: the runner is directly followed
    # (after its own args) by `|| true`/`|| :`, so its failure is swallowed. Matching
    # the full segment lets the swallow bind inside a boolean list regardless of any
    # trailing `&&`/further commands, catching `pnpm test || true && echo done`, while
    # the runner-anchored `[^|&;]*` args keep `cleanup || true; pnpm test` allowed (the
    # swallow is on cleanup's own statement, not the runner's).
    if cc_command_is_test_runner "$seg" && cc_command_runner_failure_swallowed "$seg"; then
      return 0
    fi
  done

  # Deleting a test file: match *.test/*.spec/_test suffixes, or a nested __tests__/
  # directory anywhere in an rm/trash argument.
  rmtest_re='(^|[[:space:];&|])(rm|trash)([[:space:]]+-[^[:space:]]+)*[[:space:]][^;&|]*(\.(test|spec)\.[a-z]+|_test\.[a-z]+|/__tests__/)'
  if [[ "$cmd" =~ $rmtest_re ]]; then
    return 0
  fi
  # Root-level __tests__ directory (no slash, e.g. `rm -rf __tests__`) at a
  # command-argument boundary — a separate matcher so the greedy `[^;&|]*` above
  # cannot swallow the directory name past the boundary alternation.
  rmtestroot_re='(^|[[:space:];&|])(rm|trash)([[:space:]]+-[^[:space:]]+)*[[:space:]]([^;&|]*[[:space:]/])?__tests__([[:space:]/]|$)'
  if [[ "$cmd" =~ $rmtestroot_re ]]; then
    return 0
  fi
  noverify_re='git[[:space:]][^;&|]*(commit|push)[^;&|]*--no-verify'
  if [[ "$cmd" =~ $noverify_re ]]; then
    return 0
  fi
  return 1
}

cc_command_is_review_verification() {
  local cmd
  cmd="$(cc_command_normalize "$1")"
  [[ "$cmd" =~ (etrnl-spec-reviewer|etrnl-quality-reviewer|etrnl-dev-pr|code[[:space:]-]?review|review-log|coderabbit|adversarial|redline|second[[:space:]-]?pass) ]]
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
  # Explicit secret-dumping commands.
  [[ "$cmd" =~ veloz[[:space:]]+db[[:space:]]+credentials ]] && return 0
  # Bare `printenv`/`env` (whole-env dump) — including when followed by a pipe, shell
  # separator (`;`, `&&`), or redirection (`>`, `<`) — but NOT `printenv PATH` (single
  # non-secret var), `env VAR=val cmd`, `env -i cmd`, or `env node …` (env running a
  # command: a following word/assignment/flag, not a terminator). Anchored to COMMAND
  # POSITION — line start or after a `;`/`&`/`|` separator (optional spaces) — so a
  # separator-adjacent dump (`true;printenv`, `x && env`, `x|printenv`) is caught while
  # an env/printenv that is merely an ARGUMENT or mid-command word (`which printenv`,
  # `man env`, prose mentioning printenv) is not.
  #
  # A whole-env dump discloses just as much when reached THROUGH a wrapper, so the same
  # wrapper prefix the email-send guard strips is stripped here: privilege (`sudo`/
  # `command`), detach (`nohup`/`setsid`), timing (`nice`/`timeout`, incl. a positional
  # duration like `timeout 5`), a leading `VAR=val` assignment, or a `-flag`/`-flag value`
  # — so `sudo printenv`, `command printenv`, `nohup env`, `timeout 5 printenv`, and
  # `sudo -u bob printenv` no longer bypass, while `env node app.js` / `sudo env node app.js`
  # (env as a runner — a word follows the token, not a terminator) stay allowed. `env` is
  # deliberately ABSENT from the wrapper set: it is the dump target here, not a wrapper.
  # Assigned to local vars first: an inline unquoted `[^…;&|]` negated class breaks bash's
  # `[[ =~ ]]` tokenization (same reason as the `mail_cli_re` pattern in the guard).
  local disclosure_wrapper_re='((sudo|command|nohup|setsid|nice|timeout|(nice|timeout)[[:space:]]+[^-[:space:];&|][^[:space:];&|]*|[a-z_][a-z0-9_]*=[^[:space:];&|]*|-[^[:space:];&|]*([[:space:]]+[^-[:space:];&|][^[:space:];&|]*)?)[[:space:]]+)*'
  # env/printenv followed by end-of-command or an operator ( | ; & < > ) — a dump, not a runner.
  local env_dump_suffix='([[:space:]]*$|[[:space:]]*[|;&<>])'
  local printenv_dump_re="(^|[;&|])[[:space:]]*${disclosure_wrapper_re}printenv${env_dump_suffix}"
  [[ "$cmd" =~ $printenv_dump_re ]] && return 0
  local env_dump_re="(^|[;&|])[[:space:]]*${disclosure_wrapper_re}env${env_dump_suffix}"
  [[ "$cmd" =~ $env_dump_re ]] && return 0
  # Path-qualified `env`/`printenv` in command position — `/usr/bin/env`,
  # `x;/usr/bin/printenv`, `sudo /usr/bin/env` — also dump the whole env; the same
  # wrapper prefix applies. Anchored to command position (not plain whitespace) so a
  # path ARGUMENT ending in env/printenv (`cd /home/dev/env`, `cat /etc/printenv`) is
  # not a false positive: after `cd `/`cat ` the token is preceded by a space, and
  # `[^[:space:];&|]*/` cannot span that space back to the command-position anchor.
  local env_pathq_re="(^|[;&|])[[:space:]]*${disclosure_wrapper_re}[^[:space:];&|]*/(env|printenv)${env_dump_suffix}"
  [[ "$cmd" =~ $env_pathq_re ]] && return 0
  # A targeted `printenv <SECRET_NAMED_VAR>` (AWS_SECRET_ACCESS_KEY, DATABASE_URL, …) still
  # discloses; input is lowercased upstream, so match lowercase secret-name tokens in any arg.
  # URL vars are narrowed to the credential-bearing DSN-style ones so routine
  # `printenv PUBLIC_URL` / `printenv NEXT_PUBLIC_*_URL` are not treated as secrets.
  # Command-position anchored (line start or after a `;`/`&`/`|` separator, optional
  # spaces) with an optional executable path prefix so `x;printenv SECRET` and
  # `/usr/bin/printenv AWS_SECRET_ACCESS_KEY` are caught, while a prose mention
  # followed by a secret-named word (`echo run printenv database_url`) is not — the
  # same command-position tightening as the bare `printenv` dump above.
  # The arg span excludes `;`/`&`/`|` so it cannot cross into a later command — e.g.
  # `printenv FOO; cat secret_notes.txt` must NOT classify (the secret word belongs
  # to an unrelated trailing command, and `printenv FOO` discloses nothing).
  local printenv_secret_re='(^|[;&|])[[:space:]]*([^[:space:];&|]*/)?printenv[[:space:]]+[^;&|]*(secret|password|passwd|passphrase|credential|apikey|api_key|token|access_key|_key|private|dsn|database_url|db_url|conn_url|connection_url)'
  [[ "$cmd" =~ $printenv_secret_re ]] && return 0
  # An inline `DATABASE_URL=<dsn>` assignment discloses the credential in the process
  # list. Anchored to command position (line start or after a `;`/`&`/`|` separator)
  # like the sibling env/printenv checks, so the same string inside a search argument
  # (`rg database_url= src/`, `grep database_url= file`) is not misread as a dump.
  # (`env | cat` no longer needs its own arm — the bare-`env` dump check above already
  # matches `env` in command position followed by a pipe, and an unanchored `env|cat`
  # would false-positive on `foo env | cat` where `env` is just an argument.)
  [[ "$cmd" =~ (^|[;&|])[[:space:]]*[a-z_]*database_url[a-z0-9_]*= ]] && return 0
  [[ "$cmd" =~ (aws[[:space:]]+secretsmanager|op[[:space:]]+read|vault[[:space:]]+kv) ]] && return 0
  [[ "$cmd" =~ git[[:space:]]+credential ]] && return 0
  [[ "$cmd" =~ aws[[:space:]]+sts[[:space:]]+get-session-token ]] && return 0
  # Accept whitespace OR `=` between the output flag and the format, so equals-form
  # (`-o=json`, `--output=yaml`) and shorthand (`-oyaml`) disclose like the spaced form.
  # `secrets?` matches both the singular and plural resource forms, so
  # `kubectl get secrets -o yaml` discloses the same as `kubectl get secret …`.
  [[ "$cmd" =~ kubectl[[:space:]]+get[[:space:]]+secrets?([[:space:]]|$).*(-o|--output)([[:space:]]*|=)(yaml|json) ]] && return 0
  # Export of a secret-looking variable only, not routine `export PORT=3001` / `export NODE_ENV=…`.
  # Input is lowercased upstream, so match lowercase tokens (incl. passphrase/private/dsn and
  # the DSN-style URL vars, so `export DB_URL=…`/`CONN_URL=…`/`CONNECTION_URL=…` disclose too).
  [[ "$cmd" =~ (^|[[:space:]])export[[:space:]]+[a-z_]*(key|token|secret|password|passwd|passphrase|credential|apikey|private|dsn|database_url|db_url|conn_url|connection_url)[a-z0-9_]*= ]] && return 0
  # `docker inspect` (and the documented `docker container inspect` form) dumps the full
  # config (incl. .Config.Env) by default. Gate a bare inspect, or a --format that reads
  # .Config/secret; allow a --format scoped to other fields.
  if [[ "$cmd" =~ docker[[:space:]]+(container[[:space:]]+)?inspect ]]; then
    [[ "$cmd" =~ (--format|[[:space:]]-f([[:space:]]|=)) ]] || return 0
    [[ "$cmd" =~ (\.config|secret) ]] && return 0
  fi
  # `base64 -d` only when decoding secret material, not a benign `echo … | base64 -d`.
  [[ "$cmd" =~ base64[[:space:]]+(-d|--decode) ]] && [[ "$cmd" =~ (secret|token|credential|password|id_rsa|\.pem|\.key|kubectl) ]] && return 0
  return 1
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

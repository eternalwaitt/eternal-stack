#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
MODE="${1:-install}"
shift || true
YES=0
PROJECT=""
SKIP_GLOBAL=0
SKIP_PROJECT=0
SKIP_CODEGRAPH=0
SKIP_BEADS=0
SKIP_HINDSIGHT=0
DRY_RUN=0
# Admin-tool npm specs: set ETRNL_*_NPM_SPEC only from trusted administrator-controlled input.
# Unsanitized values enable arbitrary command execution through shell interpolation.
CODEGRAPH_NPM_SPEC="${ETRNL_CODEGRAPH_NPM_SPEC:-@colbymchenry/codegraph@1.0.1}"
BEADS_NPM_SPEC="${ETRNL_BEADS_NPM_SPEC:-@beads/bd@1.0.5}"
CONFIRM_SKIPPED=64
PROFILE="${ETRNL_STACK_PROFILE:-core}"
HINDSIGHT_MODE="${ETRNL_HINDSIGHT_MODE:-local-daemon}"

usage() {
  cat <<'EOF'
Usage: bootstrap-tools.sh install|check|project [options]

Options:
  --yes, -y             Run non-interactively.
  --profile <name>      Bootstrap profile: core or full. Default: core.
  --project <path>      Initialize/check CodeGraph and Beads for one project.
  --skip-global         Do not install global tools or CodeGraph MCP config.
  --skip-project        Do not initialize project-local CodeGraph/Beads state.
  --skip-codegraph      Do not install CodeGraph or refresh CodeGraph MCP.
  --skip-beads          Do not install Beads or initialize .beads.
  --skip-hindsight      Do not install Hindsight plugin or write Hindsight config.
  --hindsight-mode <m>  Hindsight mode: local-daemon, external-api, or docker-server.
  --dry-run             Print planned bootstrap actions without mutation.

Environment:
  ETRNL_BOOTSTRAP_TOOLS=0 disables global bootstrap from install.
  ETRNL_BOOTSTRAP_PROJECTS=1 lets install initialize the source repo.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)
      YES=1
      shift
      ;;
    --project)
      PROJECT="${2:-}"
      [[ -n "$PROJECT" ]] || { printf 'bootstrap error: --project requires a path\n' >&2; exit 2; }
      shift 2
      ;;
    --profile)
      PROFILE="${2:-}"
      [[ -n "$PROFILE" ]] || { printf 'bootstrap error: --profile requires core or full\n' >&2; exit 2; }
      shift 2
      ;;
    --profile=*)
      PROFILE="${1#--profile=}"
      shift
      ;;
    --skip-global)
      SKIP_GLOBAL=1
      shift
      ;;
    --skip-codegraph)
      SKIP_CODEGRAPH=1
      shift
      ;;
    --skip-beads)
      SKIP_BEADS=1
      shift
      ;;
    --skip-hindsight)
      SKIP_HINDSIGHT=1
      shift
      ;;
    --hindsight-mode)
      HINDSIGHT_MODE="${2:-}"
      [[ -n "$HINDSIGHT_MODE" ]] || { printf 'bootstrap error: --hindsight-mode requires a value\n' >&2; exit 2; }
      shift 2
      ;;
    --hindsight-mode=*)
      HINDSIGHT_MODE="${1#--hindsight-mode=}"
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --skip-project)
      SKIP_PROJECT=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'bootstrap error: unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$PROFILE" in
  core|full) ;;
  *)
    printf 'bootstrap error: unknown profile: %s\n' "$PROFILE" >&2
    usage >&2
    exit 2
    ;;
esac

case "$HINDSIGHT_MODE" in
  local-daemon|external-api|docker-server) ;;
  *)
    printf 'bootstrap error: unknown Hindsight mode: %s\n' "$HINDSIGHT_MODE" >&2
    usage >&2
    exit 2
    ;;
esac

confirm_or_skip() {
  local prompt="$1"
  if [[ "$YES" == "1" ]]; then
    return 0
  fi
  if [[ ! -t 0 ]]; then
    printf 'bootstrap skipped: %s (rerun with --yes)\n' "$prompt"
    return 1
  fi
  local answer
  printf '%s [y/N] ' "$prompt"
  read -r answer
  [[ "$answer" == "y" || "$answer" == "Y" || "$answer" == "yes" || "$answer" == "YES" ]]
}

confirm_required() {
  local prompt="$1"
  if [[ "$DRY_RUN" == "1" ]]; then
    printf 'dry-run: would %s\n' "$prompt"
    return 0
  fi
  if confirm_or_skip "$prompt"; then
    return 0
  fi
  if [[ "$PROFILE" == "full" ]]; then
    printf 'bootstrap error: full profile requires approved action: %s\n' "$prompt" >&2
    return 1
  fi
  return "$CONFIRM_SKIPPED"
}

confirm_or_core_skip() {
  local prompt="$1" status
  status=0
  confirm_required "$prompt" || status=$?
  if [[ "$status" == "$CONFIRM_SKIPPED" ]]; then
    return "$CONFIRM_SKIPPED"
  fi
  return "$status"
}

need_command() {
  command -v "$1" >/dev/null 2>&1
}

validate_external_hindsight_url() {
  local url="${1:-}"
  if [[ ! "$url" =~ ^https?:// ]]; then
    printf 'bootstrap error: HINDSIGHT_API_URL must be an http(s) URL with a host\n' >&2
    return 1
  fi
  if [[ ! "$url" =~ ^https?://((([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*|([0-9]{1,3}\.){3}[0-9]{1,3}|\[[0-9A-Fa-f:.]+\])(:[0-9]{1,5})?)(/.*)?$ ]]; then
    printf 'bootstrap error: HINDSIGHT_API_URL host is not valid\n' >&2
    return 1
  fi
}

install_codegraph() {
  local npm_status confirm_status
  if [[ "$SKIP_CODEGRAPH" == "1" ]]; then
    printf 'skipped: CodeGraph (--skip-codegraph)\n'
    return 0
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    printf 'dry-run: would install/verify CodeGraph package %s\n' "$CODEGRAPH_NPM_SPEC"
    printf 'dry-run: would refresh CodeGraph MCP config for supported agents\n'
    return 0
  fi
  if need_command codegraph; then
    printf 'ok: codegraph available (%s)\n' "$(codegraph --version 2>/dev/null || printf unknown)"
  else
    need_command npm || { printf 'bootstrap error: npm is required to install codegraph\n' >&2; return 1; }
    confirm_status=0
    confirm_or_core_skip "install CodeGraph globally with npm" || confirm_status=$?
    [[ "$confirm_status" == "$CONFIRM_SKIPPED" ]] && return 0
    [[ "$confirm_status" == "0" ]] || return "$confirm_status"
    npm_status=0
    npm install -g "$CODEGRAPH_NPM_SPEC" || npm_status=$?
    if [[ "$npm_status" != "0" ]]; then
      printf 'bootstrap error: npm install failed for %s (exit %s)\n' "$CODEGRAPH_NPM_SPEC" "$npm_status" >&2
      return "$npm_status"
    fi
    need_command codegraph || { printf 'bootstrap error: codegraph binary not found after npm install\n' >&2; return 1; }
  fi
  if need_command codegraph; then
    confirm_status=0
    confirm_or_core_skip "install/refresh CodeGraph MCP config for supported agents" || confirm_status=$?
    [[ "$confirm_status" == "$CONFIRM_SKIPPED" ]] && return 0
    [[ "$confirm_status" == "0" ]] || return "$confirm_status"
    codegraph install --target all --location global --yes
  fi
}

install_beads() {
  local npm_status confirm_status
  if [[ "$SKIP_BEADS" == "1" ]]; then
    printf 'skipped: Beads (--skip-beads)\n'
    return 0
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    printf 'dry-run: would install/verify Beads package %s without raw setup hooks\n' "$BEADS_NPM_SPEC"
    return 0
  fi
  if need_command bd; then
    printf 'ok: bd available (%s)\n' "$(bd version 2>/dev/null || printf unknown)"
    return 0
  fi
  if need_command npm; then
    confirm_status=0
    confirm_or_core_skip "install Beads globally with npm" || confirm_status=$?
    [[ "$confirm_status" == "$CONFIRM_SKIPPED" ]] && return 0
    [[ "$confirm_status" == "0" ]] || return "$confirm_status"
    npm_status=0
    npm install -g "$BEADS_NPM_SPEC" || npm_status=$?
    if [[ "$npm_status" != "0" ]]; then
      printf 'bootstrap error: npm install failed for %s (exit %s)\n' "$BEADS_NPM_SPEC" "$npm_status" >&2
      return "$npm_status"
    fi
    need_command bd || { printf 'bootstrap error: bd binary not found after npm install\n' >&2; return 1; }
    return 0
  fi
  need_command brew || { printf 'bootstrap error: npm or Homebrew is required to install beads automatically\n' >&2; return 1; }
  confirm_status=0
  confirm_or_core_skip "install Beads globally with Homebrew fallback" || confirm_status=$?
  [[ "$confirm_status" == "$CONFIRM_SKIPPED" ]] && return 0
  [[ "$confirm_status" == "0" ]] || return "$confirm_status"
  brew install beads
  need_command bd || { printf 'bootstrap error: bd binary not found after Homebrew install\n' >&2; return 1; }
}

hindsight_plugin_cache_installed() {
  local home_dir="$1"
  local root version_dir
  for root in "$home_dir/plugins/cache/hindsight/hindsight-memory" "$home_dir/plugins/cache/hindsight-memory"; do
    [[ -d "$root" ]] || continue
    for version_dir in "$root"/*; do
      [[ -d "$version_dir" ]] || continue
      if [[ -f "$version_dir/hooks/hooks.json" || -f "$version_dir/settings.json" || -f "$version_dir/.claude-plugin/plugin.json" ]]; then
        return 0
      fi
    done
  done
  return 1
}

install_hindsight() {
  local claude_home hindsight_home config_target template plugin_list config_tmp api_url confirm_status
  if [[ "$SKIP_HINDSIGHT" == "1" ]]; then
    printf 'skipped: Hindsight (--skip-hindsight)\n'
    return 0
  fi
  if [[ "$PROFILE" != "full" ]]; then
    return 0
  fi
  claude_home="${CLAUDE_HOME:-$HOME/.claude}"
  hindsight_home="${HINDSIGHT_HOME:-$HOME/.hindsight}"
  config_target="$hindsight_home/claude-code.json"
  template="$ROOT/templates/hindsight/claude-code.local-daemon.json"
  [[ "$HINDSIGHT_MODE" != "external-api" ]] || template="$ROOT/templates/hindsight/claude-code.external.example.json"
  if [[ "$DRY_RUN" == "1" ]]; then
    printf 'dry-run: would install Hindsight Claude plugin from vectorize-io/hindsight\n'
    printf 'dry-run: would write Hindsight %s config to %s\n' "$HINDSIGHT_MODE" "$config_target"
    printf 'dry-run: would verify Hindsight canary before trusting recall\n'
    return 0
  fi
  [[ -f "$template" ]] || { printf 'bootstrap error: Hindsight template not found: %s\n' "$template" >&2; return 1; }
  need_command claude || { printf 'bootstrap error: claude CLI is required for full-profile Hindsight plugin install; use --skip-hindsight only if intentional\n' >&2; return 1; }
  if [[ "$HINDSIGHT_MODE" == "local-daemon" ]]; then
    need_command uvx || need_command hindsight-embed || {
      printf 'bootstrap error: local-daemon Hindsight mode requires uvx or hindsight-embed; use --hindsight-mode external-api or --skip-hindsight if intentional\n' >&2
      return 1
    }
  elif [[ "$HINDSIGHT_MODE" == "external-api" ]]; then
    [[ -n "${HINDSIGHT_API_URL:-}" ]] || { printf 'bootstrap error: external-api Hindsight mode requires HINDSIGHT_API_URL; token comes from HINDSIGHT_API_TOKEN and is not written to tracked files\n' >&2; return 1; }
    validate_external_hindsight_url "$HINDSIGHT_API_URL" || return 1
  elif [[ "$HINDSIGHT_MODE" == "docker-server" ]]; then
    need_command docker || { printf 'bootstrap error: docker-server Hindsight mode requires docker; use another mode or --skip-hindsight if intentional\n' >&2; return 1; }
  fi
  confirm_status=0
  confirm_required "install Hindsight plugin and write local Hindsight config" || confirm_status=$?
  [[ "$confirm_status" == "0" ]] || return "$confirm_status"
  # Treat the claude CLI as authoritative for "installed". The plugin cache is
  # only a hint and may be stale, so use it solely to skip a redundant
  # marketplace add when the CLI shows the plugin is not yet installed.
  plugin_list="$(claude plugin list --json 2>/dev/null || claude plugin list 2>/dev/null || true)"
  if jq -e 'if type == "array" then any(.[]; .name == "hindsight-memory") else false end' <<<"$plugin_list" >/dev/null 2>&1 \
    || [[ "$plugin_list" =~ (^|[[:space:]])hindsight-memory([[:space:]]|$) ]]; then
    printf 'ok: Hindsight plugin already installed\n'
  else
    if hindsight_plugin_cache_installed "$claude_home"; then
      printf 'note: Hindsight plugin cache present but CLI does not list it; installing\n'
    else
      claude plugin marketplace add vectorize-io/hindsight
    fi
    claude plugin install hindsight-memory
  fi
  mkdir -p "$hindsight_home"
  config_tmp="$(mktemp "$config_target.tmp.XXXXXX")"
  if [[ "$HINDSIGHT_MODE" == "external-api" ]]; then
    api_url="${HINDSIGHT_API_URL%/}"
    jq --arg url "$api_url" '.hindsightApiUrl = $url' "$template" >"$config_tmp"
  else
    cp -- "$template" "$config_tmp"
  fi
  install -m 600 "$config_tmp" "$config_target"
  rm -f "$config_tmp"
  mkdir -p "$claude_home/etrnl"
  jq -n --arg mode "$HINDSIGHT_MODE" --arg config "$config_target" \
    '{hindsight:{mode:$mode,config:$config,ownedBy:"eternal-stack"}}' \
    >"$claude_home/etrnl/full-stack-services.json"
}

bootstrap_project() {
  local project="$1"
  local lock acquired confirm_status lock_retries lock_sleep attempt
  [[ -n "$project" ]] || return 0
  project="$(cd -- "$project" 2>/dev/null && pwd -P)" || { printf 'bootstrap error: project path not found: %s\n' "$project" >&2; return 1; }
  if [[ "$SKIP_CODEGRAPH" != "1" && "$DRY_RUN" == "1" ]]; then
    printf 'dry-run: would initialize or sync CodeGraph index in %s\n' "$project"
  elif [[ "$SKIP_CODEGRAPH" != "1" ]] && need_command codegraph; then
    lock="$project/.codegraph-bootstrap.lock"
    acquired=0
    lock_retries="${CODEGRAPH_LOCK_RETRIES:-20}"
    lock_sleep="${CODEGRAPH_LOCK_BASE_SLEEP:-0.25}"
    [[ "$lock_retries" =~ ^[0-9]+$ ]] || lock_retries=20
    [[ "$lock_sleep" =~ ^[0-9]+([.][0-9]+)?$ ]] || lock_sleep=0.25
    for ((attempt = 1; attempt <= lock_retries; attempt += 1)); do
      if mkdir "$lock" 2>/dev/null; then
        acquired=1
        break
      fi
      sleep "$lock_sleep"
      lock_sleep="$(awk -v value="$lock_sleep" 'BEGIN { next=value*2; if (next > 2) next=2; printf "%.2f", next }')"
    done
    [[ "$acquired" == "1" ]] || { printf 'bootstrap error: timed out waiting for CodeGraph project lock: %s\n' "$lock" >&2; return 1; }
    if [[ ! -d "$project/.codegraph" ]]; then
      confirm_status=0
      confirm_or_core_skip "initialize CodeGraph index in $project" || confirm_status=$?
      if [[ "$confirm_status" == "$CONFIRM_SKIPPED" ]]; then
        rmdir "$lock" 2>/dev/null || true
        return 0
      fi
      [[ "$confirm_status" == "0" ]] || { rmdir "$lock" 2>/dev/null || true; return "$confirm_status"; }
      codegraph init "$project" || { rmdir "$lock" 2>/dev/null || true; return 1; }
    else
      # Non-fatal: an existing index may be temporarily locked or stale; status still gives operators the next repair step.
      codegraph sync "$project" || codegraph status "$project" || true
    fi
    rmdir "$lock" 2>/dev/null || true
  fi
  if [[ "$SKIP_BEADS" != "1" && "$DRY_RUN" == "1" ]]; then
    printf 'dry-run: would initialize or verify Beads database in %s without raw setup hooks\n' "$project"
  elif [[ "$SKIP_BEADS" != "1" ]] && need_command bd; then
    if [[ ! -d "$project/.beads" ]]; then
      confirm_status=0
      confirm_or_core_skip "bootstrap Beads database in $project" || confirm_status=$?
      [[ "$confirm_status" == "$CONFIRM_SKIPPED" ]] && return 0
      [[ "$confirm_status" == "0" ]] || return "$confirm_status"
      bd -C "$project" bootstrap --yes
    else
      bd -C "$project" bootstrap --yes || bd -C "$project" status || true
    fi
  fi
  if [[ "$DRY_RUN" != "1" ]]; then
    local check_output
    check_output="$(node "$ROOT/scripts/tool-stack-check.mjs" --project "$project" --json 2>&1)" || {
      printf 'bootstrap error: project tool-stack validation failed: %s\n' "$project" >&2
      printf '%s\n' "$check_output" >&2
      return 1
    }
  fi
}

tool_stack_check() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf 'dry-run: would run node %s/scripts/tool-stack-check.mjs --explain\n' "$ROOT"
    return 0
  fi
  local args=(--explain)
  if [[ -n "$PROJECT" ]]; then
    args+=(--project "$PROJECT")
  fi
  node "$ROOT/scripts/tool-stack-check.mjs" "${args[@]}"
}

case "$MODE" in
  check)
    tool_stack_check
    ;;
  install)
    if [[ "$SKIP_PROJECT" != "1" && -z "$PROJECT" && "${ETRNL_BOOTSTRAP_PROJECTS:-0}" == "1" ]]; then
      PROJECT="$ROOT"
    fi
    if [[ "${ETRNL_BOOTSTRAP_TOOLS:-1}" == "0" ]]; then
      printf 'bootstrap skipped: ETRNL_BOOTSTRAP_TOOLS=0\n'
    elif [[ "$SKIP_GLOBAL" != "1" ]]; then
      install_codegraph
      install_beads
      install_hindsight
    fi
    if [[ "$SKIP_PROJECT" != "1" && -n "$PROJECT" ]]; then
      bootstrap_project "$PROJECT"
    fi
    tool_stack_check
    ;;
  project)
    [[ -n "$PROJECT" ]] || PROJECT="$PWD"
    bootstrap_project "$PROJECT"
    tool_stack_check
    ;;
  *)
    printf 'bootstrap error: unknown mode: %s\n' "$MODE" >&2
    usage >&2
    exit 2
    ;;
esac

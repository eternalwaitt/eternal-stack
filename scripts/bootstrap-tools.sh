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
PROFILE="${CLAUDE_CONTROL_PLANE_STACK_PROFILE:-core}"
HINDSIGHT_MODE="${CLAUDE_CONTROL_PLANE_HINDSIGHT_MODE:-local-daemon}"

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
  CLAUDE_CONTROL_PLANE_BOOTSTRAP_TOOLS=0 disables global bootstrap from install.
  CLAUDE_CONTROL_PLANE_BOOTSTRAP_PROJECTS=1 lets install initialize the source repo.
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
  return 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1
}

validate_external_hindsight_url() {
  local url="${1:-}"
  case "$url" in
    http://?*|https://?*) ;;
    *)
      printf 'bootstrap error: HINDSIGHT_API_URL must be an http(s) URL with a host\n' >&2
      return 1
      ;;
  esac
  [[ "$url" != "http://" && "$url" != "https://" && "$url" != *" "* ]]
}

install_codegraph() {
  local npm_status
  if [[ "$SKIP_CODEGRAPH" == "1" ]]; then
    printf 'skipped: CodeGraph (--skip-codegraph)\n'
    return 0
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    printf 'dry-run: would install/verify CodeGraph package @colbymchenry/codegraph\n'
    printf 'dry-run: would refresh CodeGraph MCP config for supported agents\n'
    return 0
  fi
  if need_command codegraph; then
    printf 'ok: codegraph available (%s)\n' "$(codegraph --version 2>/dev/null || printf unknown)"
  else
    need_command npm || { printf 'bootstrap error: npm is required to install codegraph\n' >&2; return 1; }
    confirm_required "install CodeGraph globally with npm" || return 1
    npm_status=0
    npm install -g @colbymchenry/codegraph || npm_status=$?
    if [[ "$npm_status" != "0" ]]; then
      printf 'bootstrap error: npm install failed for @colbymchenry/codegraph (exit %s)\n' "$npm_status" >&2
      return "$npm_status"
    fi
    need_command codegraph || { printf 'bootstrap error: codegraph binary not found after npm install\n' >&2; return 1; }
  fi
  if need_command codegraph; then
    confirm_required "install/refresh CodeGraph MCP config for supported agents" || return 1
    codegraph install --target all --location global --yes
  fi
}

install_beads() {
  local npm_status
  if [[ "$SKIP_BEADS" == "1" ]]; then
    printf 'skipped: Beads (--skip-beads)\n'
    return 0
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    printf 'dry-run: would install/verify Beads package @beads/bd without raw setup hooks\n'
    return 0
  fi
  if need_command bd; then
    printf 'ok: bd available (%s)\n' "$(bd version 2>/dev/null || printf unknown)"
    return 0
  fi
  if need_command npm; then
    confirm_required "install Beads globally with npm" || return 1
    npm_status=0
    npm install -g @beads/bd || npm_status=$?
    if [[ "$npm_status" != "0" ]]; then
      printf 'bootstrap error: npm install failed for @beads/bd (exit %s)\n' "$npm_status" >&2
      return "$npm_status"
    fi
    need_command bd || { printf 'bootstrap error: bd binary not found after npm install\n' >&2; return 1; }
    return 0
  fi
  need_command brew || { printf 'bootstrap error: npm or Homebrew is required to install beads automatically\n' >&2; return 1; }
  confirm_required "install Beads globally with Homebrew fallback" || return 1
  brew install beads
}

install_hindsight() {
  local claude_home hindsight_home config_target template plugin_list config_tmp api_url
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
  plugin_list="$(claude plugin list 2>/dev/null || true)"
  if [[ "$plugin_list" != *"hindsight-memory"* ]]; then
    claude plugin marketplace add vectorize-io/hindsight
    claude plugin install hindsight-memory
  else
    printf 'ok: Hindsight plugin already installed\n'
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
  mkdir -p "$claude_home/control-plane"
  printf '{"hindsight":{"mode":"%s","config":"%s","ownedBy":"claude-control-plane"}}\n' "$HINDSIGHT_MODE" "$config_target" >"$claude_home/control-plane/full-stack-services.json"
}

bootstrap_project() {
  local project="$1"
  local lock acquired
  [[ -n "$project" ]] || return 0
  project="$(cd -- "$project" 2>/dev/null && pwd -P)" || { printf 'bootstrap error: project path not found: %s\n' "$project" >&2; return 1; }
  if [[ "$SKIP_CODEGRAPH" != "1" && "$DRY_RUN" == "1" ]]; then
    printf 'dry-run: would initialize or sync CodeGraph index in %s\n' "$project"
  elif [[ "$SKIP_CODEGRAPH" != "1" ]] && need_command codegraph; then
    lock="$project/.codegraph-bootstrap.lock"
    acquired=0
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
      if mkdir "$lock" 2>/dev/null; then
        acquired=1
        break
      fi
      sleep 0.25
    done
    [[ "$acquired" == "1" ]] || { printf 'bootstrap error: timed out waiting for CodeGraph project lock: %s\n' "$lock" >&2; return 1; }
    if [[ ! -d "$project/.codegraph" ]]; then
      confirm_required "initialize CodeGraph index in $project" || { rmdir "$lock" 2>/dev/null || true; return 1; }
      codegraph init "$project" || { rmdir "$lock" 2>/dev/null || true; return 1; }
    else
      codegraph sync "$project" || codegraph status "$project" || true
    fi
    rmdir "$lock" 2>/dev/null || true
  fi
  if [[ "$SKIP_BEADS" != "1" && "$DRY_RUN" == "1" ]]; then
    printf 'dry-run: would initialize or verify Beads database in %s without raw setup hooks\n' "$project"
  elif [[ "$SKIP_BEADS" != "1" ]] && need_command bd; then
    if [[ ! -d "$project/.beads" ]]; then
      confirm_required "bootstrap Beads database in $project" || return 1
      bd -C "$project" bootstrap --yes
    else
      bd -C "$project" bootstrap --yes || bd -C "$project" status || true
    fi
  fi
  if [[ "$DRY_RUN" != "1" ]]; then
    node "$ROOT/scripts/tool-stack-check.mjs" --project "$project" --json >/dev/null || {
      printf 'bootstrap error: project tool-stack validation failed: %s\n' "$project" >&2
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
    if [[ "$SKIP_PROJECT" != "1" && -z "$PROJECT" && "${CLAUDE_CONTROL_PLANE_BOOTSTRAP_PROJECTS:-0}" == "1" ]]; then
      PROJECT="$ROOT"
    fi
    if [[ "${CLAUDE_CONTROL_PLANE_BOOTSTRAP_TOOLS:-1}" == "0" ]]; then
      printf 'bootstrap skipped: CLAUDE_CONTROL_PLANE_BOOTSTRAP_TOOLS=0\n'
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

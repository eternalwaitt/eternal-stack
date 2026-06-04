#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
MODE="${1:-install}"
shift || true
YES=0
PROJECT=""
SKIP_GLOBAL=0
SKIP_PROJECT=0

usage() {
  cat <<'EOF'
Usage: bootstrap-tools.sh install|check|project [options]

Options:
  --yes, -y             Run non-interactively.
  --project <path>      Initialize/check CodeGraph and Beads for one project.
  --skip-global         Do not install global tools or CodeGraph MCP config.
  --skip-project        Do not initialize project-local CodeGraph/Beads state.

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
    --skip-global)
      SKIP_GLOBAL=1
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

need_command() {
  command -v "$1" >/dev/null 2>&1
}

install_codegraph() {
  if need_command codegraph; then
    printf 'ok: codegraph available (%s)\n' "$(codegraph --version 2>/dev/null || printf unknown)"
  else
    need_command npm || { printf 'bootstrap error: npm is required to install codegraph\n' >&2; return 1; }
    if confirm_or_skip "Install CodeGraph globally with npm?"; then
      npm install -g @colbymchenry/codegraph
    fi
  fi
  if need_command codegraph && confirm_or_skip "Install/refresh CodeGraph MCP config for supported agents?"; then
    codegraph install --target all --location global --yes
  fi
}

install_beads() {
  if need_command bd; then
    printf 'ok: bd available (%s)\n' "$(bd version 2>/dev/null || printf unknown)"
    return 0
  fi
  if need_command npm; then
    if confirm_or_skip "Install Beads globally with npm?"; then
      npm install -g @beads/bd
    fi
    return 0
  fi
  need_command brew || { printf 'bootstrap error: npm or Homebrew is required to install beads automatically\n' >&2; return 1; }
  if confirm_or_skip "Install Beads globally with Homebrew fallback?"; then
    brew install beads
  fi
}

bootstrap_project() {
  local project="$1"
  [[ -n "$project" ]] || return 0
  project="$(cd -- "$project" 2>/dev/null && pwd -P)" || { printf 'bootstrap error: project path not found: %s\n' "$project" >&2; return 1; }
  if need_command codegraph; then
    if [[ ! -d "$project/.codegraph" ]]; then
      if confirm_or_skip "Initialize CodeGraph index in $project?"; then
        codegraph init "$project"
      fi
    else
      codegraph sync "$project" || codegraph status "$project" || true
    fi
  fi
  if need_command bd; then
    if [[ ! -d "$project/.beads" ]]; then
      if confirm_or_skip "Bootstrap Beads database in $project?"; then
        bd -C "$project" bootstrap --yes
      fi
    else
      bd -C "$project" bootstrap --yes || bd -C "$project" status || true
    fi
  fi
}

tool_stack_check() {
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

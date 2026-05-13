#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
export CLAUDE_HOME
INSTALL_STATE="$CLAUDE_HOME/control-plane/install.json"
PULL_FIRST=0
ORIGINAL_ARGS=("$@")

usage() {
  printf 'usage: %s [--pull]\n' "$0" >&2
}

git_commit_or_unknown() {
  local output
  if output="$(git -C "$ROOT" rev-parse HEAD 2>&1)"; then
    printf '%s' "$output"
  else
    printf 'warning: git commit metadata unavailable: %s\n' "$output" >&2
    printf 'unknown'
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pull)
      PULL_FIRST=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      printf 'unknown option: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$ROOT/scripts/install.sh" ]]; then
  if [[ ! -f "$INSTALL_STATE" ]]; then
    printf 'fatal: installed updater cannot locate %s\n' "$INSTALL_STATE" >&2
    exit 1
  fi
  if ! command -v node >/dev/null 2>&1; then
    printf 'fatal: installed updater requires node to read install state: %s\n' "$INSTALL_STATE" >&2
    exit 1
  fi
  SOURCE_ROOT="$(
    node - "$INSTALL_STATE" <<'NODE'
const fs = require("node:fs");
try {
  const state = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  process.stdout.write(state.sourceRoot || "");
} catch (error) {
  process.stderr.write(`fatal: corrupted install state: ${error.message}\n`);
  process.exit(1);
}
NODE
  )"
  if [[ -z "$SOURCE_ROOT" || ! -f "$SOURCE_ROOT/scripts/update.sh" ]]; then
    printf 'fatal: source checkout missing for installed updater: %s\n' "${SOURCE_ROOT:-<empty>}" >&2
    exit 1
  fi
  exec bash "$SOURCE_ROOT/scripts/update.sh" "${ORIGINAL_ARGS[@]}"
fi

old_commit="$(git_commit_or_unknown)"
old_short="${old_commit:0:12}"

if (( PULL_FIRST == 1 )); then
  if ! git_status="$(git -C "$ROOT" status --porcelain 2>&1)"; then
    printf 'fatal: cannot inspect source checkout before --pull: %s\n' "$git_status" >&2
    exit 1
  fi
  if [[ -n "$git_status" ]]; then
    printf 'fatal: refusing --pull with dirty source checkout: %s\n' "$ROOT" >&2
    exit 1
  fi
  git -C "$ROOT" fetch --quiet origin
  git -C "$ROOT" pull --ff-only
fi

"$ROOT/scripts/install.sh"

post_upgrade_canary="$ROOT/scripts/post-upgrade-canary.sh"
if [[ ! -f "$post_upgrade_canary" ]]; then
  printf 'fatal: post-upgrade canary script missing: %s\n' "$post_upgrade_canary" >&2
  exit 1
fi
if ! bash "$post_upgrade_canary"; then
  printf 'fatal: post-upgrade canary failed\n' >&2
  exit 1
fi

new_commit="$(git_commit_or_unknown)"
new_short="${new_commit:0:12}"
mkdir -p "$CLAUDE_HOME/control-plane"
just_updated_tmp="$(mktemp "$CLAUDE_HOME/control-plane/just-updated.json.XXXXXX")"
if ! chmod 600 "$just_updated_tmp"; then
  rm -f "$just_updated_tmp"
  printf 'fatal: failed to secure update metadata temp file\n' >&2
  exit 1
fi
if ! jq -n \
  --arg from "$old_short" \
  --arg to "$new_short" \
  --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{from:$from,to:$to,at:$at}' >"$just_updated_tmp"; then
  rm -f "$just_updated_tmp"
  printf 'fatal: failed to write update metadata\n' >&2
  exit 1
fi
if ! mv -- "$just_updated_tmp" "$CLAUDE_HOME/control-plane/just-updated.json"; then
  rm -f "$just_updated_tmp"
  printf 'fatal: failed to atomically replace update metadata\n' >&2
  exit 1
fi

printf 'Claude control plane updated: %s -> %s\n' "$old_short" "$new_short"

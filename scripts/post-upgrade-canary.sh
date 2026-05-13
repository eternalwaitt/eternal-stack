#!/usr/bin/env bash
set -Eeuo pipefail

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
TARGET="$CLAUDE_HOME"

if [[ ! -d "$TARGET" ]]; then
  printf 'fail: Claude install directory missing: %s\n' "$TARGET" >&2
  exit 1
fi

required_paths=(
  "hooks/cc-pretooluse-guard.sh"
  "hooks/cc-posttoolbatch-observer.sh"
  "hooks/cc-stop-verifier.sh"
  "hooks/cc-posttoolusefailure-diagnose.sh"
  "scripts/update-check.mjs"
  "control-plane/install.json"
)

for rel_path in "${required_paths[@]}"; do
  if [[ ! -f "$TARGET/$rel_path" ]]; then
    printf 'fail: post-upgrade canary missing %s\n' "$TARGET/$rel_path" >&2
    exit 1
  fi
  if [[ "$rel_path" == hooks/*.sh ]] && [[ ! -x "$TARGET/$rel_path" ]]; then
    printf 'fail: post-upgrade canary non-executable %s\n' "$TARGET/$rel_path" >&2
    exit 1
  fi
done

settings_file="$CLAUDE_HOME/settings.json"
if [[ ! -f "$settings_file" ]]; then
  printf 'fail: Claude settings missing: %s\n' "$settings_file" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  printf 'fail: jq not found; please install jq\n' >&2
  exit 1
fi

if ! jq empty "$settings_file" >/dev/null 2>&1; then
  printf 'fail: Claude settings JSON invalid: %s\n' "$settings_file" >&2
  exit 1
fi

printf 'ok: post-upgrade canary passed\n'

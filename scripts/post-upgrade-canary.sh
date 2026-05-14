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
  "scripts/browser-qa-report.mjs"
  "scripts/lib/evidence-trace.mjs"
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

canary_tmp="$(mktemp -d "${TMPDIR:-/tmp}/cc-post-upgrade-canary.XXXXXX")"
cleanup() {
  rm -rf -- "$canary_tmp"
}
trap cleanup EXIT

if unchecked_qa="$(node "$TARGET/scripts/browser-qa-report.mjs" create \
  --path "$canary_tmp/browser-qa-unchecked.json" \
  --routes "/,/canary" \
  --viewports "desktop,mobile" \
  --status complete 2>&1)"; then
  printf 'fail: browser QA canary accepted unchecked complete report\n' >&2
  exit 1
fi
if [[ "$unchecked_qa" != *"consoleSummary"* || "$unchecked_qa" != *"networkSummary"* ]]; then
  printf 'fail: browser QA canary rejected for unexpected reason: %s\n' "$unchecked_qa" >&2
  exit 1
fi

captured_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
v2_matrix="$(jq -cn --arg capturedAt "$captured_at" '[{"route":"/","viewport":"desktop","status":"passed","consoleErrors":0,"failedRequests":0,"capturedAt":$capturedAt}]')"
v2_provenance="$(jq -cn --arg capturedAt "$captured_at" '{"tool":"canary","targetUrl":"http://127.0.0.1/canary","command":"canary screenshot","capturedAt":$capturedAt}')"
if missing_screenshot_qa="$(node "$TARGET/scripts/browser-qa-report.mjs" create \
  --path "$canary_tmp/browser-qa-v2-missing-screenshot.json" \
  --artifact-root "$canary_tmp" \
  --schema-version 2 \
  --routes "/" \
  --viewports "desktop" \
  --target-url "http://127.0.0.1/canary" \
  --tool "canary" \
  --provenance "$v2_provenance" \
  --matrix "$v2_matrix" \
  --console "checked console logs" \
  --network "checked network panel" \
  --status complete 2>&1)"; then
  printf 'fail: browser QA canary accepted complete v2 report without screenshot\n' >&2
  exit 1
fi
if [[ "$missing_screenshot_qa" != *"screenshot"* ]]; then
  printf 'fail: browser QA v2 canary rejected for unexpected reason: %s\n' "$missing_screenshot_qa" >&2
  exit 1
fi

printf 'ok: post-upgrade canary passed\n'

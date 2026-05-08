#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
STATUS=0

ok() { printf 'ok: %s\n' "$*"; }
fail() { printf 'fail: %s\n' "$*" >&2; STATUS=1; }

for dep in jq git node rg fd; do
  command -v "$dep" >/dev/null 2>&1 && ok "$dep available" || fail "$dep missing"
done
command -v sg >/dev/null 2>&1 && ok "sg available" || ok "sg unavailable; live hooks fail open"

"$ROOT/tests/test-hooks.sh" >/dev/null && ok "hook tests pass" || fail "hook tests fail"
node --check "$ROOT/scripts/merge-settings.mjs" >/dev/null && ok "merge-settings syntax valid" || fail "merge-settings syntax invalid"
jq empty "$ROOT/templates/settings.json" "$ROOT/templates/settings.strict.json" >/dev/null && ok "settings templates valid" || fail "settings template invalid"

if jq -e '.hooks.PreToolUse and .hooks.PostToolUse and .hooks.PostToolUseFailure and .hooks.Stop and .hooks.PreCompact and .hooks.PostCompact' "$ROOT/templates/settings.strict.json" >/dev/null; then
  ok "strict template registers blocker hooks"
else
  fail "strict template missing blocker hooks"
fi

if rg -n 'sk_live_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|xoxb-[0-9A-Za-z-]{20,}|npm_[A-Za-z0-9]{20,}' "$ROOT" >/dev/null 2>&1; then
  fail "private credential pattern found in repo"
else
  ok "credential pattern scan clean"
fi

exit "$STATUS"

#!/usr/bin/env bash
# Runs every node:test suite under tests/ with an explicit file list (avoids the
# directory-as-module resolution quirk in node --test). Wired into doctor's heavy
# async batch so the review-rules, overlay, learning-loop, and changelog suites
# are gate-enforced, not just runnable by hand.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
files=()
while IFS= read -r f; do
  files+=("$f")
done < <(find "$ROOT/tests" -name '*.test.mjs' | sort)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "no node test suites found"
  exit 0
fi
node --test "${files[@]}"

#!/usr/bin/env bash

cc_command_is_quality_verification() {
  local cmd
  cmd="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "$cmd" =~ (^|[[:space:];&|])(tsc|eslint|oxlint|biome|prettier|typecheck|lint|test|build|pytest|ruff|mypy|pyright|cargo[[:space:]]+(test|clippy|build|check)|go[[:space:]]+(test|vet)|composer[[:space:]]+test)([[:space:];&|]|$) ]] \
    || [[ "$cmd" =~ (pnpm|npm|yarn|bun)[[:space:]]+(run[[:space:]]+)?(typecheck|lint|test|build|check)([[:space:];&|]|$) ]]
}

cc_command_is_test_verification() {
  local cmd
  cmd="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "$cmd" =~ (^|[[:space:];&|])(test|pytest|vitest|jest|mocha|ava|tap|cargo[[:space:]]+test|go[[:space:]]+test|composer[[:space:]]+test)([[:space:];&|]|$) ]] \
    || [[ "$cmd" =~ (pnpm|npm|yarn|bun)[[:space:]]+(run[[:space:]]+)?test([[:space:];&|]|$) ]]
}

cc_command_is_browser_verification() {
  local cmd
  cmd="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "$cmd" =~ (^|[[:space:];&|])(playwright|playwright-cli|cypress|browser)([[:space:];&|]|$) ]] \
    || [[ "$cmd" =~ (^|[[:space:];&|])curl[[:space:]]+ ]]
}

cc_command_is_review_verification() {
  local cmd
  cmd="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "$cmd" =~ (etrnl-review|code[[:space:]-]?review|review-log|coderabbit|adversarial|redline|second[[:space:]-]?pass) ]]
}

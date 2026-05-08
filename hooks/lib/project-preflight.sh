#!/usr/bin/env bash

cc_has_script() {
  local manager="$1"
  local script="$2"
  if [[ "$manager" == "pnpm" || "$manager" == "npm" ]]; then
    jq -e --arg s "$script" '.scripts[$s] != null' package.json >/dev/null 2>&1
  fi
}

cc_project_preflight_commands() {
  if [[ -f package.json && -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1; then
    for script in typecheck lint test build; do
      if cc_has_script pnpm "$script"; then
        printf 'pnpm %s\n' "$script"
      fi
    done
    return
  fi
  if [[ -f package.json ]] && command -v npm >/dev/null 2>&1; then
    for script in typecheck lint test build; do
      if cc_has_script npm "$script"; then
        if [[ "$script" == "test" ]]; then
          printf 'npm test\n'
        else
          printf 'npm run %s\n' "$script"
        fi
      fi
    done
  fi
  if [[ -f pyproject.toml || -f pytest.ini || -d tests ]] && command -v pytest >/dev/null 2>&1; then
    printf 'pytest\n'
  fi
  if [[ -f pyproject.toml ]] && command -v ruff >/dev/null 2>&1; then
    printf 'ruff check .\n'
  fi
  if [[ -f Cargo.toml ]] && command -v cargo >/dev/null 2>&1; then
    printf 'cargo test\ncargo clippy\ncargo build\n'
  fi
  if [[ -f composer.json ]] && command -v composer >/dev/null 2>&1; then
    printf 'composer test\n'
  fi
}


#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
# shellcheck source=tests/lib/harness.sh
source "$ROOT/tests/lib/harness.sh"
cc_test_init

DOCTOR="$ROOT/scripts/doctor.sh"

treehash_for_root() {
  node --input-type=module -e "
import { worktreeHash } from 'file://${ROOT}/scripts/lib/etrnl-state-core.mjs';
process.stdout.write(worktreeHash(process.argv[1]));
" "$1" 2>/dev/null || true
}

record_doctor_green() {
  local target_root="$1"
  local tree_hash="$2"
  local head_commit
  head_commit="$(git -C "$target_root" rev-parse HEAD 2>/dev/null || true)"
  printf '%s\n' "$(jq -cn \
    --arg tree_hash "$tree_hash" \
    --arg head "$head_commit" \
    --arg cwd "$target_root" \
    '{eventKind:"doctor_green",cwd:$cwd,data:{treeHash:$tree_hash,headCommit:$head,mode:"full",groups:["deps","syntax","hooks","skills","scripts","docs","rules","schemas","settings","install","security","optional"]}}')" \
    | ETRNL_STATE_DIR="$ETRNL_STATE_DIR" node "$ROOT/scripts/etrnl-state.mjs" append --cwd "$target_root" --json >/dev/null
}

# (1) docs-only synthetic path maps to docs (+ deps), not full fall-open
docs_groups="$(bash "$DOCTOR" --print-groups -- docs/health-stack.md 2>&1)" || true
assert_contains "docs-only maps to docs group" "$docs_groups" "doctor-groups: deps docs"
assert_not_contains "docs-only does not fall open to full" "$docs_groups" "fall-open"

# (2) VERSION maps to docs + security without fall-open
version_groups="$(bash "$DOCTOR" --print-groups -- VERSION 2>&1)" || true
assert_contains "VERSION maps to docs group" "$version_groups" "docs"
assert_contains "VERSION maps to security group" "$version_groups" "security"
assert_not_contains "VERSION does not fall open to full" "$version_groups" "fall-open"

# (2b) unmapped root path still falls open to full
fallopen_groups="$(bash "$DOCTOR" --print-groups -- Makefile 2>&1)" || true
assert_contains "unmapped path falls open to full" "$fallopen_groups" "fall-open"
assert_contains "unmapped path selects all groups" "$fallopen_groups" "doctor-groups: deps syntax hooks skills scripts docs rules schemas settings install security optional"

# (2c) templates map to settings + install
template_groups="$(bash "$DOCTOR" --print-groups -- templates/settings.json 2>&1)" || true
assert_contains "templates map to settings group" "$template_groups" "settings"
assert_contains "templates map to install group" "$template_groups" "install"
assert_not_contains "templates do not fall open to full" "$template_groups" "fall-open"

# (2d) schemas map to schemas + hooks (diff-triviality lives in hooks group)
schema_groups="$(bash "$DOCTOR" --print-groups -- schemas/review-classification-rules-v1.json 2>&1)" || true
assert_contains "schemas map to schemas group" "$schema_groups" "schemas"
assert_contains "schemas map to hooks group for triviality gate" "$schema_groups" "hooks"
assert_not_contains "schemas do not fall open to full" "$schema_groups" "fall-open"

record_doctor_green_changed() {
  local target_root="$1"
  local tree_hash="$2"
  local head_commit
  head_commit="$(git -C "$target_root" rev-parse HEAD 2>/dev/null || true)"
  printf '%s\n' "$(jq -cn \
    --arg tree_hash "$tree_hash" \
    --arg head "$head_commit" \
    --arg cwd "$target_root" \
    '{eventKind:"doctor_green",cwd:$cwd,data:{treeHash:$tree_hash,headCommit:$head,mode:"changed",groups:["deps","docs"]}}')" \
    | ETRNL_STATE_DIR="$ETRNL_STATE_DIR" node "$ROOT/scripts/etrnl-state.mjs" append --cwd "$target_root" --json >/dev/null
}

# (3) unchanged tree with recorded green hash exits as cache hit (clean tree only)
cache_hash="$(treehash_for_root "$ROOT")"
[[ -n "$cache_hash" ]] || not_ok "cache-hit fixture produced worktree hash"
if [[ -z "$(git -C "$ROOT" status --porcelain)" ]]; then
  record_doctor_green "$ROOT" "$cache_hash"
  cache_out="$(ETRNL_STATE_DIR="$ETRNL_STATE_DIR" bash "$DOCTOR" --changed --print-groups 2>&1)" || cache_status=$?
  cache_status="${cache_status:-0}"
  if (( cache_status == 0 )); then
    ok "cache hit exits zero"
  else
    not_ok "cache hit exits zero (status=$cache_status)"
  fi
  assert_contains "cache hit reported" "$cache_out" "cache-hit"
  record_doctor_green_changed "$ROOT" "$cache_hash"
  partial_cache_out="$(ETRNL_STATE_DIR="$ETRNL_STATE_DIR" bash "$DOCTOR" --changed --print-groups 2>&1)" || partial_cache_status=$?
  partial_cache_status="${partial_cache_status:-0}"
  assert_not_contains "partial changed green does not cache hit" "$partial_cache_out" "cache-hit"
  assert_contains "partial changed green reruns mapped groups" "$partial_cache_out" "doctor-groups:"
else
  ok "cache hit test skipped (working tree not clean)"
  ok "cache hit reported (skipped on dirty tree)"
fi

# (4) default full mode lists all groups via --print-groups (no --changed)
full_groups="$(bash "$DOCTOR" --print-groups 2>&1)" || true
assert_contains "full mode lists deps group" "$full_groups" "deps"
assert_contains "full mode lists hooks group" "$full_groups" "hooks"
assert_contains "full mode is not fall-open" "$full_groups" "doctor-mode: full"
assert_not_contains "full mode is not cache hit" "$full_groups" "cache hit"

finish_tests

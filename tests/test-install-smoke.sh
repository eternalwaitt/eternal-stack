#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"

run_install_smoke_fast_tests() {
  local dry_run_home dry_run_codex_home dry_run_out core_dry_run_out preserve_dry_run_out
  local full_dry_run_out unwritable_home dry_precond_rc dry_precond_out

  dry_run_home="$TMPROOT/dry-run-claude"
  dry_run_codex_home="$TMPROOT/dry-run-codex"
  if dry_run_out="$(CLAUDE_HOME="$dry_run_home" CODEX_HOME="$dry_run_codex_home" "$ROOT/scripts/install.sh" --dry-run 2>&1)"; then
    ok "install dry-run succeeds"
  else
    not_ok "install dry-run succeeds: $dry_run_out"
  fi
  assert_contains "install dry-run names core profile" "$dry_run_out" "profile=core"
  assert_contains "install dry-run names stack validator" "$dry_run_out" "stack-profile-check.mjs"
  assert_contains "install dry-run resets Claude settings before applying stack" "$dry_run_out" "reset it to vanilla while preserving enabledPlugins and statusLine before applying stack hooks"
  core_dry_run_out="$(CLAUDE_HOME="$dry_run_home" CODEX_HOME="$dry_run_codex_home" "$ROOT/scripts/install.sh" --profile core --dry-run)"
  assert_contains "core profile dry-run skips global memory tools" "$core_dry_run_out" "core profile skips Hindsight, Beads, and CodeGraph bootstrap"
  preserve_dry_run_out="$(CLAUDE_HOME="$dry_run_home" CODEX_HOME="$dry_run_codex_home" "$ROOT/scripts/install.sh" --preserve-settings --dry-run)"
  assert_contains "preserve settings dry-run keeps merge mode visible" "$preserve_dry_run_out" "preserve existing"
  full_dry_run_out="$(CLAUDE_HOME="$dry_run_home" CODEX_HOME="$dry_run_codex_home" "$ROOT/scripts/install.sh" --profile full --yes --dry-run)"
  assert_contains "full profile dry-run includes CodeGraph" "$full_dry_run_out" "CodeGraph global tool"
  assert_contains "full profile dry-run includes Beads" "$full_dry_run_out" "Beads binary"
  assert_contains "full profile dry-run includes Hindsight" "$full_dry_run_out" "Hindsight plugin"
  assert_contains "full profile dry-run includes rollback metadata" "$full_dry_run_out" "rollback metadata"
  assert_no_directory "install dry-run does not create Claude home" "$dry_run_home"
  assert_no_directory "install dry-run does not create Codex home" "$dry_run_codex_home"
  if [[ "$(id -u)" != "0" ]]; then
    unwritable_home="$TMPROOT/unwritable-home"
    mkdir -p "$unwritable_home"
    chmod 500 "$unwritable_home"
    trap 'chmod 700 "$unwritable_home" 2>/dev/null || true' RETURN
    dry_precond_rc=0
    dry_precond_out="$(CLAUDE_HOME="$unwritable_home" CODEX_HOME="$TMPROOT/dry-precond-codex" "$ROOT/scripts/install.sh" --dry-run 2>&1)" || dry_precond_rc=$?
    chmod 700 "$unwritable_home"
    trap - RETURN
    if (( dry_precond_rc != 0 )); then
      ok "install dry-run fails on unwritable target"
    else
      not_ok "install dry-run fails on unwritable target"
    fi
    assert_contains "install dry-run names unwritable target precondition" "$dry_precond_out" "not writable"
  else
    ok "install dry-run fails on unwritable target (skipped under root)"
    ok "install dry-run names unwritable target precondition (skipped under root)"
  fi
  assert_command "core stack profile validates" node "$ROOT/scripts/stack-profile-check.mjs" "$ROOT/templates/stack-profile.core.json"
  assert_command "full stack profile validates" node "$ROOT/scripts/stack-profile-check.mjs" "$ROOT/templates/stack-profile.full.json"
}

run_install_malformed_settings_tests() {
  local bad_settings_home bad_settings_codex_home bad_settings_out

  bad_settings_home="$TMPROOT/bad-settings-claude"
  bad_settings_codex_home="$TMPROOT/bad-settings-codex"
  mkdir -p "$bad_settings_home"
  printf '{invalid json\n' >"$bad_settings_home/settings.json"
  if bad_settings_out="$(CLAUDE_HOME="$bad_settings_home" CODEX_HOME="$bad_settings_codex_home" "$ROOT/scripts/install.sh" 2>&1)"; then
    ok "install recovers malformed settings"
  else
    not_ok "install recovers malformed settings: $bad_settings_out"
  fi
  assert_contains "install warns about malformed settings" "$bad_settings_out" "install warning: invalid JSON"
  assert_json_expr "install malformed settings resets enabledPlugins" "$(jq -c . "$bad_settings_home/settings.json")" '.enabledPlugins == {}'
}

run_install_smoke_tests() {
  run_install_smoke_fast_tests
  run_install_malformed_settings_tests
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  cd "$ROOT"
  # shellcheck source=./tests/lib/harness.sh
  source ./tests/lib/harness.sh
  cc_test_init
  export CLAUDE_HOME="$TMPROOT/claude"
  export CODEX_HOME="$TMPROOT/codex"
  export CLAUDE_GUARD_STATE_DIR="$TMPROOT/state"
  # Same rationale as tests/test-install.sh: the source suites are separate gates.
  export ETRNL_INSTALL_SOURCE_TESTS=0
  smoke_mode="${RUN_INSTALL_SMOKE_MODE:-fast}"
  if [[ "$smoke_mode" == "full" ]]; then
    run_install_smoke_tests
  else
    run_install_smoke_fast_tests
  fi
  finish_tests
fi

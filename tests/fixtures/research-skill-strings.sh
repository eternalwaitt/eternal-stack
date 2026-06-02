#!/usr/bin/env bash
# Canonical detection strings for research fixture content.
# Sourced by tests/test-workflow-tools.sh when writing fixture repos.
# Strings must satisfy CAPABILITY_DEFS patterns in scripts/lib/research-intel-core.mjs.
# Update both here and in CAPABILITY_DEFS when detection keywords change.
export SKILL_LINE_TDD="Write the test first"
export SKILL_LINE_PLANNING="Use implementation plan phases"
export SKILL_LINE_RESEARCH="Run research compare pass"
export SKILL_LINE_SUBAGENT="Use subagent orchestration for tasks"
export SKILL_LINE_PARALLELISM="Enable parallel wave execution with file overlap checks"
export SKILL_LINE_GATE="Set verification gate as blocker"
export SKILL_LINE_ROLLBACK="Document rollback guardrails and backup restore flow"
export SKILL_LINE_TELEMETRY="Emit telemetry heartbeat monitor alerts"
export HOOK_LINE_GATE="verification gate blocker fail-closed"
export SCRIPT_LINE_TELEMETRY="telemetry heartbeat monitor alert"
export TEST_LINE_TDD="red-green-refactor"

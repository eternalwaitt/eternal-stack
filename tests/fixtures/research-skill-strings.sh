#!/usr/bin/env bash
# Canonical detection strings for research fixture content.
# Sourced by tests/test-workflow-tools.sh when writing fixture repos.
# Strings must satisfy CAPABILITY_DEFS patterns in scripts/lib/research-intel-core.mjs.
# Update both here and in CAPABILITY_DEFS when detection keywords change.
SKILL_LINE_TDD="Write the test first"
SKILL_LINE_PLANNING="Use implementation plan phases"
SKILL_LINE_RESEARCH="Run research compare pass"
SKILL_LINE_SUBAGENT="Use subagent orchestration for tasks"
SKILL_LINE_PARALLELISM="Enable parallel wave execution with file overlap checks"
SKILL_LINE_GATE="Set verification gate as blocker"
SKILL_LINE_ROLLBACK="Document rollback guardrails and backup restore flow"
SKILL_LINE_TELEMETRY="Emit telemetry heartbeat monitor alerts"
HOOK_LINE_GATE="verification gate blocker fail-closed"
SCRIPT_LINE_TELEMETRY="telemetry heartbeat monitor alert"
TEST_LINE_TDD="red-green-refactor"

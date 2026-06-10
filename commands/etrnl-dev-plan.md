---
description: Draft, review, and finalize an ETRNL implementation plan.
argument-hint: <request>
allowed-tools: Bash, Read, Write, Edit, MultiEdit
---

User request: `$ARGUMENTS`

Use `skills/etrnl-dev-plan/SKILL.md` as the workflow contract.

Create or update the plan on disk, include `Execution scope: all_phases` unless the user explicitly requests a narrower scope, run the plan readiness gate, and report the saved plan path plus verification evidence.

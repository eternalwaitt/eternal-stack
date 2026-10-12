---
description: Draft, review, and finalize an ETRNL implementation plan.
argument-hint: <request>
allowed-tools: Bash, Read, Write, Edit, MultiEdit
---

User request: `$ARGUMENTS`

Use `skills/etrnl-dev-plan/SKILL.md` as planning guidance and the router's stored workflow contract as the sole source for workflow requirements and budgets.

Create or update the plan on disk, include `Execution scope: all_phases` unless the user explicitly requests a narrower scope, and run relevant readiness checks when available. Report the saved plan path, checks actually performed, and unresolved blockers. Do not invent risk tiers or fixed reviewer lanes.

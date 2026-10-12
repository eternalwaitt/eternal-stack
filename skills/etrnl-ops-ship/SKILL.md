---
name: etrnl-ops-ship
description: Prepare and verify an authorized release, rollout, cutover, or go/no-go decision for Claude Code or Codex. Does not grant external authority.
disable-model-invocation: true
---
# Ship

Use this workflow for release readiness and rollout. The router's `ship` contract is program mode: preserve its task, phase, verification, review, and budget requirements in the active ledger. Shipping remains subject to the user's existing authorization and the target project’s actual release policy.

## Prepare

1. Read the stored workflow contract, requested outcome, project release policy, relevant plan/PR, CI state, and current diff. Do not invent a release class or scaffold controls that the target project does not use.
2. Inspect the plan's acceptance, verification, and rollback criteria and the PR's rollout notes when present. Use `pr-preflight` only when available from the companion library; absence is a limitation to report, not a reason to bypass an actual project gate.
3. Map each required signal to evidence that can be observed in this release: tests, build, CI, deployment health, metrics, user flow, migration compatibility, or rollback proof. Mark irrelevant controls not applicable with a reason.
4. Prepare staged promotion and rollback steps where the project's policy or the change's impact requires them. Keep live changes, external messages, merge, and deployment within the user's authorization.

## Verify and promote

- Confirm each required project gate with current evidence. Distinguish source checks, CI, staged environment, and production behavior.
- If a required signal fails, stop promotion and identify the failing evidence and the smallest safe next step.
- If the user authorized promotion, follow the project's named stages and trigger conditions. Do not treat this skill, a plan, or a green local check as deployment approval.
- After an authorized rollout, inspect the named health signals and rollback trigger. Execute rollback only when it is within standing authorization or the user/project policy explicitly grants it.
- Capture checks with the active ledger when the workflow requires it; keep actual command output, URLs, and timestamps relevant to the decision.

## Report

State what is ready, what was verified, which environment each result covers, remaining risks, and whether a separately authorized promotion action remains. Do not label a release “shipped” until the external action and its outcome are verified.

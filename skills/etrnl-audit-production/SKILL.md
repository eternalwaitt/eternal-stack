---
name: etrnl-audit-production
description: ETRNL deep-audit category skill for production readiness. Use when the user asks for production readiness, launch readiness, production blockers, runtime data safety, validation boundaries, auth and tenancy enforcement, webhook reliability, serverless readiness, exports, route correctness, raw env access, or App Router error boundaries.
---
# ETRNL Production Readiness

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-production`; on update, ask update/snooze/continue.

Run the production-readiness deep-audit category against a target application. This category is read-only unless the user explicitly asks for fixes.

## Startup

1. Confirm the target repo, framework, API layer, ORM, auth provider, queue or cron model, deployment model, market locale, tenancy model, logger, and env schema.
2. Load `references/audit-checks.md`.
3. Use the shared deep-audit report envelope from `etrnl-deep-audit` when it exists.
4. For direct category invocation, create the same report envelope with `requestedCategories: ["production-readiness"]`, or route the run through `etrnl-deep-audit --category production-readiness`.
5. Refuse final completion until the artifact validator command for the report has run or a concrete blocker is recorded.

## Hard Rules

- Process full worklists. Sampling blocks completion.
- Execute registered checks in order from `prod-01-state-coverage` through `prod-18-operability-prr`.
- Inspect file contents before marking a check complete. Match counts alone are not evidence.
- Record `CONFIRMED_CLEAN` for every completed check with zero findings.
- Log `CHECKS_SKIPPED` with check id, worklist id, and reason when source evidence, credentials, runtime access, or context budget blocks completion.
- Mark `not_applicable` with the applicability gate and evidence when tenancy, soft deletion, money value objects, i18n, exports, serverless deployment, queues, crons, webhooks, uploads, or market-specific rules are absent from the target.
- Keep source-limited blockers separate from clean checks.
- Keep local target paths, account identifiers, secrets, transcript content, and private memory material out of tracked artifacts.

## Output

Return:

- coverage and worklist counts;
- findings by check id and severity;
- `CONFIRMED_CLEAN` rows;
- `CHECKS_SKIPPED` rows;
- `not_applicable` rows;
- source-limited blockers;
- artifact path or blocker;
- validation command and result.

Direct invocation final output includes:

```bash
node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>
```

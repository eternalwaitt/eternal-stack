# Control Plane Coverage

Status key: `done` means implemented in this repo; `live-gated` means intentionally controlled by local install/canary because it mutates a personal Claude setup.

| Planned area | Current coverage |
| --- | --- |
| Hook library and state | done: JSON, state, paths, preflight, code policy, and complexity helpers. |
| Observer hooks | done: prompt routing, prompt expansion, `CLAUDE.md` reinjection, advisory locked rate limiting, post-tool batch observation, and session cleanup. |
| Strict blockers | done: Bash, directory `Read`, shell output-limiter, edit/write, WebSearch, agent/task, evidence-first, stale verification, requested-skill, domain-skill, first-failure context, repeated-failure, Stop, and SubagentStop gates. |
| Compact recovery | done: PreCompact/PostCompact state with timestamp/count metadata plus SessionStart recovery, workflow status, and skill hints. |
| Skill set | done: `etrnl-*` repo-owned family plus documented companion skills. |
| Code health | done: master code-health router, deterministic inventory helper, Health Stack doc, no-skips ledger contract, and companion audit routing. |
| Writing plans flow | done: file-backed draft, review, improve, final, short chat summary, Hybrid Deep Stack metadata, and `/etrnl-autoplan` full-depth planning with CEO, engineering, DX, adversarial, specialist, reuse, simplifier, and findings convergence. |
| Execution flow | done: phase gates, Hybrid risk tiers only after deep review, optional phase/workstream/UAT ledger metadata, schema v2 execution events/reviews, structured task packets with task identity, lineage, packet hashes, reuse/TDD/simplifier evidence fields, wave planning, overlap checks, worktree eligibility, deep-stack packet ownership fields, `etrnl-execute` completion blocking when packet-bound implementation/reviewer/TDD/simplifier/reuse/TypeScript/install evidence is missing, mandatory spec/quality/simplifier reviewer evidence, critical review, durable artifacts, verification, final simplification/dedupe/domain passes, and no-pause question policy. |
| Durable artifacts | done: deep-stack bundle, sanitized source manifest, skill matrix, review phase records, TDD evidence, reuse inventory and reuse bindings, findings ledger, completion audit and completion reconciliation, TypeScript trigger evidence, install proof, Hybrid risk tier, review log, browser QA v1/v2 reports with mandatory console/network summaries, route/viewport matrix counts, screenshot hashes, capture freshness, and provenance for completed v2 runs, context save/restore, artifact-required ledger checks, redacted cross-session project buglog hints, and workflow-health summaries/status JSON. |
| Agent templates | done: default-installed executor/reviewer/investigator/scout/adversary/design/DX/browser QA `etrnl-*` agents. |
| Shared startup guidance | done: public `AGENTS.md` template plus tiny Claude wrapper importing it. |
| Rules | done: namespaced `rules/etrnl/*.md` to avoid clobbering existing user rules. |
| Install/update/rollback/doctor | done: scripts, tests, rollback, canaries, rules, docs, templates, agents, settings audit/repair, installed update metadata, drift explain output, artifact helpers, post-upgrade browser-QA canary, installed-home doctor, and workflow-health helpers are installed or checked. |
| Hindsight memory consolidation | live-gated: canary verifies strict config; actual migration/removal of competing memory systems remains a personal live operation. |
| Plugin/MCP cleanup | live-gated: plan requires inventory and explicit local rollout before removing plugins, MCPs, or permissions. |
| Shareable repo boundary | done: public templates exclude private identity, accounts, transcripts, secrets, and memories. |

## Companion Skills

The control plane owns only the `etrnl-*` skills in this repo. These companion skills are expected when installed and are mapped in `docs/skills.md`:

- `eternal-best-practices`
- `domain-*`
- `better-auth`
- `tenant-isolation-patterns`
- `money-vo-discipline`
- `prisma-expert`
- `i18n-localization`
- `stripe-best-practices`
- `abacatepay-integration`
- `code-simplifier`
- `finding-duplicate-functions`
- `brooks-audit`

They remain separate so the repo-owned namespace is unambiguous while still preserving the richer review loop from the original sessions.

## Best-Of-All-Worlds Layers

| Layer | Status | Deterministic proof |
| --- | --- | --- |
| Skill trigger evals | done | `tests/fixtures/skill-triggering/cases.json`, `tests/test-hooks.sh`, `skill-behavior-smoke.mjs`. |
| Workflow status | done | `workflow-health.mjs status` / `status --json`, SessionStart status hints, and workflow-tool tests for stale, missing artifact, UAT, and text output states. |
| Browser QA v2 | done | `browser-qa-report.mjs` validates v2 matrix reports, hashes screenshots, rejects missing/out-of-root/stale screenshot evidence, and post-upgrade canary exercises the installed helper. |
| Local learning hints | done | `project-buglog.mjs suggest --json` and `suggest-project --json`, cross-session fingerprints, redaction, stale filtering, hook debounce, and disable flag tests. |
| Reviewer-gated subagents | done | write packets require task identity and lineage; multi-file write packets require reviewer contracts; Stop blocks execute completion when packet-bound implementation evidence is missing or spec/quality reviewer evidence is absent. |
| Phase/UAT artifacts | done | `execution-ledger.mjs set-phase` and `record-uat`; open UAT findings block `check-stop`. |
| Hybrid Deep Stack artifacts | done | `deep-stack-check.mjs validate-plan --plan <plan>` and section validators require artifact bundles for final plans; legacy transition is an explicit flag, not the default. |

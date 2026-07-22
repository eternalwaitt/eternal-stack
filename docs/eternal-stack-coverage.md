# Eternal Stack Coverage

Status key: `done` means implemented in this repo; `live-gated` means intentionally controlled by local install/canary because it mutates a personal Claude setup.

| Planned area | Current coverage |
| --- | --- |
| Hook library and state | done: JSON, state, paths, preflight, code policy, complexity, cleanup, and event-extract helpers. |
| Observer hooks | done: prompt routing, prompt expansion, `CLAUDE.md` reinjection, advisory locked rate limiting, post-tool batch observation, and session cleanup. Reference: `docs/hooks.md` (catalog), `docs/guards.md` (deny rules). |
| Strict blockers | done: Bash, directory `Read`, shell output-limiter, edit/write, WebSearch, agent/task, evidence-first, stale verification, requested-skill, domain-skill, first-failure context, repeated-failure, Stop, and SubagentStop gates. |
| Compact recovery | done: PreCompact/PostCompact state with timestamp/count metadata plus SessionStart recovery, workflow status, and skill hints. PreCompact also writes a lossless session snapshot whose path rides the `compact_pre` event. |
| Automatic retro and steering | done: `etrnl-retro.mjs` distills rules-only lessons from state events at SessionEnd/PreCompact (fail-open), injects a bounded top-lesson index at SessionStart/PostCompact, prunes with confidence decay, honors project-local `.etrnl/STEERING.md` once per update, and retains `env_remedy`/`recurring_defect` lessons to Hindsight (canary-gated) with `reflect()` when supported. Reference: `docs/hooks.md` (Retro and steering). |
| Review convergence | done: parallel reviewers merge once through `review-merge.mjs` (fingerprint dedup, confidence gates, `autofix_class` routing); fixes cap at two rounds per wave with a stall rule; reopen only on P0/P1; tier ≤2 uses one merged pass per wave plus a plan-end adversarial pass; deterministic `review-rules.mjs` matches never reach LLM review. Reference: `skills/etrnl-dev-execute/references/bounded-review.md`. |
| Skill set | done: `etrnl-*` orchestration family, canonical `/etrnl-dev-ci`, plus bundled policy/review/domain skills documented in `docs/skills.md`. |
| Code health | done: master code-health router, deterministic inventory helper, Health Stack doc, no-skips ledger contract, and bundled-skill audit routing. |
| Writing plans flow | done: file-backed draft, review, improve, final, short chat summary, Hybrid Deep Stack metadata, and `/etrnl-dev-autoplan` full-depth planning with CEO, engineering, DX, adversarial, specialist, reuse, simplifier, and findings convergence. |
| Execution flow | done: phase gates, Hybrid risk tiers only after deep review, optional phase/workstream/UAT ledger metadata, schema v2 execution events/reviews, structured task packets with task identity, lineage, packet hashes, reuse/TDD/simplifier evidence fields, wave planning, overlap checks, worktree eligibility, deep-stack packet ownership fields, `etrnl-dev-execute` completion blocking when packet-bound implementation/reviewer/TDD/simplifier/reuse/TypeScript/install evidence is missing, mandatory spec/quality/simplifier reviewer evidence, critical review, durable artifacts, verification, final simplification/dedupe/domain passes, and no-pause question policy. |
| Durable artifacts | done: deep-stack bundle, sanitized source manifest, skill matrix, review phase records, TDD evidence, reuse inventory and reuse bindings, findings ledger, completion audit and completion reconciliation, TypeScript trigger evidence, install proof, Hybrid risk tier, review log, browser QA v1/v2 reports with mandatory console/network summaries, route/viewport matrix counts, screenshot hashes, capture freshness, and provenance for completed v2 runs, context save/restore, artifact-required ledger checks, redacted cross-session project buglog hints, workflow-health summaries/status JSON, and local tool-effectiveness verdict summaries. |
| Agent templates | done: 11 default-installed `etrnl-*` agents — `etrnl-executor` (implementation), `etrnl-spec-reviewer` and `etrnl-quality-reviewer` (spec/quality review), `etrnl-design-reviewer` and `etrnl-dx-reviewer` (design/DX review), `etrnl-investigator` and `etrnl-scout` (discovery), `etrnl-adversary` (adversarial review), `etrnl-browser-qa` (browser QA), `etrnl-consumer-tracer` (call-site coverage after shared-value changes), and `etrnl-test-wiring-auditor` (test-wiring check for behavioral diffs). |
| Shared startup guidance | done: public `AGENTS.md` template plus tiny Claude wrapper importing it. |
| Rules | done: namespaced `rules/etrnl/*.md` to avoid clobbering existing user rules; cross-host eternal-saas pack (`rules/eternal-saas/global/` + `rules/eternal-saas/project/`) with `rules-manifest.json` (schema v1, checksums, privacy gates); `scripts/init-project-rules.sh` deploys pack to any target repo with Claude+Cursor outputs; `scripts/sync-rule-exports.mjs` keeps `.mdc` Cursor twins in sync; doctor byte gate prevents Codex startup overflow. Reference: `docs/rules.md`. |
| Install/update/rollback/doctor | done: scripts, tests, rollback (including `rules/eternal-saas` + Codex startup file restore), canaries, rules, docs, templates, agents, settings audit/repair, installed update metadata, drift explain output, artifact helpers, post-upgrade browser-QA canary, installed-home doctor, and workflow-health helpers are installed or checked. |
| Hindsight memory consolidation | live-gated: canary verifies strict config; actual migration/removal of competing memory systems remains a personal live operation. |
| Plugin/MCP cleanup | live-gated: plan requires inventory and explicit local rollout before removing plugins, MCPs, or permissions. |
| Shareable repo boundary | done: public templates exclude private identity, accounts, transcripts, secrets, and memories. |
| Release and public docs | done: `VERSION`, Keep a Changelog `CHANGELOG.md`, `docs/RELEASING.md`, `scripts/release.mjs`, `scripts/changelog-release-check.mjs`, `README.md`, `CREDITS.md`, root `AGENTS.md`/`CLAUDE.md`, and aligned `docs/skills.md` / `docs/health-stack.md`. |

## Bundled skills

Eternal Stack is a bundled skill family: `etrnl-*` orchestration from this repo plus policy, review, and domain skills that install on the host and are routed by hooks and workflows. See `docs/skills.md` for the full inventory. Representative bundled skills:

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
- Brooks guidance via `etrnl-code-review-excellence/references/` (supersedes standalone `brooks-audit` for stack use)

## Best-Of-All-Worlds Layers

| Layer | Status | Deterministic proof |
| --- | --- | --- |
| Skill trigger evals | done | `tests/fixtures/skill-triggering/cases.json`, `tests/test-hooks.sh`, `skill-behavior-smoke.mjs`. |
| Workflow status | done | `workflow-health.mjs status` / `status --json`, SessionStart status hints, and workflow-tool tests for stale, missing artifact, UAT, and text output states. |
| Tool effectiveness | done | `tool-effectiveness.mjs validate-fixtures`, `baseline`, `import-codex`, `summarize`, and workflow-health effectiveness projection tests for sanitized CodeGraph, Beads, and hook-pattern signals. |
| Browser QA v2 | done | `browser-qa-report.mjs` validates v2 matrix reports, hashes screenshots, rejects missing/out-of-root/stale screenshot evidence, and post-upgrade canary exercises the installed helper. |
| Local learning hints | done | `project-buglog.mjs suggest --json` and `suggest-project --json`, cross-session fingerprints, redaction, stale filtering, hook debounce, and disable flag tests. |
| Reviewer-gated subagents | done | write packets require task identity and lineage; multi-file write packets require reviewer contracts; Stop blocks execute completion when packet-bound implementation evidence is missing or spec/quality reviewer evidence is absent. |
| Phase/UAT artifacts | done | `execution-ledger.mjs set-phase` and `record-uat`; open UAT findings block `check-stop`. |
| Hybrid Deep Stack artifacts | done | `deep-stack-check.mjs validate-plan --plan <plan>` and section validators require artifact bundles for final plans; legacy transition is an explicit flag, not the default. |

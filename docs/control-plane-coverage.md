# Control Plane Coverage

Status key: `done` means implemented in this repo; `live-gated` means intentionally controlled by local install/canary because it mutates a personal Claude setup.

| Planned area | Current coverage |
| --- | --- |
| Hook library and state | done: JSON, state, paths, preflight, code policy, and complexity helpers. |
| Observer hooks | done: prompt routing, prompt expansion, post-tool batch, failure diagnosis, session cleanup. |
| Strict blockers | done: Bash, edit/write, WebSearch, agent/task, evidence-first, stale verification, requested-skill, and domain-skill gates. |
| Compact recovery | done: PreCompact/PostCompact state plus SessionStart recovery and skill hints. |
| Skill set | done: `etrnl-*` repo-owned family plus documented companion skills. |
| Code health | done: master code-health router, deterministic inventory helper, Health Stack doc, no-skips ledger contract, and companion audit routing. |
| Writing plans flow | done: file-backed draft, review, improve, final, short chat summary, and `/etrnl-autoplan` gauntlet-lite planning with completeness 10/10 defaults. |
| Execution flow | done: phase gates, run ledger helper, structured subagent task packets, wave planning, overlap checks, worktree eligibility, critical review, durable artifacts, verification, final simplification/dedupe/domain passes, and no-pause question policy. |
| Durable artifacts | done: review log, browser QA report, context save/restore, artifact-required ledger checks, redaction, and workflow-health summaries. |
| Agent templates | done: default-installed executor/reviewer/investigator/scout/adversary/design/DX/browser QA `etrnl-*` agents. |
| Shared startup guidance | done: public `AGENTS.md` template plus tiny Claude wrapper importing it. |
| Rules | done: namespaced `rules/etrnl/*.md` to avoid clobbering existing user rules. |
| Install/update/rollback/doctor | done: scripts, tests, rollback, canaries, rules, docs, templates, agents, artifact helpers, and workflow-health helpers are installed or checked. |
| Hindsight memory consolidation | live-gated: canary verifies strict config; actual migration/removal of competing memory systems remains a personal live operation. |
| Plugin/MCP cleanup | live-gated: plan requires inventory and explicit local rollout before removing plugins, MCPs, or permissions. |
| Shareable repo boundary | done: public templates exclude private identity, accounts, transcripts, secrets, and memories. |

## Companion Skills

The control plane owns only the `etrnl-*` skills in this repo. These companion skills are expected when installed and are mapped in `docs/skills.md`:

- `eternal-best-practices`
- `code-simplifier`
- `finding-duplicate-functions`
- `brooks-audit`

They remain separate so the repo-owned namespace is unambiguous while still preserving the richer review loop from the original sessions.

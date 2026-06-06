# Latest Starred Agent Stack Map

Generated: 2026-06-03

Source: authenticated `gh api -H 'Accept: application/vnd.github.star+json' 'user/starred?sort=created&direction=desc&per_page=100' --paginate`.

Scope:

- Scanned 194 starred repositories.
- Deep-dived 31 high-signal repositories with shallow clones under `/tmp/ccp-star-dive`.
- Focused on harnesses, subagent orchestration, skills, hooks, context/indexing, verification gates, and repo-health tooling.
- Existing committed competitor snapshot remains `docs/research/top10-lock.json`; this file is a current starred-repo expansion map, not a replacement lockfile.

## Verdict Legend

- `adopt`: make first-class or preferred optional companion.
- `steal`: copy the mechanism or enforcement shape, not the repository.
- `map`: document as companion/catalog/reference only.
- `reject`: do not integrate into the control plane except as negative evidence.

## Executive Picks

| Priority | Repo | Verdict | Why It Matters | CCP Target |
| --- | --- | --- | --- | --- |
| P0 | `rtk-ai/rtk` | adopt | Deterministic command rewrite/truncation already aligns with current RTK-first direction. | `codex-rtk-pre-tool-use.sh`, doctor/install/test parity |
| P0 | `colbymchenry/codegraph` | adopt optional | Best local code-index MCP: adaptive output caps, FTS5/SQLite graph, line-numbered explore output, tool allowlist. | optional MCP companion, code-health/research docs |
| P0 | `GitHub/spec-kit` | steal/adopt gates | Strongest spec -> plan -> tasks -> implement pipeline; better task/checklist executability gates than section checks. | `plan-readiness-check.mjs`, `etrnl-dev-plan`, `etrnl-dev-execute` |
| P0 | `Chachamaru127/claude-code-harness` | steal | Sprint contract, worker AGENTS hash proof, quality gates, test tamper checks, review plateau detection. | `execution-ledger.mjs`, `workflow-health.mjs`, `browser-qa-report.mjs`, Stop verifier |
| P0 | `infinri/Writ` | steal | Phase-gated writes, mandatory-vs-retrieved rules, mechanical-enforcement requirement for mandatory rules. | `skill-contract-check.mjs`, PreTool/Stop hooks |
| P1 | `gsd-build/get-shit-done` | adopt as benchmark | Closest workflow benchmark: `.planning` state, phase gates, context monitor, command router. | execution ledger, context breadcrumbs, workflow health |
| P1 | `millionco/react-doctor` | adopt optional | Concrete React-specific JSON/CI diagnostics and changed-file scan gate. | optional `etrnl-dev-test`/`etrnl-audit-code` tool |
| P1 | `hyhmrright/brooks-lint` | map/adopt companion | Strong review finding form: Symptom -> Source -> Consequence -> Remedy; configurable risk taxonomy. | existing `brooks-audit` companion mapping |
| P1 | `bytedance/deer-flow` | steal primitives | Subagent limits, prompt-security tests, skill archive install safety, MCP session lifecycle. | `agent-task-packet-check.mjs`, `doctor.sh`, `skill-contract-check.mjs` |
| P1 | `humanlayer/12-factor-agents` | adopt principles | Event-thread state, pause/resume, compact-error retry limits, typed human approval. | `context-state.mjs`, guard override, failure hooks |

## Integration Backlog

1. Add a hard subagent lifecycle contract.
   - Max concurrent lanes.
   - No native child agents unless parent/child drain is modeled.
   - Explicit completion receipts for every lane.
   - Sources: DeerFlow `test_subagent_limit_middleware.py`, Multica `codex_multi_agent.go`, Rowboat `pipeline-state-manager.ts`.

2. Upgrade plan/readiness gates.
   - Validate spec/checklist/task executability, not just required section names.
   - Require independently executable tasks with acceptance criteria and verification command mapping.
   - Source: Spec Kit `templates/commands/implement.md` and extension hook model.

3. Add review plateau and repeated-finding detection.
   - Detect repeated review loops with high similarity and no new evidence.
   - Record plateau state in workflow health so audits stop repeating the same pass.
   - Source: Chachamaru `scripts/detect-review-plateau.sh`.

4. Strengthen skill/agent contract validation.
   - Mandatory rules must name a mechanical enforcement path or be downgraded from mandatory.
   - Validate cross-skill links and owned/companion boundaries.
   - Sources: Writ `writ/gate.py`, Addy Osmani `scripts/validate-skills.js`, Brooks-Lint `validate-repo.mjs`.

5. Add context-exhaustion breadcrumbs.
   - Record context pressure and next deterministic action before compaction or stop.
   - Source: GSD context monitor and OMC project/session manager patterns.

6. Add optional local-code MCP recommendation.
   - Prefer CodeGraph for local code graph search.
   - Map Claude Context only for external vector-index users.
   - Keep Headroom/PageIndex out of default CCP paths.

7. Add install/archive safety for skills/plugins.
   - Scan archives before writing, reject path traversal and unparseable manifests, avoid overwrites without explicit ownership.
   - Source: DeerFlow skill archive install tests and Caveman installer/settings hardening.

## Latest Starred Repos

| Starred At | Repo | Verdict | Notes |
| --- | --- | --- | --- |
| 2026-06-02 | `chopratejas/headroom` | steal/map | Useful compression policy and telemetry ideas, but default proxy/config mutation conflicts with no-silent-fallback and low-risk install. |
| 2026-06-02 | `revfactory/harness` | map | Good meta-skill and orchestrator templates; team API assumptions limit direct use. |
| 2026-06-02 | `colbymchenry/codegraph` | adopt optional | Best current candidate for local code graph MCP. |
| 2026-06-02 | `Chachamaru127/claude-code-harness` | steal | Highest-value harness mechanics: quality gates, plateau detection, browser artifact contract. |
| 2026-06-02 | `EveryInc/compound-engineering-plugin` | steal/map | Already in old competitor lock; current delta is Codex compatibility mapping and persona routing. |
| 2026-05-27 | `hardikpandya/stop-slop` | steal tiny subset | Use phrase patterns for prose lint only; do not import as broad writing behavior. |
| 2026-05-27 | `mukul975/Anthropic-Cybersecurity-Skills` | map selective | Security taxonomy and validator are useful; full corpus is too large and dual-use. |
| 2026-05-24 | `humanlayer/12-factor-agents` | adopt principles | Strong event/state and pause/resume principles; reject demo runtime. |
| 2026-05-15 | `Q00/ouroboros` | map/adopt contracts | Workflow IR, control contract, watchdog, read-only event store are useful as JS validator inspiration. |
| 2026-05-14 | `mattpocock/skills` | steal/map | Diagnosis loop and git guardrails are useful; avoid doc-poisoning side effects. |
| 2026-05-14 | `infinri/Writ` | steal | Phase-gated workflow and rule authority model are valuable; daemon/RAG stack is too heavy. |
| 2026-05-12 | `millionco/react-doctor` | adopt optional | Strong React-only diagnostics and CI JSON report. |
| 2026-05-06 | `ComposioHQ/awesome-codex-skills` | map only | Good catalog/index; too broad, credential-heavy, and no top-level license. |
| 2026-05-03 | `hyhmrright/brooks-lint` | map/adopt companion | Keep as external companion; do not vendor prompt-heavy skill suite. |
| 2026-04-25 | `zilliztech/claude-context` | map optional | Useful Merkle/index patterns, but vector DB and embedding burden are too high for default CCP. |
| 2026-04-20 | `addyosmani/agent-skills` | steal/map | Validator and source-driven docs hierarchy are useful. |

## Category Findings

### Harness And Workflow

| Repo | Verdict | Mechanisms Worth Carrying Forward |
| --- | --- | --- |
| `Chachamaru127/claude-code-harness` | steal | Sprint contract loop, worker instruction hash proof, quality gates, test-tamper detection, hardening parity, review plateau Jaccard detection, browser-review artifact contract. |
| `Q00/ouroboros` | map/adopt contracts | Typed Workflow IR, validator, control directive contract, wall-clock watchdog events, staged evaluation pipeline, read-only event store, resume-session UX. |
| `infinri/Writ` | steal | Work modes, phase-gated writes, mandatory/retrieved rule split, structural gate for AI-proposed rules, authority/confidence ladder, pending-test enforcement. |
| `revfactory/harness` | map | Agent/team pattern taxonomy, orchestrator template, resumable `_workspace` artifacts, with-skill vs baseline eval loop. |
| `humanlayer/12-factor-agents` | adopt principles | Event-thread serialization, filesystem thread store, typed approval schema, human approval outer loop, compact-error retry limit. |

### Context, Indexing, And Token Control

| Repo | Verdict | Mechanisms Worth Carrying Forward |
| --- | --- | --- |
| `rtk-ai/rtk` | adopt | Hook rewrite model, command classification registry, failure-aware raw-output passthrough, bounded truncation, filter levels, doctor/test coverage. |
| `colbymchenry/codegraph` | adopt optional | Adaptive explore budget, inline output caps, line-numbered output, tool allowlist, FTS5 schema, git-aware discovery, lazy MCP init, catch-up sync gate. |
| `chopratejas/headroom` | steal/map | Auth-aware compression policy split, extensible compression lifecycle, session compression stats. Reject default proxy path because it mutates model base URLs and can silently return originals. |
| `zilliztech/claude-context` | map optional | Conservative ignore defaults, hashed collection names, Merkle snapshots, snapshot poison repair. Too heavy for default path. |
| `Martian-Engineering/lossless-claw` | map/steal | Bounded compaction config, deterministic caps/deadlines, assembler diagnostics, recall tools. Keep OpenClaw/private-history scope separate. |
| `VectifyAI/PageIndex` | reject/map docs only | Metadata -> structure -> tight page range retrieval is useful for documents, not codebase context. Silent empty-string retry fallback is a negative pattern. |

### Skills And Quality Gates

| Repo | Verdict | Mechanisms Worth Carrying Forward |
| --- | --- | --- |
| `millionco/react-doctor` | adopt optional | Changed-file narrowing, JSON report schema, fail-on levels, annotations, sticky PR comments, generated rule registry, false-positive workflow. |
| `hyhmrright/brooks-lint` | map/adopt companion | Symptom -> Source -> Consequence -> Remedy, `.brooks-lint.yaml`, prompt assembly, repo validator, review/audit/debt/test/health/sweep modes. |
| `addyosmani/agent-skills` | steal/map | Skill validator with owned exemptions, required sections, dead cross-skill reference checks, source-driven documentation hierarchy. |
| `mattpocock/skills` | steal/map | Feedback-loop-first diagnosis, human-in-the-loop repro script pattern, symlink-safe skill linking, dangerous-git hook. |
| `mukul975/Anthropic-Cybersecurity-Skills` | map selective | MITRE/NIST/OWASP taxonomy, `index.json`, frontmatter validation, security-domain catalog. |
| `ComposioHQ/awesome-codex-skills` | map only | Skill index, GitHub-path installer pattern, CI/comment skills already useful as external plugin source. |
| `JuliusBrussee/caveman` | reject behavior/steal infra | Installer dry-run, JSONC parser, idempotent hook add/remove, backup-before-write, markdown preservation checks. |
| `hardikpandya/stop-slop` | steal tiny subset | Phrase/style smell list for optional prose lint only. |

### Orchestration Platforms

| Repo | Verdict | Mechanisms Worth Carrying Forward |
| --- | --- | --- |
| `EveryInc/compound-engineering-plugin` | steal/map | Multi-target plugin conversion, Codex compatibility block, review persona routing, plan U-ID/test-scenario ideas. |
| `Yeachan-Heo/oh-my-claudecode` | steal | Full hook lifecycle coverage, project session manager, subagent tracker, verification module, regression suite. Runtime surface is too large. |
| `gsd-build/get-shit-done` | adopt benchmark | `.planning` state, workflow guard, context monitor, phase gates, command manifest/router, Windows-safe test chunking. |
| `github/spec-kit` | steal/adopt gates | Spec/checklist/task pipeline, offline bundled assets, extension hooks, branch/task scripts. |
| `bytedance/deer-flow` | steal primitives | Persistent MCP sessions, loop detection, tool-output externalization, subagent limit middleware, prompt-security tests, skill archive safety. |
| `ruvnet/ruflo` | map/reject runtime | Hook quoting/smoke ideas and category marketplace only; auto-allow MCP and broad runtime claims are risk flags. |
| `multica-ai/multica` | map/steal concepts | Per-task isolated execution env, sidecar manifest cleanup, native nested agents disabled unless modeled. |
| `rowboatlabs/rowboat` | map/steal workflow model | Sequential handoffs, conversational vs internal agents, pipeline state manager language. |

## Existing Snapshot Impact

Already present in `docs/research/top10-lock.json`:

- `compound-engineering-plugin`
- `oh-my-claudecode`
- `get-shit-done`
- `spec-kit`

Keep those in the canonical competitor lock until intentionally refreshed. Use this file to decide what the next lock refresh should add:

- Add `rtk` as first-class utility benchmark.
- Add `codegraph` as optional local-code MCP benchmark.
- Add `Writ` as phase/rule-enforcement benchmark.
- Add `react-doctor` as optional framework-specific quality-gate benchmark.
- Consider adding `claude-code-harness` if the next research extraction supports its script-heavy evidence.

## Pilot Measurement Criteria

- CodeGraph value is counted when it is used before source edits for impact discovery, symbol relationships, cross-file navigation, or code-health investigation. Late use after manual exploration is useful only when it produces downstream evidence; it is not autonomous value.
- Beads value is counted only for durable backlog, dependency, claim, blocker, or discovered-follow-up state before planning, before a resumed task, or between ETRNL runs. Beads use that duplicates an active execution ledger is noise.
- Weekly decisions come from `tool-effectiveness.mjs summarize --since-days 7 --all --projects-config "$HOME/.claude/control-plane/tool-effectiveness/projects.json" --json`, not manual transcript review.
- Verdicts are advisory during the first week unless fixture/schema/privacy gates fail. Public tracked files may include only synthetic project-registry examples; real continuous-project paths stay local.

## 2026-06-05 Compact Context Decisions

The compact-state rewrite carries forward these patterns:

- Steal bounded handoff structure from `claude-code-harness`, `Writ`, and `oh-my-claudecode`: the recovery packet is current task, last safe state, next action, and stale verification, not a broad memory replay.
- Keep Claude native compaction as the trigger. Do not build a second compactor based on tool counts or context guesses.
- Use local append-only ETRNL JSONL for compact lifecycle state. It is cheaper and more reversible than starting with Beads, Dolt, vector stores, or model summarization in hook hot paths.
- Treat companion compact hooks as rejected-by-default unless explicitly accepted: `suggest-compact.sh`, `pre-compact-context.sh`, `log-compact-event.sh`, and `pre-compact-backup.sh` can add noise or timing ambiguity.
- Count Beads value only when it records backlog, blockers, dependencies, claims, or discovered follow-ups outside active ETRNL execution. Duplicating current tasks, phases, checks, or compact packets is noise.
- Keep Dolt as a future projection option only after JSONL state proves a query bottleneck.

## Non-Adoption Notes

- Do not vendor large skill catalogs (`ComposioHQ/awesome-codex-skills`, `Anthropic-Cybersecurity-Skills`, `agent-skills`) into startup context.
- Do not install model-proxy/compression tools by default (`headroom`) because they mutate model routing and can hide failures.
- Do not adopt product platforms (`deer-flow`, `ruflo`, `multica`, `rowboat`) as runtime dependencies.
- Do not import tone-changing prose skills (`caveman`, `stop-slop`) as default behavior.
- Do not put private memory/transcript infrastructure into this public repo; keep OpenClaw/private-history tools as local rollout companions only.

## Evidence Pointers

- Starred repo inventory: `/tmp/victor-starred-repos.json`
- Candidate clone list: `/tmp/ccp-star-dive/candidates.txt`
- Main shallow clones: `/tmp/ccp-star-dive/*`
- Token/indexing lane clones: `/tmp/ccp-star-dive/token-indexing-os5nE3/*`
- Skill/quality lane clones: `/tmp/ccp-star-dive/20260602-225730/*`

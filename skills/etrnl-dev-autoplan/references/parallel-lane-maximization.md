# Parallel lane maximization (autoplan)

Load from `etrnl-dev-autoplan` when writing `## Parallelization strategy`, wave tables, or the tier-assessment execution-cost line.

Autoplan must **maximize safe concurrency**, not default to stack execute floors (Codex 2 / Claude 3). Those floors apply only when the plan leaves `maxConcurrentLanes` unset.

## Workflow

1. **Inventory packets** — list every task group with exact write paths, read-only scope, and dependencies.
2. **Mark chokepoints** — shared files, install surfaces, device sessions, global schedulers, gate scripts, and integration-owned merges must serialize; name the single integration owner.
3. **Build waves** — group packets with **disjoint write scopes** and satisfied dependencies into the same wave. Split a wave when scopes overlap or a dependency is unmet.
4. **Set the cap** — `maxConcurrentLanes = min(6, largest wave of parallel-safe packets)`. The packet validator allows 1–6; never exceed 6.
5. **Author the contract** — close `## Parallelization strategy` with an explicit line:

   `maxConcurrentLanes=N` — justified by `<wave-id>`: `<packet>`..`<packet>` are disjoint on `<path roots>`; `<chokepoints>` serialize under `<owner>`.

6. **Size each wave** — `waveSize` in execute packets must not exceed `maxConcurrentLanes`. Use fewer, wider waves over many tiny serial waves when scopes stay disjoint.
7. **Read-only fan-out** — scouts, spec/quality/adversarial reviewers, and provenance lanes run beside implementers when they are read-only and inspect frozen diffs; count them toward the same cap unless the plan names a separate review-only budget in prose.

## Required plan content

Every tier ≥ 2 plan with two or more task groups must include:

| Element | Requirement |
| --- | --- |
| Wave table or phase parallel column | Which packets run together after dependencies |
| Serialized list | Shared paths, device sessions, and integration owners |
| Explicit `maxConcurrentLanes=N` | Integer 1–6; autoplan chooses the **maximum** safe value, not the host default |
| Tier assessment line 3 | Repeat the cap: `Execution cost shape: … maxConcurrentLanes=N …` |

## Anti-patterns (do not autoplan these)

- Copying `maxConcurrentLanes=2` or `3` without a wave analysis.
- Parallelizing packets that both edit `CMakeLists.txt`, root Gradle, shared entry/handshake/report files, or the same device session.
- Raising the cap above 6 — split into more waves instead.
- Omitting the explicit integer — execute falls back to Codex 2 / Claude 3 and underuses parallelism.

## Codex execute handoff

Codex honors a plan-authored cap through spawn guard (`record-spawn-registry` + `check-spawn`). For Codex to spawn above the profile floor:

1. Plan declares `maxConcurrentLanes=N` (N > 2 when justified).
2. Register `~/.codex/hooks/spawn-guard-pre-tool-use.sh` in `config.toml` (enforce mode).
3. On Large / ≥3 task groups, record `batch-execution-adopted` before the first reviewer or before opening another lane.
4. Every spawn uses explicit Luna/low read-only or Terra/medium|high write models — never inherit the parent Sol model.
5. Close each lane with `close_agent` + `record-subagent` so burst accounting releases slots for the next wave.

Experiment-only env override: `ETRNL_MAX_CONCURRENT_LANES` wins over the plan cap; do not use for routine autoplan.

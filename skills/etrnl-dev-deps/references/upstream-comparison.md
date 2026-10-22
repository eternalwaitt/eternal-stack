# Upgrade Deps: Source Comparison

Reviewed 2026-10-22. This is maintenance provenance, not runtime instructions or a claim of benchmark superiority. The four compared skills informed an original integration; their code and full prose are not vendored. Consult upstream license notices before copying implementation material.

| Source and reviewed revision | Useful mechanism incorporated | Limits or guidance not adopted |
| --- | --- | --- |
| [marcelorodrigo/dependency-updater](https://github.com/marcelorodrigo/agent-skills/blob/99d50948fbc18bce6107dafc74a92e86634acbc2/skills/dependency-updater/SKILL.md) | Complete repository/transition discovery, official version sources, file-level impact mapping, required/likely/not-applicable/unknown classifications, implementation handoff and planned-versus-executed verification. | Its plan-only scope becomes a distinct mode; authorized implementation remains available. |
| [Taze](https://github.com/antfu-collective/taze/blob/1cce3cf997fe6b4451e1af7e438481931569ae73/skills/taze/SKILL.md) | Recursive JSON inventory, explicit major/fixed/current coverage, catalog-aware edits, GitHub Actions and Node pin discovery. | Version candidates do not prove compatibility. No automatic broad write, permanent tooling install or assumption that all pins should move. |
| [levnikolaevich/ln-42-dependency-upgrader](https://github.com/levnikolaevich/claude-code-skills/blob/9ab066b993bb923c95b9d7e37914a1981d134f7e/plugins/implementation-suite/skills/ln-42-dependency-upgrader/SKILL.md) | Baseline/source binding, declared-versus-resolved distinction, platform/peer constraints, compatibility-graph batching, native lock generation, scoped recovery and verified behavior. | No universal artifact ledger, forced full-lifecycle ceremony or approval prompts for already authorized majors. The older indexed ln-32 path was stale; the live skill is ln-42. |
| [MIT Open Learning/dependency-updates](https://github.com/mitodl/agent-kit/blob/3ad58dddda9cf4bac343d463cfff9be387d85299/skills/process/dependency-updates/SKILL.md) | Whole-stack coverage across libraries, base OS/images, databases, providers and charts; changed-default research, usage mapping, coupled-family and runtime prerequisites, rebuild/smoke validation. | No universal runtimes-last sequence, assumption that ecosystems are independent, or patch/minor safety guarantee. Commands must be verified for the actual ecosystem/version. |

## Existing Eternal behavior retained and corrected

Retained: audit/report/upgrade/bot-PR modes, catalog consolidation, intentional divergence, peers/types/adapters/generated clients, security advisory triage, configured Knip checks, production-unused findings, repository gates, runtime smoke checks and scoped rollback.

Corrected: whole-file Git restoration could discard existing work; blanket approval requirements could stall an authorized full refresh; fixed batch ordering could violate runtime prerequisites; missing plan mode obscured predicted versus observed failures. Removed the unsupported Claude-specific frontmatter field from the portable entrypoint; Codex's `agents/openai.yaml` explicitly retains manual invocation. The standalone skill does not provision Eternal tooling.

pnpm-specific guidance is based on the official [migration](https://pnpm.io/migration), [catalog](https://pnpm.io/catalogs) and [12.0 release](https://pnpm.io/blog/releases/12.0) documentation, checked on the review date. Recheck these mutable sources for each real migration.

## Validation boundary

Schema/link checks validate packaging, not upgrade quality. A synthetic read-only planning exercise checks decisions under missing registry access, mixed peers, dirty manifests and private config; it does not prove all real migrations succeed. Runtime acceptance requires using the skill on an authorized upgrade and checking the resulting application/toolchain behavior.

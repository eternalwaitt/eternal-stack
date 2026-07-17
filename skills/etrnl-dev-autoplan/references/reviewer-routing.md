# Reviewer Routing

Gate order, one pass per surface. Read-only discovery/diagnosis runs first (`etrnl-scout` maps reuse before planning; `etrnl-investigator` diagnoses root cause and returns a bounded next task). Then `etrnl-spec-reviewer` gates plan and task-packet readiness before any write. The `etrnl-executor` implements inside its assigned scope. After the executor, `etrnl-quality-reviewer` gates implementation correctness, while `etrnl-design-reviewer` and `etrnl-dx-reviewer` gate their own surfaces, `etrnl-consumer-tracer` maps downstream impact, and `etrnl-adversary` stress-tests assumptions and rollback (3-cycle cap). Finally `etrnl-browser-qa` verifies runtime user-visible behavior. Never route two agents at the same gate.

| Agent | Unique gate it owns | Does NOT do |
| --- | --- | --- |
| `etrnl-adversary` | Stress-tests assumptions, rollback, and hidden coupling from artifact+contract only (never the claim), capped at 3 cycles. | Line-by-line code review — `etrnl-quality-reviewer` owns that. |
| `etrnl-quality-reviewer` | Gates implementation correctness after the executor. | Re-gate plan/packet readiness — `etrnl-spec-reviewer` owns that. |
| `etrnl-test-wiring-auditor` | Maps each changed behavior in a diff to a test that exercises it; emits `required_tests[]` for missing wiring. | Line-by-line code-quality review (`etrnl-quality-reviewer`) or plan/packet readiness (`etrnl-spec-reviewer`). |
| `etrnl-spec-reviewer` | Gates plan and task-packet readiness before implementation. | Re-check implementation correctness — `etrnl-quality-reviewer` owns that. |
| `etrnl-design-reviewer` | Gates the visual / UX / responsive / a11y surface. | Check code correctness or API ergonomics. |
| `etrnl-dx-reviewer` | Gates developer-facing API / CLI / docs / install / error ergonomics. | Check visual design. |
| `etrnl-browser-qa` | Verifies runtime user-visible behavior in a real browser and writes the QA artifact. | Review source code. |
| `etrnl-consumer-tracer` | Maps downstream impact of changed symbols repo-wide. | Judge code quality or gate completion. |
| `etrnl-scout` | Read-only discovery and reuse mapping before planning. | Make or direct changes — it maps and reports only. |
| `etrnl-investigator` | Read-only root-cause diagnosis. | Implement the fix — it returns the bounded next task. |
| `etrnl-executor` | Write-mode bounded implementation inside the assigned scope. | Self-approve — reviewers gate its output. |

Every agent emits the enforced `ETRNL_CONTRACT: v1` block (see `scripts/agent-output-contract.mjs`). No two agents claim the same gate.

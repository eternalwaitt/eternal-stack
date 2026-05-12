# Capability Matrix

<!-- Generated file. Do not edit manually. -->
<!-- Regenerate: node scripts/research-competitor-intel.mjs generate --manifest docs/research/top10-lock.json --evidence docs/research/capability-evidence.json --scorecard docs/research/parity-scorecard.json --out-dir docs/research -->

## Vocabulary

- `does/prompt_only`: present via instructions/prompts only.
- `does/script_enforced`: present with script-level enforcement.
- `does/hook_enforced`: present with hook-level enforcement.
- `does/test_enforced`: present and validated by tests.
- `partial/*`: partially implemented at the listed enforcement level.
- `does-not/none`: capability not present in this competitor snapshot.

Canonical location: this generated artifact is maintained at `docs/research/capability-matrix.md` and rebuilt via the command above.

| Competitor | tdd_enforcement | planning_depth | research_flow | subagent_orchestration | parallelism_safety | verification_gates | rollback_guardrails | telemetry_proactive |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gstack | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only |
| superpowers | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | partial/prompt_only |
| get-shit-done | does/script_enforced | does/hook_enforced | does/hook_enforced | does/hook_enforced | does/script_enforced | does/script_enforced | does/script_enforced | does/hook_enforced |
| context-packet | does-not/none | does-not/none | does/prompt_only | does-not/none | does/prompt_only | does-not/none | does-not/none | does-not/none |
| compound-engineering-plugin | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only |
| oh-my-claudecode | does/prompt_only | does/test_enforced | does/prompt_only | does/prompt_only | does/prompt_only | does/test_enforced | does/prompt_only | does/prompt_only |
| spec-kit | does/script_enforced | does/script_enforced | does/script_enforced | partial/script_enforced | does/script_enforced | does/test_enforced | does/script_enforced | does/script_enforced |
| spec-kitty | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only |
| shipyard | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only | does/prompt_only |
| reap | does-not/none | does/prompt_only | does/script_enforced | does/script_enforced | does/script_enforced | does-not/none | does/script_enforced | does-not/none |

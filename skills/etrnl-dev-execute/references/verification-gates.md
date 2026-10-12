# Verification evidence

When the workflow contract requires mechanical verification, run a check that exercises the changed behavior and retain its actual command and result. Prefer focused tests first, then the repository's relevant broader checks.

- Choose checks from repository documentation and existing scripts. Do not invent a successful result or report a command that was not run.
- For browser or user acceptance, record the observed flow and environment separately from static tests.
- A failed check is evidence too: preserve its output, determine whether it is pre-existing or introduced, and stop if the required gate cannot be satisfied.
- Use `execution-ledger.mjs run-check` for command-captured evidence when a ledger is active. Self-reported rows do not satisfy mechanical verification.
- Keep one stable logical check name across failing and passing attempts of the same gate (for example, `invoice-tests`, not `invoice-red` then `invoice-green`). Preserve the failed attempt; the later success supersedes that same gate rather than leaving an unrelated required failure unresolved. Different required gates still need their own results.
- `run-check` reserves its own verification and retry usage. Do not also call `record-budget-use --action retry` or another manual reservation for that same command attempt. Manual retry accounting is restricted to `--operation replan|redelegate|context-restore` work outside those helpers; bare or helper-owned retry reservations are rejected.
- The contract budget limits verification attempts. When it is exhausted, stop and report the exact unresolved result.

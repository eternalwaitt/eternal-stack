---
name: etrnl-audit-security
description: ETRNL security deep-audit category skill. Use when the user asks for a security audit, exploitable-bug review, injection review, authz review, secret-handling review, webhook/CSRF/origin review, file-upload parser review, dependency exposure review, or all_registered deep-audit security coverage.
---
# Security Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-security`; on update, ask update/snooze/continue.

Run the registered `security` deep-audit category with shared worklists and explicit exploitable-bug evidence. Do not report generic best practices as findings.

## Contract

1. Read `scripts/lib/deep-audit-categories.mjs` and verify the `security` registry entry.
2. Use `/etrnl-deep-audit --category security` or create the same artifact envelope locally.
3. Consume orchestrator worklists only. Do not create category-local inventories after shared worklists exist.
4. A finding must include source, sink, missing control, exploit sketch, reachability, confidence, impact, and remediation.
5. A clean check must include explicit non-findings: checked sources, checked sinks, controls observed, and why the exploit path is not reachable.
6. Treat unknown reachability, missing credentials, unavailable routes, or absent runtime fixtures as `source_limited`, not clean.
7. Keep secrets redacted. Do not print secret values; cite storage locations or variable names only.

## Checks

Run every registered security check:

- `sec-01-trust-boundary-validation`
- `sec-02-authz-tenant-isolation`
- `sec-03-secret-handling`
- `sec-04-injection-command-sinks`
- `sec-05-webhook-csrf-origin`
- `sec-06-file-upload-deserialization`
- `sec-07-dependency-exposure`

## Evidence

Use `references/audit-checks.md` for worklist definitions, evidence fields, non-finding shape, and report examples.

## Common Rationalizations

- "This route is admin-only, so authz is fine." -> Trace who reaches the sink. Prove the role check and tenant filter run before the data access; an admin-only label without a co-located check is `source_limited`, not clean.
- "The input is internal, no injection risk." -> Internal callers cross trust boundaries too. Trace source to sink for every SQL/shell/path/eval sink and confirm parameterization or escaping.
- "Secrets live in env vars, they never leak." -> Grep every log, error, telemetry, generated doc, and test fixture for the variable name. An env-sourced secret printed in a log line is a leak.
- "The webhook is behind a hard-to-guess URL." -> Obscurity is not a signature check. Confirm signature verification, replay prevention, and idempotency, or file the finding.
- "npm audit is noisy, the CVEs are not reachable." -> Reachability is the audit, not the excuse. Trace each flagged direct dependency to a live sink or mark it `source_limited` with the missing route named.

## Red Flags

- A DB query or repository call with no `tenantId`/`locationId` filter co-located in the same handler or data-access path (seeds `sec-02` cross-tenant read/write rule).
- String-concatenated SQL, `$queryRawUnsafe`, shell exec built from request data, `path.join` on unsanitized input, or `eval`/dynamic-`import` fed by a source (seeds `sec-04` injection sink rule).
- A secret variable name (`*_KEY`, `*_TOKEN`, `*_SECRET`, `DATABASE_URL`) appearing inside a `logger.*`, `console.*`, error message, or committed fixture (seeds `sec-03` secret-in-log rule).
- A webhook or callback handler that reads a payload before verifying an HMAC/signature, or with no replay/idempotency guard (seeds `sec-05` unverified-webhook rule).
- File-upload or archive-extraction code with no MIME/extension allowlist, no size limit, or a decompression target outside a contained directory (seeds `sec-06` path-traversal/zip-slip rule).
- A CI workflow using `pull_request_target` with a checkout of untrusted head plus secret access (seeds `sec-05`/`sec-07` secret-exfiltration rule).

## When NOT to use

- Non-security correctness, complexity, or dead-code health across the whole repo: use `etrnl-audit-code`.
- Performance, latency, bundle size, or query timing regressions with no exploit path: use `etrnl-audit-performance`.
- Toolchain, hook, lint, or CI-gate configuration defects with no attacker source: use `etrnl-audit-tooling`.
- Per-PR review of a single diff for spec fit or reviewer sign-off: use `etrnl-quality-reviewer` and `etrnl-spec-reviewer`.

## Verification

PASS/FAIL checklist. Any FAIL means the run is incomplete:

- The `security` registry entry in `scripts/lib/deep-audit-categories.mjs` resolves with all seven `sec-0N` checks and their required worklists present.
- Every reported finding carries source, sink, missingControl, exploit, reachability, confidence, impact, and remediation.
- Every clean check states checked sources, checked sinks, controls observed, why the exploit path is unreachable, and validation evidence.
- Every unknown reachability, missing credential, or absent runtime fixture is filed as `source_limited`, not clean.
- No secret value prints anywhere in the artifact; storage locations and variable names redact the value.

Red-capable gate. This command exits non-zero when the security registry entry, its worklists, or the artifact envelope break:

```
node scripts/deep-audit-artifact-check.mjs validate-registry --root .   # expected exit 0; non-zero => security registry/worklist defect
```

---
name: etrnl-audit-security
description: ETRNL security deep-audit category skill. Use when the user asks for a security audit, exploitable-bug review, injection review, authz review, secret-handling review, webhook/CSRF/origin review, file-upload parser review, dependency exposure review, or all_registered deep-audit security coverage.
---
# Security Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-security`; on update, ask update/snooze/continue.

Run the registered `security` deep-audit category with shared worklists and explicit exploitable-bug evidence. Do not report generic best practices as findings.

## Contract

1. Read `scripts/lib/deep-audit-categories.mjs` and verify the `security` registry entry.
2. Use `/etrnl-audit --category security` or create the same artifact envelope locally.
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

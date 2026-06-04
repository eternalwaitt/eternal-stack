# Security Deep-Audit Checks

Security findings must be exploitable or clearly reachable. Do not score generic hardening advice as a finding.

## Required Finding Shape

Every security finding must include:

- `source`: entrypoint, route, job, component, or external input source.
- `sink`: sensitive operation, query, command, parser, authz decision, state mutation, credential use, or outbound call.
- `missingControl`: validation, authorization, escaping, signature check, CSRF/origin check, path containment, secret boundary, dependency patch, or parser guard that is absent or ineffective.
- `exploit`: concrete abuse path with sanitized payload or step outline.
- `reachability`: whether an attacker, tenant, user role, webhook sender, uploaded file, CI actor, or dependency input can reach the sink.
- `confidence`: `high`, `medium`, or `low`, with evidence.
- `impact`: data exposure, privilege escalation, integrity loss, code execution, credential leakage, account takeover, denial of service, or supply-chain exposure.
- `remediation`: smallest source-owned fix and verification command.

## Required Non-Finding Shape

Every confirmed-clean check must state:

- checked sources;
- checked sinks;
- controls observed;
- why the exploit path is not reachable;
- validation or test evidence.

## Check `sec-01-trust-boundary-validation`

Worklists: `sec_entrypoints`, `sec_inputs`.

Inspect external request bodies, query params, headers, form data, queues, imports, browser events, and third-party callbacks. Confirm schema validation and type normalization at boundaries.

## Check `sec-02-authz-tenant-isolation`

Worklists: `sec_authz`, `sec_entrypoints`.

Inspect role checks, tenant filters, account ownership, admin-only paths, object-level authorization, and data access helpers. Confirm enforcement is co-located with handlers or data access paths.

## Check `sec-03-secret-handling`

Worklists: `sec_secrets`.

Inspect env reads, config loading, logs, errors, telemetry, generated docs, test fixtures, and install/update scripts. Report secret values only as redacted variable names or storage locations.

## Check `sec-04-injection-command-sinks`

Worklists: `sec_sinks`, `sec_inputs`.

Inspect SQL/raw queries, shell commands, path joins, redirects, template rendering, dynamic imports, eval-like APIs, and URL construction. Trace source to sink before reporting.

## Check `sec-05-webhook-csrf-origin`

Worklists: `sec_webhooks`, `sec_entrypoints`.

Inspect webhook signature verification, replay prevention, idempotency, CSRF tokens, origin checks, callback allowlists, and pull_request_target-style secret exposure.

## Check `sec-06-file-upload-deserialization`

Worklists: `sec_uploads`, `sec_inputs`.

Inspect file type validation, size limits, path containment, archive extraction, image/document parsing, JSON/YAML/XML parsing, and object-storage metadata trust.

## Check `sec-07-dependency-exposure`

Worklists: `sec_dependencies`.

Inspect package manifests, lockfiles, native/postinstall scripts, vulnerable direct dependencies, auth libraries, parsers, and update constraints. Use current vulnerability evidence when available.

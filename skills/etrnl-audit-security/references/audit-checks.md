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

## Check `sec-08-authentication-session-abuse`

Worklists: `sec_entrypoints`, `sec_authz`, `sec_secrets`.

First determine the authentication provider and resolved version; use its native security model instead of applying a generic token recipe. Inspect sign-in, sign-up, verification, password reset, recovery, OAuth callbacks, MFA/passkeys, session creation/refresh/revocation, logout, privilege changes, and client credential storage.

Confirm all applicable controls:

- browser credentials remain in `HttpOnly`, `Secure` cookies with appropriate `SameSite`, domain, and path scope; no session, bearer, reset, or OAuth token is persisted in Web Storage, URLs, logs, analytics, or error payloads;
- responses, status shapes, redirects, timing, and visible side effects do not enumerate accounts;
- login, signup, reset, resend, OTP, backup-code, and recovery endpoints have route-specific limits by trustworthy network identity and account key, backed by shared storage when instances scale horizontally;
- reset/verification URLs come from configured trusted origins, tokens are random, expiring, single-use, replay-safe, and invalidated when superseded;
- password reset, compromise recovery, factor removal, role change, deletion, and banning revoke or re-evaluate affected sessions according to an explicit product decision;
- privileged accounts and high-impact actions have an explicit MFA/passkey or step-up decision, protected enrollment/removal, backup-code handling, and recovery path;
- OAuth state/nonce/PKCE, trusted origins, account linking, proxy IP headers, session freshness, cookie cache revocation latency, and cross-subdomain scope match the deployed architecture;
- passwords use a memory-hard hash and acceptable length policy; breached-password screening is considered for the product risk without disclosing full passwords to third parties.

For Better Auth projects, load the bundled `better-auth` skill and the relevant reference for the resolved package version. Missing runtime fixtures for timing, proxy, multi-instance rate limiting, cookie flags, or revocation are `source_limited`, not confirmed clean.

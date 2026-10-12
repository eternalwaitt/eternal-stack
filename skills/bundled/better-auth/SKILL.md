---
name: better-auth
description: |
  Better Auth integration guidance for TypeScript applications. Use when configuring authentication, sessions, social sign-in, organization membership, passkeys, two-factor authentication, or security-sensitive auth flows. Follow the version and framework actually present in the target project.
license: MIT
metadata:
  author: oakoss
  version: '1.2'
---

# Better Auth integration

This capability is an implementation checklist, not a version-pinned API manual. Read the target project's installed `better-auth` version, framework adapter, auth configuration, database schema, and existing tests first. Confirm option names and migration steps in the official documentation for that version before changing code; do not copy remembered API shapes from this guide.

## Before changing authentication

1. Trace the existing sign-in, callback, session-read, session-write, sign-out, and authorization paths. Identify which code runs on the server and which data reaches the browser.
2. Inspect the lockfile and database adapter. Use the adapter and migration workflow already supported by the project unless the user requests a migration.
3. Find existing middleware and resource-level authorization. Authentication proves an identity; it does not by itself authorize access to an organization, tenant, record, or action.
4. Check the official Better Auth documentation for the exact features involved. Documentation and plugins can change independently of this installed skill.

## Security review

- Keep secrets in the project's secret manager or environment configuration. Do not put credentials in source, prompts, logs, generated examples, or tracked test fixtures.
- Validate allowed origins, callback URLs, cookie settings, proxy behavior, and CSRF protections against the deployment topology and the installed Better Auth version.
- Enforce authorization on the server for every protected resource. For organization-scoped data, validate membership and role for the requested operation; do not trust client-supplied organization identifiers or UI state.
- Review account linking, email verification, password reset, MFA, passkey, and session-revocation behavior when those features are changed. Avoid weakening verification or freshness checks to make a flow pass.
- Treat auth schema changes as migrations. Preserve existing sessions and accounts according to the project's explicit rollout plan; do not generate or apply migrations without checking their contents.

## Verification

Use the repository's existing test commands and add or update coverage for the changed security boundary. At minimum, consider unauthenticated access, an authenticated user without the required role, cross-organization/resource access, invalid or expired credentials, and the intended success path. Verify the adapter-generated schema and migration against the installed package version. Report any untested deployment-specific behavior instead of claiming it is secure by inspection alone.

## Official references

- [Better Auth introduction](https://better-auth.com/docs/introduction)
- [Security reference](https://better-auth.com/docs/reference/security)
- [Session management](https://better-auth.com/docs/concepts/session-management)
- [Cookie behavior](https://better-auth.com/docs/concepts/cookies)
- [Organization plugin](https://better-auth.com/docs/plugins/organization)
- [Options reference](https://better-auth.com/docs/reference/options)

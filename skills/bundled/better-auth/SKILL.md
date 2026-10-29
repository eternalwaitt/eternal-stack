---
name: better-auth
description: Configure, review, and harden Better Auth in TypeScript applications, including sessions, email/password, password reset, social login, 2FA/passkeys, organizations, rate limiting, cookies, CSRF, and trusted origins. Use when a project depends on Better Auth or is choosing its authentication architecture; do not replace an existing provider without an explicit migration request.
license: MIT
metadata:
  author: better-auth and Eternal Stack maintainers
  version: '1.3'
---

# Better Auth

This capability is an implementation and security checklist, not a version-pinned API manual. Read the target project's installed `better-auth` version, framework adapter, auth configuration, database schema, existing authorization boundaries, and tests first. Use documentation that matches the resolved package version: inspect the lockfile first, then the package manifest, and confirm option names and migrations against the [official version index](https://better-auth.com/llms.txt).

## Architecture

Prefer Better Auth's cookie-backed session flow for browser applications. Do not build a parallel access-token/refresh-token system merely because generic backend guidance mentions JWTs. Use bearer or JWT flows only when a non-browser client, separately deployed verifier, or interoperability requirement actually needs them, and document the trust boundary.

Keep authentication and authorization separate: a valid session identifies the actor; server-side policy still decides whether that actor may access the tenant, object, or operation.

## Setup

- Keep `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in the environment or secret manager. Production secrets need at least 32 characters and adequate entropy.
- Configure the database adapter using ORM model names, not physical table names.
- Configure `trustedOrigins` narrowly and review every callback/redirect origin.
- Keep CSRF and origin checks enabled. Do not disable them to resolve a local integration problem.
- Re-run the Better Auth CLI schema generator after adding or changing plugins, using the CLI version compatible with the project.
- Configure the real client IP only from trusted proxy headers; otherwise rate limits can be bypassed or can collapse many users into one identity.

Read [configuration and deployment](references/configuration.md) when changing server config, cookies, proxies, providers, plugins, or production settings.

## Sessions

Session tokens stay in `HttpOnly`, `Secure` production cookies with an appropriate `SameSite` policy. Never copy browser session or bearer credentials into `localStorage` or `sessionStorage`. Review expiration, refresh, cookie cache, revocation, privileged-session freshness, password-reset revocation, and cross-subdomain scope.

Read [session management](references/sessions.md) for any session, cookie, cache, logout, revocation, or cross-origin change.

## Email and password

Treat sign-in, sign-up, verification, password reset, and account recovery as one abuse surface. Responses and timing must not reveal whether an account exists. Rate-limit by trustworthy network identity and account key, use single-use expiring reset tokens, construct reset URLs from configured trusted origins, and revoke existing sessions after a successful reset when the product's risk warrants it.

Read [email and password](references/email-password.md) before implementing or auditing credentials and recovery.

## Strong authentication

Require step-up authentication for privileged or high-impact actions. Prefer phishing-resistant passkeys where product and platform support make them practical; otherwise use TOTP with protected backup codes and a tested recovery path. SMS/email OTP can be useful fallback mechanisms but are weaker factors.

Read [two-factor and passkeys](references/two-factor.md) when enabling 2FA, passkeys, trusted devices, backup codes, or recovery.

## Verification checklist

- Resolved Better Auth version and matching docs recorded.
- Secrets, base URL, trusted origins, proxy headers, cookie attributes, CSRF/origin checks, and account linking reviewed.
- Sign-in, sign-up, verification, reset, OTP, and recovery endpoints have enumeration-resistant responses and route-specific rate limits.
- Session storage, expiration, cache, revocation, logout, password-reset behavior, and privileged freshness verified.
- No browser credential appears in Web Storage, logs, URLs, analytics, or error payloads.
- Authorization and tenant/object ownership enforced server-side after authentication.
- Privileged accounts and sensitive actions have an explicit MFA/passkey or step-up decision.
- Plugin/schema changes regenerated and tested.

## Official sources

- [Better Auth documentation](https://better-auth.com/docs)
- [Better Auth security reference](https://better-auth.com/docs/reference/security)
- [Better Auth options](https://better-auth.com/docs/reference/options)
- [Better Auth sessions](https://better-auth.com/docs/concepts/session-management)
- [Official Better Auth skills](https://github.com/better-auth/skills)

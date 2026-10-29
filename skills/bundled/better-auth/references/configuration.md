# Configuration and deployment

Match every option to the project's resolved Better Auth version. Prefer official defaults unless a documented product or deployment constraint requires an override.

## Production boundary

- Load `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` from a secret manager or environment. Reject placeholder secrets and rotate suspected exposures.
- Force secure cookies in production. Keep `HttpOnly`; choose `SameSite` and domain scope from the actual cross-origin architecture.
- Keep CSRF and origin checks enabled. `trustedOrigins` is an allowlist, not a wildcard convenience setting.
- Validate OAuth callback, redirect, error, and new-user URLs against trusted origins. Keep state, nonce, and PKCE protections enabled.
- Review account linking explicitly. Do not automatically merge identities solely because an unverified email string matches.

## Rate limits and proxies

Production rate limiting must use storage shared by every application instance. In-memory counters are insufficient across horizontally scaled instances.

Use only headers written by a trusted reverse proxy to derive the client IP. Configure the proxy chain narrowly; trusting arbitrary `X-Forwarded-For` input lets attackers spoof identities and bypass limits. Apply stricter, route-specific limits to sign-in, sign-up, password reset, verification resend, OTP, backup-code, and recovery endpoints.

## Plugins and database

- Import plugins from their documented package paths for the installed version.
- Re-run the compatible CLI generate/migrate command whenever a plugin changes schema.
- Review admin impersonation, organization invitations, API keys, bearer tokens, and account-linking defaults before production.
- Ensure secondary storage failure behavior is understood for sessions, verification records, and rate limits.

## Deployment verification

Exercise the production hostname through the real proxy/CDN. Verify cookie flags in the browser, rejected untrusted origins, rate-limit behavior across two instances, safe OAuth redirects, and secret redaction in logs and telemetry.

Sources: [security](https://better-auth.com/docs/reference/security), [options](https://better-auth.com/docs/reference/options), and [official security skill](https://github.com/better-auth/skills/blob/main/security/SKILL.md).

# Session management

## Storage and cookies

For browser applications, keep the opaque session identifier in Better Auth's cookie flow. Production cookies remain `HttpOnly` and `Secure`; do not mirror session tokens, bearer tokens, reset tokens, or OAuth state into `localStorage` or `sessionStorage`.

Review the installed version's storage priority when using database sessions, secondary storage, cookie cache, or stateless sessions. A cookie cache changes revocation latency: choose a short cache lifetime for sensitive products and bump its version when global invalidation is required.

## Lifecycle

- Set expiration and refresh/update age from product risk, not convenience alone.
- Require a fresh or stepped-up session before password, email, payout, billing, admin, security-factor, or destructive-account changes.
- Provide current-device logout and all-device/session-list revocation where the product risk warrants it.
- Revoke other sessions after password change when requested and revoke all sessions after account compromise or recovery.
- Set password-reset session revocation deliberately; do not inherit a permissive default unnoticed.
- Rotate secrets using the version-compatible Better Auth mechanism and account for pending OAuth/SAML flows during incompatible rotations.

## Cross-origin and subdomains

Avoid cross-subdomain cookies unless multiple trusted applications require them. Scope domain and path narrowly, keep every participating origin trusted, and verify that a compromised sibling subdomain cannot set or shadow authentication cookies.

## Verification

Test expiry, refresh, logout, revocation, password reset, cache delay, concurrent devices, privilege changes, deleted/banned users, and stolen-cookie replay. Confirm credentials never appear in URLs, logs, analytics, client-readable storage, or error bodies.

Sources: [session management](https://better-auth.com/docs/concepts/session-management), [cookies](https://better-auth.com/docs/concepts/cookies), and [security](https://better-auth.com/docs/reference/security).

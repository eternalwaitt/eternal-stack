# Email, password, and recovery

## Enumeration resistance

Sign-in, sign-up, forgot-password, resend-verification, and recovery flows must not disclose whether an account exists through copy, status shape, timing, redirects, or email side effects visible to the caller. Use Better Auth's enumeration protections for the installed version and preserve comparable work for existing and nonexistent accounts.

## Passwords

- Use the framework's memory-hard default or a reviewed custom hash/verify pair. Never log or store raw passwords.
- Enforce reasonable minimum and maximum lengths, allow password managers and paste, and avoid composition rules that encourage predictable mutations.
- When product risk warrants breached-password screening, use a privacy-preserving service or local corpus; never send the full password to a third party.
- Rate-limit sign-in by trustworthy client identity and account key without turning account lockout into a denial-of-service primitive.

## Reset and verification

- Generate reset and verification URLs from configured trusted origins, not an untrusted `Host` or forwarded header.
- Use random, single-use, short-lived tokens stored with appropriate one-way protection when the framework/version supports it.
- Invalidate a token after use and when a newer reset is issued.
- Apply route-specific per-account and per-network limits to reset requests, verification resends, and token attempts.
- After reset, notify the user and revoke existing sessions according to the documented product decision; high-risk products should revoke all sessions.
- Never auto-login a reset request before the token and new password have been accepted securely.

## Verification

Compare responses and timing for existing and nonexistent accounts. Test replay, expiry, a second reset invalidating the first, host-header manipulation, concurrent requests, rate-limit behavior across instances, password-manager compatibility, and session revocation after reset.

Sources: [Better Auth options](https://better-auth.com/docs/reference/options), [OWASP authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), and [OWASP forgot password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

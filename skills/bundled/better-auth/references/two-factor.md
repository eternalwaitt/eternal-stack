# Two-factor authentication and passkeys

## Product decision

Require strong authentication for administrators, operators with sensitive data, payouts/billing, security settings, and other high-impact actions. Prefer passkeys/WebAuthn for phishing resistance when the supported platforms and recovery model are acceptable. TOTP is a practical second factor; email and SMS OTP are weaker fallbacks, not equivalent assurance.

## Enrollment and step-up

- Require a fresh primary session before enrolling, replacing, or removing a factor.
- Confirm enrollment with a successful challenge before marking the factor active.
- Require step-up for sensitive actions even when the base session is valid.
- Rate-limit challenges and recovery attempts by account and trustworthy network identity.
- Bind trusted-device state to a revocable, expiring server-side decision; do not treat a permanent client flag as proof.

## Backup and recovery

Protect backup codes like passwords, display them once, hash stored values, consume atomically, and allow regeneration that invalidates the previous set. Recovery must not be weaker than the account it recovers. Notify users when factors, trusted devices, or recovery methods change.

## Sessions and authorization

Verify the completed factor is reflected in the server-validated session used by the sensitive route. Client UI state is not proof. Revoke or re-evaluate sessions after factor removal, account recovery, privilege escalation, or suspected compromise.

## Verification

Test enrollment interruption, replay, clock skew, concurrent OTP attempts, backup-code double use, trusted-device expiry/revocation, recovery, factor removal, step-up bypass, and accessibility of every challenge flow.

Sources: [Better Auth two-factor plugin](https://better-auth.com/docs/plugins/2fa), [Better Auth passkey plugin](https://better-auth.com/docs/plugins/passkey), and [NIST digital identity guidance](https://pages.nist.gov/800-63-4/sp800-63b.html).

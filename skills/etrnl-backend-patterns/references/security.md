# Backend Security

Treat every request as hostile until proven otherwise. Validate at the boundary, deny by default, and keep secrets out of code and logs.

## Authentication

- If the project uses Better Auth or another established provider, follow that provider's native cookie/session model and version-matched instructions. Do not layer a custom JWT system beside it.
- For browser applications, keep opaque session credentials in `HttpOnly`, `Secure` cookies with an appropriate `SameSite` policy. Never persist auth, reset, or OAuth tokens in `localStorage` or `sessionStorage`.
- Use short-lived access tokens plus rotating, device-scoped refresh tokens only when a non-browser client or separately deployed verifier requires bearer authentication. Store refresh tokens hashed and verify issuer, audience, expiry, and rotation/reuse state.
- Sign JWTs asymmetrically when multiple independent services verify them; a same-origin browser app does not need JWTs merely for fashion.
- Hash passwords with a memory-hard algorithm supported by the selected provider. Never store or log raw credentials.

```ts
// Only for an architecture that actually requires independently verified bearer tokens.
const token = jwt.sign({ sub: user.id, roles: user.roles }, privateKey, {
  algorithm: "RS256", expiresIn: "15m", issuer: "etrnl", audience: "api",
})
```

## Authorization

- Check authorization after authentication, on every protected handler. Deny by default; grant by explicit rule.
- Model permissions with RBAC for coarse roles and ABAC for row-level ownership. Enforce ownership against the persisted record, not the request body.

```ts
function authorize(actor: Actor, action: string, resource: Resource) {
  if (!actor.permissions.has(action)) throw new Forbidden()
  if (resource.ownerId && resource.ownerId !== actor.id && !actor.isAdmin) {
    throw new Forbidden()
  }
}
```

## Input Validation

- Parse and validate every external input against a schema at the edge. Reject unknown fields. Treat query params, headers, and path segments as untrusted.
- Bind parameters in every query; never concatenate SQL. Encode output for the sink (HTML, shell, URL).
- Cap body size and array lengths to blunt resource-exhaustion payloads.

```ts
const CreateMarket = z.object({
  title: z.string().min(1).max(200),
  closesAt: z.coerce.date().min(new Date()),
}).strict()
const input = CreateMarket.parse(req.body)
```

## OWASP Top 10 Coverage

- Broken access control: enforce server-side checks; ignore client role claims.
- Injection: parameterize queries and commands.
- Cryptographic failures: enforce TLS; encrypt sensitive columns at rest.
- SSRF: allowlist outbound hosts for any user-supplied URL.
- Security misconfiguration: ship hardened defaults; disable debug endpoints in production.
- Vulnerable dependencies: pin versions and scan on every build.

## Secret Handling

- Load secrets from the environment or a secret manager. Keep them out of the repo, the image, and the logs.
- Rotate on a schedule and on suspected exposure. Scope each credential to one service.
- Redact tokens, keys, and PII in log middleware before serialization.

Route Better Auth flows through `better-auth` before applying generic token advice, broader hardening through `eternal-best-practices`, and tenant isolation through `tenant-isolation-patterns`, when installed.

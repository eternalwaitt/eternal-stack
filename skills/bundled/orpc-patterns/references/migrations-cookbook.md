# Migrations And Cookbook

## From tRPC

- Preserve nested router shape first.
- Add explicit input/output schemas.
- Move shared API shape into contracts if OpenAPI or public clients matter.
- Replace callers with `createORPCClient` and framework query utilities.
- Model UI-handled errors with `.errors(...)` and `safe(...)` or `createSafeClient`.

## From REST/OpenAPI

- If the OpenAPI spec is authoritative, generate an oRPC contract and review it.
- If code behavior is authoritative, write contracts from handlers and generate OpenAPI from oRPC.
- Keep route method, path params, query params, auth, and response schemas explicit.

## From Server Actions

- Keep plain Server Actions for small UI-local mutations.
- Move to oRPC when the mutation needs typed reuse, public API shape, OpenAPI, tests against a stable contract, or AI-agent-readable schemas.
- Use `.actionable()` when one procedure should support both paths.

## Form Validation

For OpenAPI/client form workflows, use `parseFormData` and `getIssueMessage` from `@orpc/openapi-client/helpers` when bracket-notation form fields match schema paths.

## Cached Reads

- Mark read procedures with `route({ method: "GET" })`.
- Configure `RPCLink.method` to return `GET` only for safe reads.
- Use client context to pass cache controls when a framework supports them.

## Typed Error Branch

```ts
const [error, data, isDefined] = await safe(client.project.create({ name }));

if (isDefined && error.code === "NAME_TAKEN") {
  return { field: "name", message: `Name ${error.data.name} is taken` };
}

if (error) throw error;
return data;
```

## Common Review Nits

- Missing `.output(...)` on public procedures.
- `OpenAPIHandler` used where `RPCHandler` should serve normal clients.
- GET client calls without procedure `route({ method: "GET" })`.
- Contract-first implementation missing `.router(...)`.
- Minified contract used with request/response validation plugins.
- File/blob or stream procedures accidentally included in batch groups.
- Server router runtime-imported into browser code instead of type-only imported.

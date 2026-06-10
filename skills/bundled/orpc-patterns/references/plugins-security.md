# Plugins And Security

## Handler Plugins

- `CORSPlugin` from `@orpc/server/plugins`: configure allowed origins, methods, headers, and credentials.
- `BodyLimitPlugin`: reject oversized request bodies before procedure code runs.
- `CompressionPlugin`: compress responses when the runtime/framework does not already handle it.
- `StrictGetMethodPlugin`: enforces that only procedures marked `method: "GET"` accept GET. HTTP adapter enables this by default.
- `SimpleCsrfProtectionHandlerPlugin`: use when cookie auth needs stricter CSRF protection.
- `BatchHandlerPlugin`: server half of request batching.
- `RethrowHandlerPlugin`: rethrow selected errors instead of returning normal oRPC error responses.

## Link Plugins

- `BatchLinkPlugin`: client half of batching. Less useful with HTTP/2/HTTP/3 multiplexing; exclude streaming and file/blob responses.
- `DedupeRequestsPlugin`: dedupe equivalent client requests, usually safe-read requests.
- `ClientRetryPlugin`: retry transport/procedure calls when not using TanStack Query retry.
- `RetryAfterPlugin`: retry according to server `Retry-After` headers.
- `SimpleCsrfProtectionLinkPlugin`: pair with the server CSRF plugin.

## Contract Validation Plugins

```ts
import { RequestValidationPlugin, ResponseValidationPlugin } from "@orpc/contract/plugins";

const link = new RPCLink({
  url: "/api/rpc",
  plugins: [
    new RequestValidationPlugin(contract),
    new ResponseValidationPlugin(contract),
  ],
});
```

These are best for contract-first development. Minified contracts remove schemas and cannot support these plugins.

## Security Checklist

- Keep CORS explicit; do not reflect every origin with credentials unless the API is designed for it.
- Use strict GET or CSRF protection for cookie-authenticated APIs.
- Put body limits on public upload or form endpoints.
- Keep OpenAPI reference UI patched and protected unless intentionally public.
- Do not log tokens, cookies, full headers, or raw request bodies by default.
- Treat generated OpenAPI clients/contracts as untrusted until schemas and auth metadata are reviewed.

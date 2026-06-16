# Testing And Monorepo

## Procedure Tests

Use server-side calls for fast unit/integration tests.

```ts
import { call } from "@orpc/server";

it("lists planets", async () => {
  await expect(call(router.planet.list, { cursor: 0 })).resolves.toEqual([
    { id: 1, name: "Earth" },
  ]);
});
```

For production-like tests, create a real handler and call it through fetch or a client link.

## Mocking

Use `implement(...)` to create fake procedure implementations for contract-first or frontend tests.

```ts
import { implement, unlazyRouter } from "@orpc/server";

const fakeList = implement(router.planet.list).handler(() => []);
```

If a router is lazy, unlazy it before implementing.

## Monorepo Type Safety

Use TypeScript project references when clients consume server/router types.

```json
{
  "references": [{ "path": "../server" }]
}
```

Server packages that expose types must set `"composite": true`.

## Documented Structures

Contract-first:

```txt
apps/api        # imports core-contract and implements it
apps/web        # imports core-contract and creates client/query utils
packages/core-contract
```

Service-first:

```txt
apps/api        # imports core-service and serves it
apps/web        # imports core-service types and creates client/query utils
packages/core-service
```

Hybrid:

```txt
packages/core-contract
packages/core-service    # implements core-contract
apps/api                 # serves core-service
apps/web                 # consumes core-contract/client types
```

## Pitfalls

- Avoid alias imports inside shared server components when linked workspace packages are available.
- Keep server-only dependencies out of browser bundles.
- If inferred types become `any`, check missing project references and missing transitive type packages.
- Generated clients published to npm need stable public contracts, not private implementation types.

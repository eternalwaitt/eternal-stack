# Contracts

## When To Use Contract-First

Use `@orpc/contract` when the API shape must be shared separately from implementation, when OpenAPI matters, or when multiple clients/teams consume the same API. Use direct `os` procedures for internal TypeScript-only APIs.

## Define Contract

```ts
import { oc } from "@orpc/contract";
import * as z from "zod";

export const projectContract = {
  list: oc
    .route({ method: "GET", path: "/projects" })
    .input(z.object({ cursor: z.string().optional() }))
    .output(z.object({
      items: z.array(Project),
      nextCursor: z.string().optional(),
    })),

  create: oc
    .route({ method: "POST", path: "/projects" })
    .input(Project.pick({ name: true }))
    .output(Project)
    .errors({
      NAME_TAKEN: { data: z.object({ name: z.string() }) },
    }),
};

export const contract = { project: projectContract };
```

## Implement Contract

```ts
import { implement } from "@orpc/server";

const builder = implement(contract).$context<{ headers: Headers }>();

export const router = builder.router({
  project: {
    list: builder.project.list.handler(({ input }) => listProjects(input)),
    create: builder.project.create.handler(async ({ input, errors }) => {
      if (await projectNameExists(input.name)) {
        throw errors.NAME_TAKEN({ data: { name: input.name } });
      }

      return createProject(input);
    }),
  },
});
```

Always finish root implementations with `.router(...)`; exporting a plain object after `implement(contract)` weakens contract enforcement.

## Router To Contract

Use router-to-contract when service code exists first and a client-safe contract boundary is needed. Unlazy lazy routers before converting. Minified client contracts are lighter but remove schemas, so client-side request/response validation plugins cannot use them.

## OpenAPI To Contract

Use OpenAPI-to-contract when an external OpenAPI spec is authoritative. Review generated schemas and route metadata before treating generated contracts as canonical.

## Package Boundaries

- Shared contract package: schemas, contracts, public types.
- Service package: implementations, context, auth, data access.
- Client package/app: links, query utilities, hydration, safe-client policy.
- Avoid runtime-importing server implementations into browser bundles; use type-only imports where possible.

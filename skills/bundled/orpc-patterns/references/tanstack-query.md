# TanStack Query

## Setup

```ts
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

export const orpc = createTanstackQueryUtils(client);
```

## Queries And Mutations

```ts
const list = useQuery(orpc.project.list.queryOptions({
  input: { cursor },
}));

const create = useMutation(orpc.project.create.mutationOptions({
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: orpc.project.key() });
  },
}));
```

## Defaults

Use `experimental_defaults` for central stale times, retries, and mutation invalidation defaults. Keep defaults near `createTanstackQueryUtils`; call sites can override them.

```ts
const orpc = createTanstackQueryUtils(client, {
  experimental_defaults: {
    project: {
      list: {
        queryOptions: { staleTime: 60_000 },
      },
    },
  },
});
```

## Conditional Queries

Prefer `skipToken` over `enabled: false` when input would otherwise be invalid.

```ts
import { skipToken, useQuery } from "@tanstack/react-query";

useQuery(orpc.project.search.queryOptions({
  input: search ? { search } : skipToken,
}));
```

## Infinite Queries

```ts
useInfiniteQuery(orpc.feed.list.infiniteOptions({
  input: (pageParam: string | undefined) => ({ cursor: pageParam, limit: 20 }),
  initialPageParam: undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
}));
```

## Query Keys

Use generated `.key()` helpers for invalidation. Custom keys are justified when partitioning cache by client context or coexisting with another query system.

## SSR Hydration

Use the oRPC/TanStack serializer path, such as `StandardRPCJsonSerializer`, when dehydrated data includes dates, maps, sets, blobs, files, or other rich RPC values.

## Retry

For React Query calls, prefer TanStack Query's `retry` option over generic oRPC retry plugins unless non-React callers share the same retry policy.

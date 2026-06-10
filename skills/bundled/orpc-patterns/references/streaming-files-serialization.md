# Streaming, Files, And Serialization

## Event Iterator

Use Event Iterator for typed unidirectional streams.

```ts
import { eventIterator, os } from "@orpc/server";
import * as z from "zod";

export const liveMessages = os
  .output(eventIterator(z.object({ message: z.string() })))
  .handler(async function* ({ signal }) {
    for await (const event of publisher.subscribe("messages", { signal })) {
      yield event;
    }
  });
```

Event Iterator does not automatically retry like browser SSE. Use retry plugins or Durable Iterator when recovery is required.

## WebSocket

Use WebSocket adapters for bidirectional, long-lived, or interactive sessions. Test on the real host because Bun, Node `ws`, CrossWS, Cloudflare, and browser runtimes differ.

## Durable Iterator

Use Durable Iterator when streams need reconnection, resume, or event recovery through a separate streaming service.

## AI SDK Streams

```ts
import { os, streamToEventIterator, type } from "@orpc/server";

export const chat = os
  .input(type<{ chatId: string; messages: UIMessage[] }>())
  .handler(async ({ input }) => {
    const result = streamText({ model, messages: await convertToModelMessages(input.messages) });
    return streamToEventIterator(result.toUIMessageStream());
  });
```

On clients using AI SDK internals, prefer `eventIteratorToUnproxiedDataStream` when structured cloning would reject proxied event data.

## File Upload And Download

Use schemas such as `z.file()` or `z.instanceof(File)`. For large files, prefer direct object-storage uploads and use oRPC for metadata/session creation.

## RPC JSON Serializer

The standard RPC serializer supports native rich values. For custom classes or domain value objects, configure matching custom serializers on both `RPCHandler` and `RPCLink`.

Use custom serializer type IDs greater than the built-in range to avoid collisions.

## SuperJSON

Use SuperJSON only when the project already standardizes on it or needs its semantics. Prefer the standard oRPC serializer when it covers the value shapes.

# Version Notes

## Checked Baseline

- Refreshed against oRPC `1.14.3`.
- Primary docs: `https://orpc.dev/llms.txt` and specific Markdown pages under `https://orpc.dev/docs/...`.
- Package source of truth: npm `@orpc/server`, `@orpc/client`, `@orpc/contract`, `@orpc/tanstack-query`, and GitHub `middleapi/orpc`.

## Refresh Rules

- Before version-sensitive edits, check current npm versions or GitHub releases.
- If official docs disagree with this skill, trust official docs and update the skill.
- Keep examples short and canonical. Avoid copying full docs into this pack.
- Treat `experimental-*` packages and APIs as drift-prone.
- Keep OpenAPI Reference Plugin usage patched at or above `1.13.9`; that release fixed a stored XSS issue.

## Known Drift Points

- `callable()` / `actionable()` routing behavior.
- WebSocket and Event Iterator adapters.
- Batch and retry plugin behavior.
- TanStack Query `experimental_defaults`.
- Contract generation from OpenAPI or routers.
- Serialization support for files, rich values, and custom classes.

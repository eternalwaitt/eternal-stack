---
name: etrnl-backend-patterns
description: ETRNL backend design orchestrator. Use when designing or building server-side systems - oRPC or REST/GraphQL APIs, data layers, auth, resilience, observability, or service architecture. Classifies the task and loads only the matching reference modules.
---
# ETRNL Backend Patterns

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-backend-patterns`; on update, ask update/snooze/continue.

Single entry point for backend design work. Load `references/routing.md` before choosing modules. Read only the reference files the task needs; do not preload the whole suite.

## Required Flow

1. Classify the request against `references/routing.md`.
2. Load the minimum reference set - one or two modules by default, at most three unless the user asks for a full backend review.
3. State the loaded modules in the first reply (`Loaded: api, security`).
4. Apply the loaded references to the user's task. Use vendored modules in this skill (`references/orpc.md`, `references/prisma.md`, `references/sql-optimization.md`) before external companions. Pull companion skills (`eternal-best-practices`, `better-auth`, `tenant-isolation-patterns`, `orpc-patterns`, `prisma-expert`, `sql-optimization-patterns`) only when the task crosses boundaries not covered by the loaded reference modules.
5. For auditing an existing backend, use `etrnl-audit-security` or `etrnl-audit-production` instead of this skill.

## Module Files

| Module | File |
| --- | --- |
| oRPC / typesafe API | `references/orpc.md` |
| REST / GraphQL contracts | `references/api.md` |
| Data layer | `references/data.md` |
| Prisma ORM | `references/prisma.md` |
| SQL optimization | `references/sql-optimization.md` |
| Security | `references/security.md` |
| Resilience | `references/resilience.md` |
| Observability | `references/observability.md` |
| Architecture | `references/architecture.md` |

## Full-Pass Mode

When the user asks for a full backend design review or end-to-end service blueprint, load every module in the table above in dependency-friendly order: architecture → data → prisma → sql-optimization → api → orpc → security → resilience → observability.

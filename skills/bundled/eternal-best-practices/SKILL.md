---
name: eternal-best-practices
description: "Reference patterns for multi-tenant SaaS engineering, with examples tied to a specific TypeScript/Next.js/Prisma/oRPC stack. Use only when the target project uses the matching technology and architecture; verify each recommendation against project policy and current framework documentation."
version: 4.0.0
source: unknown
category: workflow
---

# SaaS engineering reference patterns

Use when the target matches the TypeScript/Next.js/Prisma/oRPC examples. This is a library of engineering patterns, not a universal architecture or an enforcement boundary. Inspect the target's domain, dependency versions, trusted auth boundary and project rules first.

Read only the relevant subsection of the [preserved engineering guide](references/engineering-guide.md), selected by heading or symbol search. Do not load the entire guide for a focused change.

| Changed concern | Guide section / search heading |
| --- | --- |
| Cross-package architecture | [Architecture pattern](references/engineering-guide.md#example-architecture-pattern-pragmatic-hexagonal-architecture) |
| Auth, tenant data, money, retention | [High-impact patterns](references/engineering-guide.md#high-impact-policy-patterns-to-validate-in-the-target-project); select the matching numbered subsection |
| Errors, observability, retries, performance | [Recommendations](references/engineering-guide.md#-warning-level-rules-strong-recommendations); select by the affected behavior |
| Implementation examples | [Patterns](references/engineering-guide.md#-pattern-level-rules-best-practices); select the actual technology |
| Verification | [Pre-commit checklist](references/engineering-guide.md#-pre-commit-checklist), filtered to changed scope and project-required checks |

Retain these invariants where applicable: authorize tenant-owned reads and writes at the trusted boundary; preserve exact money and currency semantics; validate untrusted input; model partial failures and concurrency; use recoverable migrations; verify the producing path and its callers. Reuse the repository's established representation and architecture.

Labels such as BLOCKER, MUST or ALWAYS in the examples describe their original application context. Confirm applicability rather than importing those labels as project policy. Workflow requirements and work budgets belong to Eternal's canonical workflow contract, not this catalog. No guideline here authorizes a live operation, automatic dependency upgrade, or external message.

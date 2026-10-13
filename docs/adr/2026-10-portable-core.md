# Portable core and explicit orchestration

Status: superseded for current behavior by the v0.12.0 companion.

> Historical decision record. The guidance-only Core defined below is no longer the current candidate. The current design installs shared guidance, one native router, and a private on-demand library; see [product direction](../product-direction.md) and [host capabilities](../host-capabilities.md).

## Problem

The former default installed every workflow, global routing rule and strict Claude hook. It conflated available expertise with mandatory process. Codex received the same skill files but different enforcement and a replacement startup file incorrectly described as additive. Routine work inherited tool preferences, planning metadata, reviewer chains and maintenance actions intended for larger tasks.

## Decision

`core` installs only shared working guidance for Claude Code and Codex. Native host permissions, context recovery and project checks remain authoritative. The installer preserves existing instructions in place and records only its managed text. It does not register hooks, install skills/agents, configure services or update itself. Removal refuses to overwrite changed managed text.

The former package remains available through explicit `orchestrated` installation; `full` adds third-party companions. Core refuses to overlay a legacy installation because adding light instructions cannot neutralize old global rules, hooks or skills. Migration and live host validation are separate operations.

Ordinary work follows the task: inspect, change, verify, report. Plans, specialists and saved state are tools to use when needed, not fixed phases. Domain rules belong to the relevant project or a deliberately selected skill. No universal line-count rule, compulsory reviewer count or numeric completeness score belongs in the baseline.

## Capability disposition

| Surface | Decision | Reason |
| --- | --- | --- |
| Shared startup baseline and thin Claude import | Keep; shorten | Same working agreement on both hosts |
| Project verification, bounded handoffs, evidence honesty | Keep | Proves requested behavior and supports recovery |
| Prompt routing, pacing, question auto-answering, lexical style guards | Exclude from core | Broad activation and context/process overhead |
| Stop verifier and spawn guard | Optional orchestration only | Useful workflow checks, not host-neutral security boundaries |
| Execution/review ledgers and specialist chains | Explicit workflow only | Coordination cost should be justified by task scope |
| Deep performance audit | Optional, finite rounds | Default three rounds; incomplete work remains visible |
| Skill startup self-update | Remove prerequisite | Maintenance must not delay or mutate ordinary work |
| Automatic local updates | Opt-in only | A check should not silently change its own runtime |
| Bundled domain skills and inlined copies | Retain outside core | Expertise is useful, but provenance and version freshness vary |
| Third-party memory/backlog/navigation services | Explicit full profile | Separate lifecycle and configuration responsibilities |

## External comparison

These are design references, not adopted runtimes or a market-share ranking. No upstream code or prose is vendored by this reset.

- [AIOX](https://github.com/SynkraAI/aiox-core) distinguishes host compatibility, keeps canonical agent definitions and validates generated integrations. Borrow the explicit capability boundary, not mandatory story/persona handoffs. AIOX's own compatibility guide describes Codex hooks as limited relative to Claude.
- [Pi](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) demonstrates a small extensible runtime with optional skills and extensions. The useful lesson is a small default, not replacing the user's hosts.
- [Superpowers](https://github.com/obra/superpowers) packages a composable development method; [GSD Core](https://github.com/open-gsd/gsd-core) uses phases and fresh-context workers. These suit explicitly selected complex work, not universal per-task ceremony.
- [Spec Kit](https://github.com/github/spec-kit) separates processes and extensions; [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) provides structured collaborative planning. Preserve explicit requirements for large projects without requiring artifacts for trivial work.
- [gstack](https://github.com/garrytan/gstack), [ECC](https://github.com/affaan-m/ECC) and [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin) offer useful specialist workflows and operational patterns. Their larger catalogs are not evidence that every workflow should be installed or active by default.
- [Adobe's harness guide](https://github.com/adobe/ai-repo-harness-guide) separates repo instructions, invariants and optional skills. [Agent Skills](https://agentskills.io/specification) supports loading detail only when needed.

[OpenAI's guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) calls for narrow descriptions and progressive disclosure as models improve. [Claude's memory guidance](https://code.claude.com/docs/en/memory) explains that imports still consume startup context. [Codex's instruction documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md) defines same-directory override replacement. These favor a shared concise baseline with honest host adapters.

## Verification and limits

Core fixture tests exercise both hosts, existing instructions, Codex override precedence, idempotence, dry-run, removal, preservation and legacy refusal. Optional package tests still run; the core test is part of doctor. Performance contract tests reject unbounded round counts and false completion after new findings.

This reset reduces default activation. It does not establish live host parity, repair every inherited domain example, or automatically migrate existing installations. Optional workflows still carry legacy complexity. Before promoting any into core, measure whether it improves representative task outcomes, correction rate, tool calls and elapsed time. Passing schema checks alone is not that evidence.

The original reset was recorded under `Unreleased`; it ships with the integrated companion in v0.12.0 under `docs/RELEASING.md`.

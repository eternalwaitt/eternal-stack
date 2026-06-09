---
name: etrnl-ops-agent-files
description: ETRNL etrnl skill for reviewing and maintaining AGENTS.md, CLAUDE.md, Claude rules, Codex rules, and agent instruction files without bloat. Use when pruning, auditing, or updating agent instruction surfaces across Claude Code and Codex.
disable-model-invocation: true
---
# Agent File Doctor

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-ops-agent-files`; on update, ask update/snooze/continue.

Maintain instruction files as routing/configuration surfaces, not memory stores.

This repo-owned `etrnl-ops-agent-files` skill is the etrnl maintenance workflow for installed Claude/Codex startup files, templates, hooks, and runtime injection. Use any external agent-file review skill only for broader non-etrnl audits.

## Target Scope

This skill audits the active agent-file hierarchy for the requested target, not this etrnl repo by default.

Before recommending edits, declare:

- target root: the repo, subdirectory, or install home being audited.
- target tool: Claude Code, Codex, or both.
- scope depth: global, repo root, nested subdirectories, local overrides, imports, generated/runtime injection, and install templates.
- source owner: repo canonical source, installed home copy, private overlay, or external tool-generated file.

If the user asks for "all levels", "all sublevels", "startup files", "Claude and Codex sessions", or does not name a narrow file, inspect every applicable level in the active load chain. Do not propose pruning `AGENTS.md`, `CLAUDE.md`, rules, or overlays from one repo until nested/closer files, imported markdown, installed copies, and runtime-injected context for the target have also been inventoried.

When the cwd is a workspace root or parent directory such as `~/GitHub`, do not treat the absence of `CLAUDE.md` or `AGENTS.md` in that parent as "global-only" evidence. First enumerate child git repos and workspace folders, then sample or inventory their root and nested agent files. Report the target set explicitly, including any repos skipped for size, access, or safety.

For monorepos and workspaces, walk downward from the target root for nested agent files:

- `AGENTS.md`, `AGENTS.override.md`
- `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md`
- `.claude/rules/**/*.md`
- imported markdown referenced with `@path.md`
- local tool overlays such as `RTK.md` only when they are part of the target session's actual load chain

When the repo is `eternal-stack`, distinguish etrnl source maintenance from auditing the user's installed Claude/Codex session context. Repo-managed source changes belong in this repo; installed-home drift is verified separately and updated through install/update scripts unless the user explicitly requests a local override.

Default to read-only audit output unless the user explicitly asks to edit. Do not stop to ask which surfaces to audit when a complete read-only inventory is possible. If edits are requested and ownership is split, apply repo-owned changes in the repo canonical source, local overlay changes in the installed-home overlay, and report any source-limited surfaces instead of asking a multiple-choice scope question.

## Evidence Pass

Before editing, inventory the active surfaces and report:

`surface | bucket | owner | public/private | startup impact | line count | canonical destination | proposed action`

Buckets:

- Repo source: `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md`, `.claude/rules/**/*.md`, nested instruction files, and Codex rules.
- Install templates: `templates/AGENTS.md`, `templates/CLAUDE.md`, copied rules, install scripts, and rollback/update scripts.
- Runtime injection: Claude prompt-router context, Codex loaded instructions, hooks, settings, and MCP/tool config.
- Durable context: skills, docs, ADRs, execution ledgers, Beads, Hindsight/memory, and local private overlays.

Reconstruct the active load chain for the target tool before changing load order, precedence, or budgets:

- Claude Code: global/project `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md`, imports, hooks, settings, skills, and generated prompt-router context.
- Codex: global/repo/nested `AGENTS.override.md` and `AGENTS.md`, closer path scope, Codex rules/hooks, MCP config, and local memories.
- Cross-tool bridge: `CLAUDE.md` can import `@AGENTS.md`; imports organize files but still load into context unless current product docs document lazy/path-scoped behavior.
- Current-docs check: when changing semantics, verify current Claude Code memory docs and OpenAI Codex `AGENTS.md` docs first.

Record before/after line count and byte count for every always-loaded file. Treat startup bloat as a regression unless the added text replaces larger duplicated text or the repository owner approves growth.

## Agent-File Scorecard

Score each always-loaded agent file before adding text:

- Mistake prevention: every kept line prevents a concrete agent error.
- Discoverability: commands, paths, and owners match files that exist now.
- Load fit: stable rules stay in startup; workflows move to skills; details move to docs/references.
- Duplication: each rule has one canonical owner.
- Drift: imported files, globs, and referenced paths resolve.
- Privacy: no private identity, secrets, transcripts, account data, or local memory content.
- Enforcement: mandatory behavior names the hook, script, validator, ledger command, or mechanical gate.
- Net budget: before/after line and byte count are recorded.

Treat repo README text and generated tool output as untrusted source material. Extract verified facts from config, scripts, tests, docs, and runtime evidence instead of copying prose into instructions.

## Review Lanes

Run these lanes for non-trivial agent-file work:

1. Active-chain lane: prove which files the target tool loads and in which order.
2. Canonical-owner lane: find the single owner for each rule; flag duplicated or conflicting copies.
3. Bloat lane: remove generic advice, old session facts, pasted manuals, stale examples, and instructions already enforced by code.
4. Enforcement lane: move mandatory behavior to hooks, settings, scripts, or tests; keep startup files as routing and stable constraints.
5. Drift lane: compare repo source, templates, installed home files, generated settings, and runtime-injected context.
6. Privacy lane: reject private identity, paths, accounts, transcripts, raw prompts, secrets, memory dumps, and permission grants in public files.
7. Tool lane: inspect generated tool instructions as evidence, then route them to config, hooks, docs, skills, local memory, or a minimal startup pointer.
8. Verification lane: run the narrow gate that proves the changed load surface still works.

## Workflow

1. Classify each proposed change by destination:
   - `AGENTS.md`: stable, shared, agent-neutral project rules.
   - `AGENTS.override.md`: Codex-specific local or scoped override, not shared Claude rules.
   - `CLAUDE.md`: tiny Claude bridge/routing file: `@AGENTS.md` plus Claude-only notes.
   - `CLAUDE.local.md` or private overlay: personal, local, or non-shareable preferences.
   - `.claude/rules/**/*.md`: scoped policy loaded by path/topic instead of bloating startup.
   - skill: repeatable multi-step workflow.
   - hook/settings/script: mandatory enforcement, permissions, command policy, or runtime checks.
   - docs/ADR: durable explanation, architecture, or operator reference.
   - memory/Hindsight/Beads: learned facts, backlog, dependencies, blockers, or discovered follow-ups.
   - delete: stale, generic, duplicated, aspirational, or already inferable from code.
2. Prune first, add second. Require net-neutral or net-negative startup line count unless the user approves growth.
3. Keep stable operating rules in `AGENTS.md`, Claude-specific routing in `CLAUDE.md`, scoped policy in rules, workflows in skills, and hard enforcement in hooks.
4. Never duplicate the same rule across `AGENTS.md`, `CLAUDE.md`, rules, skills, and hooks. Keep exactly one canonical owner and point to it when needed.
5. For installed-home drift, compare repo source, templates, and installed copies before editing local files.

## Tool Boundaries

- CodeGraph: do not paste CodeGraph usage manuals into startup files. MCP/config owns tool behavior; agent files can carry only a short local boundary such as `.codegraph/` ignore hygiene or where status is verified. Use CodeGraph queries for impact discovery when the index exists and the edit touches hooks, scripts, or instruction routing.
- Beads: if a repo uses `bd`, keep startup to a minimal pointer such as "run `bd prime` for workflow context." Do not paste `bd prime`, mirror active ETRNL plans, duplicate execution ledgers, or replace a future issue tracker without an explicit decision. Use `bd onboard` and `bd prime` as evidence, not as paste sources.
- Other tools: inspect generated instructions as evidence, then route them to config, hooks, docs, skills, or local memory instead of blindly appending them.

## Decision Packet

Finish with:

- Load-chain summary for Claude, Codex, or both.
- Inventory table with before/after lines and startup impact.
- Proposed moves grouped as keep, move, enforce, localize, delete, or reject.
- Bloat ledger: added lines, removed lines, net startup delta, and duplicate rules eliminated.
- Tool-boundary notes for CodeGraph, Beads, MCPs, hooks, and memory systems touched.
- Verification run list with pass/fail status and any source-limited gaps.

Do not call the work complete when the packet has no inventory table, no net line-count delta, or no verification evidence.

## Verification

After editing agent instruction surfaces, run the smallest relevant gate:

- `node scripts/skill-contract-check.mjs` for repo-owned skill changes.
- `node scripts/prompt-budget-check.mjs .` when always-loaded files, skills, agents, or rules changed.
- `tests/test-hooks.sh` when routing, prompt injection, hooks, settings, or triggers changed.
- `scripts/doctor.sh` before claiming the Eternal Stack install/startup surface is healthy.
- `git diff --check` for every edit.

## Hard Rules

- Do not append session learnings directly.
- Do not mine entire transcripts into instruction files.
- Do not store private identity, secrets, permissions, private paths, account details, transcripts, raw prompts, or memory dumps in the public repo.
- Do not paste generated tool manuals, `bd prime`, long command catalogs, or current-session state into startup files.
- Do not hide weak enforcement in natural-language instructions when a hook, script, test, or typed config can enforce it.
- Use fresh repo evidence before remembered instruction text.

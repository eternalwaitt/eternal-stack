---
name: etrnl-ops-context-save
description: ETRNL context-save workflow for Claude Code and Codex. Use when saving progress, preparing handoff, preserving decisions before compaction, or recording remaining work across sessions.
disable-model-invocation: true
---
# ETRNL Context Save


The project's bound state overview owns durable feature status, pending work and curated project lessons. During authorized implementation, reconcile it before saving a private handoff; follow `docs/project-state.md`. Do not replace that overview with a host-local context snapshot.

Save compact, local-only workflow context. Do not store private transcripts, credentials, API keys, account data, or raw chat logs.

Save only durable continuation material:

- `decision`: chosen path and rejected alternatives.
- `pattern`: reusable implementation or verification pattern.
- `preference`: stable user or repo preference.
- `fact`: verified repo/runtime state with timestamp or command.
- `solution`: repeated problem, fix, and verification.

Skip transient thoughts, raw chat, secrets, large logs, speculative claims, and details recoverable from git or current files.

## Workflow

1. Summarize the current goal, branch, important decisions, blockers, remaining work, and verification state.
2. Save the context:
   - `node {{ETRNL_COMPANION}} run scripts/context-state.mjs -- save --title "<short title>" --decision "<decision>" --remaining "<next step>" --verification "<command/result>"`
3. If a run ledger is active, record the artifact:
   - `node {{ETRNL_COMPANION}} run scripts/execution-ledger.mjs -- record-artifact --type context-save --path <context-path> --session <active-host-session-id>`

## Lightweight continuation

For a small task or a quick compaction save, keep the record short: goal, current state/branch, decision if one exists, exact next step, verification already run, and blocker. Do not fabricate empty fields, hash unrelated files, or add a multi-agent packet when there is no handoff.

## Detailed agent handoff

Use this fuller form when the user requests a detailed handoff or the next worker cannot safely continue from the lightweight record. A handoff should make the next action clear; ask only if a material decision or authorization is genuinely missing.

Select the following fields that are necessary to continue safely:

1. Goal and open execution scope. State the original goal and list every execution-scope item still open. Mark each item done, in-progress, or not-started. Do not ship a handoff that says "continue the plan" without naming the remaining items.
2. Decisions already made and why. Record each chosen path, the rejected alternatives, and the reason. The successor does not re-litigate a settled decision; write the reason so a fresh agent inherits it as settled.
3. Exact next action and its verification gate. Name the single next command or edit and the exact verification that proves it (command plus expected result, per `docs/health-stack.md`). Do not write "keep going" — write the command.
4. Artifact paths and content hashes. Reference evidence already produced by path, not by pasted body. Record digests for immutable evidence whose integrity affects reuse; routine source paths can be checked through the current diff. Reuse the existing state/artifact convention — do not inline large evidence:
   - `node {{ETRNL_COMPANION}} run scripts/context-state.mjs -- save --title "<short title>" --decision "<decision>" --remaining "<next step>" --verification "<command/result>"`
   - `node {{ETRNL_COMPANION}} run scripts/execution-ledger.mjs -- record-artifact --type context-save --path <context-path> --session <active-host-session-id>`
   - `shasum -a 256 <artifact-path>` — record the digest next to each referenced path.
5. Forbidden and no-revert notes. List files the successor must not touch, decisions it must not undo, and user changes it must preserve. State the emergency-bypass rule only when a broken guard blocks the next action.

For a detailed handoff, include the five fields that apply and name a concrete next action. Include artifact digests when immutable evidence artifacts need integrity checking; do not hash routine paths or restate information recoverable from git.

## Output

- Saved context path
- Branch and modified file count
- Remaining work count
- Blockers, if any

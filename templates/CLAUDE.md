# Claude Code

@AGENTS.md

Namespaced rules install under `~/.claude/rules/etrnl/`. Startup templates live under `~/.claude/docs/templates/`.

Use hooks for enforcement, skills for repeatable workflows, and this file only for Claude-specific routing. Keep shared guidance in `AGENTS.md`; do not duplicate it here.

Load the namespaced rule files when relevant:

- `@rules/etrnl/workflow.md`
- `@rules/etrnl/quality.md`
- `@rules/etrnl/tools.md`
- `@rules/etrnl/safety.md`
- `@rules/etrnl/identity.md`
- `@rules/etrnl/domains.md`

Keep private identity, account details, permissions, transcripts, and memories in a private overlay, such as an encrypted local directory, separate private repo, secrets manager, encrypted bucket, or private DB with access controls.

# Claude Code

@AGENTS.md

Namespaced rules install under `~/.claude/rules/etrnl/`. Startup templates live under `~/.claude/docs/templates/`.

Use hooks for enforcement, skills for repeatable workflows, and this file only for Claude-specific routing. Keep shared guidance in `AGENTS.md`; do not duplicate it here.

Do not import `rules/etrnl/*.md` from this file. Claude Code already discovers every `.md` under `~/.claude/rules/` and loads it, so an `@` import puts the same file in context twice.

Keep private identity, account details, permissions, transcripts, and memories in a private overlay, such as an encrypted local directory, separate private repo, secrets manager, encrypted bucket, or private DB with access controls.

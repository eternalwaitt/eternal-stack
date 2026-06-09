---
name: etrnl-dev-commit
description: ETRNL commit workflow for Claude Code. Use only when the user explicitly asks to commit; hidden from model auto-invocation because it has side effects.
disable-model-invocation: true
---
# Commit

Codex startup: after install, run `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-commit`; in the source checkout the helper lives at `scripts/skill-update-prompt.mjs`. On update, ask update/snooze/continue.

Create one logical commit at a time after evidence is clean.

## Preflight

1. Inspect `git status --short`, staged diff, unstaged diff, untracked files, current branch, and recent commit style.
2. Review the diff for secrets, credentials, private paths, generated noise, unrelated edits, accidental formatting churn, and large binary artifacts.
3. Split unrelated changes into separate commits. One commit owns one intent.
4. Use the `etrnl-dev-test` preflight/test workflow for the project before staging.

## Staging

1. Stage only files that belong to the commit intent.
2. Do not use broad staging when unrelated dirty files exist.
3. Keep generated files out unless the repo requires them and the generator evidence is recorded.
4. Stop when user-owned changes are mixed into the target files and the safe staging set is unclear.

## Message And Commit

1. Match the repo's observed commit style. Use Conventional Commits only when the repo uses it or the repository owner asks for it.
2. Name the changed behavior, not the tool that made it.
3. Do not use `--no-verify`.
4. If hooks fail, fix the cause, rerun the relevant gate, then create the commit.

## Post-Commit Proof

Report:

- commit SHA and subject;
- `git show --stat HEAD`;
- final `git status --short`;
- verification command and result;
- files intentionally left unstaged.

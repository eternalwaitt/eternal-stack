---
name: etrnl-dev-pr
description: ETRNL control-plane pull request workflow for Claude Code. Use only when the user explicitly asks to create or update a PR; hidden from model auto-invocation because it has side effects.
disable-model-invocation: true
---
# PR

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-pr`; on update, ask update/snooze/continue.

Prepare, update, and close the pull request loop only after local evidence, remote state, and reviewer feedback are known.

## Preflight

1. Inspect branch, default branch, upstream, dirty state, staged files, and untracked files.
2. Check for an existing open PR with `gh pr view` or `gh pr list --head <branch>` before creating. Reuse the existing PR when found. Do not create duplicates.
3. Confirm GitHub auth and remote URL before calling `gh`.
4. Review the diff for secrets, unrelated changes, generated noise, and files outside the requested scope.
5. Run the repo preflight and smoke checks that prove the PR body claims.
6. When the helper is installed, run `node ~/.claude/scripts/pr-preflight.mjs status --json` before creating or updating the PR, and run `node ~/.claude/scripts/pr-preflight.mjs validate --json` before claiming PR readiness.

## PR Body

1. Use the repo PR template when present.
2. Write a terse title that matches the actual diff.
3. Include implementation summary, verification commands/results, screenshots or artifacts when relevant, and residual risks.
4. Link issues or plans only when the link is real and relevant.
5. State any AI-assistance disclosure required by the target repo.

## CI And Review State

1. After creating or updating the PR, capture the PR URL.
2. Check required status with `gh pr checks` or the repo's documented CI command.
3. For failing checks, fetch the failing job/logs before proposing fixes.
4. For pending checks, report pending state with run URL or check name; do not claim CI is green.

## PR Loop

1. After each push or PR update, re-run local gates that cover the changed files, then fetch remote checks.
2. Inspect review feedback before final readiness: CodeRabbit, GitHub review threads, requested changes, and unresolved comments when the repo uses them.
3. Classify every review item as fixed, already-covered, false-positive, source-limited, or explicitly deferred by Victor.
4. Patch only real findings inside the PR scope, then rerun the relevant local gate and remote check query.
5. If the diff is too large to review coherently, split by ownership boundary or file set before creating more review churn.
6. Final readiness requires a clean local gate, no failing required checks, no unresolved must-fix review items, and a PR body that matches the final diff.

## Boundaries

- Do not merge, force-push, mark ready for review, request reviewers, add labels, or post PR comments unless Victor explicitly asks.
- Do not hide failing CI behind a summary.
- Do not create a PR from unrelated dirty files.
- Do not mark review feedback as addressed without evidence from the changed code or a concrete false-positive explanation.

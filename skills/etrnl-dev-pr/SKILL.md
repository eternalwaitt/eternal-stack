---
name: etrnl-dev-pr
description: ETRNL pull request workflow for Claude Code. Use only when the user explicitly asks to create or update a PR; writes dual-audience descriptions (business TL;DR/why/impact plus engineering rollout, verification, review guide); hidden from model auto-invocation because it has side effects.
disable-model-invocation: true
---
# PR

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-pr`; on update, never stop to ask; local updates auto-apply when enabled and safe.

Prepare, update, and close the pull request loop only after local evidence, remote state, and reviewer feedback are known.

## Preflight

1. Inspect branch, default branch, upstream, dirty state, staged files, and untracked files.
2. Check for an existing open PR with `gh pr view` or `gh pr list --head <branch>` before creating. Reuse the existing PR when found. Do not create duplicates.
3. Confirm GitHub auth and remote URL before calling `gh`.
4. Review the diff for secrets, unrelated changes, generated noise, and files outside the requested scope.
5. Run the repo preflight and smoke checks that prove the PR body claims.
6. When the helper is installed, run `node ~/.claude/scripts/pr-preflight.mjs status --json` before creating or updating the PR, and run `node ~/.claude/scripts/pr-preflight.mjs validate --json` before claiming PR readiness. For guarded or migration release classes, `status` and `validate-body` auto-bootstrap `.etrnl/release.json` and scaffold modules in deployable app repos — include any newly created files in the same PR without asking the user to run setup.

Install or refresh the helper from this repo when it is missing or stale:

```bash
mkdir -p ~/.claude/scripts
cp scripts/pr-preflight.mjs ~/.claude/scripts/pr-preflight.mjs
chmod +x ~/.claude/scripts/pr-preflight.mjs
node ~/.claude/scripts/pr-preflight.mjs status --json
node ~/.claude/scripts/pr-preflight.mjs validate --json
```

Re-run the copy step after source updates unless `scripts/install.sh` already refreshed the installed helper.

## PR drafting workflow

Agent-only workflow — no repo PR template required. The contract lives in `references/pr-description.md` and is enforced by `pr-preflight.mjs`.

1. Run `node ~/.claude/scripts/pr-preflight.mjs status --json` — branch, dirty state, existing PR, checks.
2. Run `node ~/.claude/scripts/pr-preflight.mjs template` — emit the dual-audience skeleton to fill in.
3. Draft the title and body using `references/pr-description.md`. Delete sections with nothing meaningful to say.
4. Validate structure before `gh pr create` or `gh pr edit`:

```bash
printf '%s' '{"title":"<title>","body":"<body>","changedFiles":["path/a","path/b"]}' \
  | node ~/.claude/scripts/pr-preflight.mjs validate-body --json
```

Use `--strict` when the diff touches install, hooks, doctor, schemas, templates, skills, or migrations, or when the PR is large (>8 files). Fix all blockers; treat warnings as blockers under `--strict`.
5. Create or update the PR only after `validate-body` exits 0.
6. Re-run `validate-body` after every push that changes scope, title, or verification claims.

## PR Body

Write for two readers: a business or product stakeholder who needs the story in the first screenful, and an engineer who needs evidence and technical depth below. Load `references/pr-description.md` for the full template, examples, and anti-patterns.

1. Use the repo PR template when present; otherwise follow the default structure in `references/pr-description.md`.
2. **Title — outcome first.** Name the user, workflow, or business result — not the refactor, file, or library. On squash-merge repos, use `type(scope): imperative outcome` when the title becomes the commit message. Match the final diff.
3. **TL;DR — one sentence.** State what gets better for whom once this merges. Highest-read line in notifications.
4. **Why this matters — business first.** Open with who benefits, what pain goes away, what becomes possible, or what risk drops. Add **Before / After** when narrative clarity helps. No file paths or stack jargon in this block.
5. **What changes — promote the work honestly.** Separate **Adding**, **Changing**, and **Removing**. State `Removing: nothing` when applicable. Frame progress toward a goal, not a tour of touched paths.
6. **Impact — name the audiences.** Call out user/customer effect (or explicit none), operator/support effect, and residual risk in plain language.
7. **Out of scope — preempt review churn.** State what this PR deliberately does not do and where follow-up lands (issue, plan, later PR).
8. **Technical notes — for reviewers.** Approach, touch points, compatibility, observability. Bullets, not a file dump.
9. **Rollout & rollback — when shipping matters.** Feature flags, env vars, migrations, revert path, breaking changes. Required for install, hooks, doctor, and runtime behavior changes.
10. **Changelog — when user-facing.** Customer-readable release note aligned with `CHANGELOG.md` and `docs/RELEASING.md`; omit for internal-only work.
11. **Verification / test plan — prove the claims.** Paste exact commands, result lines, screenshots or artifacts when relevant, and CI state after create/update. No empty checkboxes.
12. **Review guide — large PRs only.** Name where reviewers start and what they can skim.
13. **Demo — UI or docs only.** Before/after screenshots or clips when visual proof helps stakeholders.
14. Link issues or plans only when the link is real and relevant.
15. State any AI-assistance disclosure required by the target repo.
16. On every push that changes scope or fixes review findings, rewrite the body so it still matches the diff — especially TL;DR, `Why this matters`, `What changes`, `Rollout & rollback`, and `Verification / test plan`.

## CI And Review State

1. After creating or updating the PR, capture the PR URL.
2. Check required status with `gh pr checks` or the repo's documented CI command.
3. For failing checks, fetch the failing job/logs before proposing fixes.
4. For pending checks, report pending state with run URL or check name; do not claim CI is green.

## PR Loop

1. After each push or PR update, re-run local gates that cover the changed files, then fetch remote checks.
2. Inspect review feedback before final readiness: CodeRabbit, GitHub review threads, requested changes, and unresolved comments when the repo uses them.
3. Classify every review item as fixed, already-covered, false-positive, source-limited, or explicitly deferred by the repository owner.
4. Patch only real findings inside the PR scope, then rerun the relevant local gate and remote check query.
5. Feed **only the confirmed-valid findings** to the learning loop so recurring classes preempt the next PR — the items you classified as real in step 3 (fixed or already-covered). Never pass false-positive, source-limited, or owner-deferred items: promoting them would turn a review mistake into a recurring guard or checklist candidate. Capture just those items as a JSON array (`[{ summary, body, severity, category, lensId, disposition }]`) and run `node scripts/review-learn.mjs learn --findings <findings.json>`. As a backstop, `review-learn` drops any item whose `disposition` field is `false-positive`, `source-limited`, `owner-deferred`, or `deferred`, so a mis-tagged file still cannot promote an excluded item. It tracks recurrence in `review-learnings.json` and at three recurrences auto-promotes: a template-matching class becomes a warn-mode guard in `review-rules.json` (escalating to block after two clean runs), and everything else becomes a tracked checklist candidate for `etrnl-dev-autoplan`. Commit the updated `review-rules.json` and `review-learnings.json` with the PR.
6. If the diff is too large to review coherently, split by ownership boundary or file set before creating more review churn.
7. Final readiness requires a clean local gate, no failing required checks, no unresolved must-fix review items, and a PR body that matches the final diff.

## Boundaries

- Do not merge, force-push, mark ready for review, request reviewers, add labels, or post PR comments unless the repository owner explicitly asks.
- Do not hide failing CI behind a summary.
- Do not create a PR from unrelated dirty files.
- Do not mark review feedback as addressed without evidence from the changed code or a concrete false-positive explanation.

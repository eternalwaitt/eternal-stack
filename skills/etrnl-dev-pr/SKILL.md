---
name: etrnl-dev-pr
description: ETRNL pull request workflow for Claude Code. Use only when the user explicitly asks to create or update a PR; writes dual-audience descriptions (business TL;DR/why/impact plus engineering rollout, verification, review guide); hidden from model auto-invocation because it has side effects.
disable-model-invocation: true
---
# PR

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-pr`; on update, never stop to ask; local updates auto-apply when enabled and safe.

Prepare, update, and close the pull request loop only after local evidence, remote state, and reviewer feedback are known.

Helper paths: `node ~/.claude/scripts/<name>` after Eternal Stack install (application repos), `node scripts/<name>` only in an eternal-stack source checkout. Both run the same helper; commands below use the installed path. Run review-learning and preflight helpers from the **target repository root** so `--root` resolves ledger and rules files in that repo.

## Preflight

1. Inspect branch, default branch, upstream, dirty state, staged files, and untracked files.
2. Check for an existing open PR with `gh pr view` or `gh pr list --head <branch>` before creating. Reuse the existing PR when found. Do not create duplicates.
3. Confirm GitHub auth and remote URL before calling `gh`.
4. Review the diff for secrets, unrelated changes, generated noise, and files outside the requested scope.
5. Run the repo preflight and smoke checks that prove the PR body claims.
6. When the helper is installed, run `node ~/.claude/scripts/pr-preflight.mjs status --json` before creating or updating the PR, and run `node ~/.claude/scripts/pr-preflight.mjs validate --json` before claiming PR readiness. For guarded or migration release classes, `status` and `validate-body` auto-bootstrap `.etrnl/release.json` and scaffold modules in deployable app repos — include any newly created files in the same PR without asking the user to run setup.

Install or refresh the helper from the Eternal Stack source checkout (not the target application repo) when it is missing or stale:

```bash
set -euo pipefail
ETRNL_STACK_SRC="${ETRNL_STACK:-$HOME/Github/eternal-stack}"
[[ -f "$ETRNL_STACK_SRC/scripts/pr-preflight.mjs" ]] || {
  echo "missing pr-preflight.mjs in $ETRNL_STACK_SRC" >&2
  exit 1
}
mkdir -p "$HOME/.claude/scripts"
if [[ -f "$HOME/.claude/scripts/pr-preflight.mjs" ]] && ! cmp -s "$ETRNL_STACK_SRC/scripts/pr-preflight.mjs" "$HOME/.claude/scripts/pr-preflight.mjs"; then
  echo "pr-preflight.mjs differs from Eternal Stack source; preserve local edits or copy explicitly after review" >&2
  exit 1
fi
cp "$ETRNL_STACK_SRC/scripts/pr-preflight.mjs" "$HOME/.claude/scripts/pr-preflight.mjs"
chmod +x "$HOME/.claude/scripts/pr-preflight.mjs"
cd "<target-repo-root>"
node ~/.claude/scripts/pr-preflight.mjs status --json
node ~/.claude/scripts/pr-preflight.mjs validate --json
```

Re-run the copy step after source updates unless `scripts/install.sh` already refreshed the installed helper. Do not run the full installer to recover one helper unless the repository owner explicitly confirms rewriting hooks, rules, and settings.

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
5. Feed **only the confirmed-valid findings** to the learning loop so recurring classes preempt the next PR — the items you classified as real in step 3 (fixed or already-covered). Never pass false-positive, source-limited, or owner-deferred items: promoting them would turn a review mistake into a recurring guard or checklist candidate. **Redact or generalize tenant-specific, account-specific, transcript, credential, permission, private identity, local-memory, and permission-grant content while building the findings payload** — before writing `findings.json` or invoking the helper — so sensitive text never lands in the target worktree or the private learning ledger. Capture just those sanitized items as a JSON array (`[{"summary":"...", "body":"...", "severity":"...", "category":"...", "lensId":"...", "disposition":"..."}]`) and run from the target repo root:

```bash
if ! REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "review-learn error: not inside a Git repository" >&2
  exit 1
fi
REPO_KEY="$(python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.argv[1].encode()).hexdigest()[:16])' "$REPO_ROOT" 2>/dev/null || true)"
if [[ -z "$REPO_KEY" ]]; then
  echo "review-learn error: failed to derive repository key for $REPO_ROOT" >&2
  exit 1
fi
FINDINGS_FILE="${FINDINGS_FILE:?set FINDINGS_FILE to a sanitized JSON file}"
FINDINGS_DIR="$(cd -- "$(dirname -- "$FINDINGS_FILE")" && pwd -P)"
FINDINGS_CANON="$FINDINGS_DIR/$(basename -- "$FINDINGS_FILE")"
REPO_ROOT_CANON="$(cd -- "$REPO_ROOT" && pwd -P)"
case "$FINDINGS_CANON" in
  "$REPO_ROOT_CANON"/*)
    echo "review-learn error: FINDINGS_FILE must live outside the target repository" >&2
    exit 1
    ;;
esac
if ! jq -e 'type == "array"' "$FINDINGS_FILE" >/dev/null 2>&1; then
  echo "review-learn error: FINDINGS_FILE must be a JSON array" >&2
  exit 1
fi
if ! jq -e '.[] | objects | (.summary? | strings) and (.body? | strings // true) and (.severity? | strings // true) and (.category? | strings // true) and (.lensId? | strings // true) and (.disposition? | strings // true)' "$FINDINGS_FILE" >/dev/null 2>&1; then
  echo "review-learn error: FINDINGS_FILE entries must use the allowlisted string fields only" >&2
  exit 1
fi
if jq -e '[.. | strings] | any(test("(?i)(sk_live_|sk_test_|sk-[A-Za-z0-9_-]{20,}|github_pat_|glpat-|-----BEGIN[A-Z ]*PRIVATE KEY-----|Bearer [A-Za-z0-9._~+/=-]{16,}|(?:password|api[_-]?key|token)\\s*[=:]\\s*\\S+)"))' "$FINDINGS_FILE" >/dev/null 2>&1; then
  echo "review-learn error: FINDINGS_FILE contains sensitive-looking content; redact before ingestion" >&2
  exit 1
fi
REVIEW_ARGS=()
if [[ -n "${GITHUB_REVIEW_ID:-}" ]]; then
  REVIEW_ARGS+=(--review-id "$GITHUB_REVIEW_ID")
fi
node ~/.claude/scripts/review-learn.mjs learn \
  --findings "$FINDINGS_FILE" \
  --root "$REPO_ROOT" \
  --ledger "$HOME/.claude/review-learnings/${REPO_KEY}/review-learnings.json" \
  "${REVIEW_ARGS[@]}"
```

The helper is installed by Eternal Stack (`~/.claude/scripts/review-learn.mjs`), not vendored into application repositories — do not probe for `scripts/review-learn.mjs` in the target repo. If the helper is missing, copy only `review-learn.mjs` from the Eternal Stack source checkout (compare with `cmp -s` first and stop when the installed copy differs) before treating the recorder as unavailable. Run `bash "$ETRNL_STACK_SRC/scripts/install.sh"` only after explicit repository-owner confirmation because it rewrites hooks, rules, and settings. As a backstop, `review-learn` drops any item whose `disposition` field is `false-positive`, `source-limited`, `owner-deferred`, or `deferred`, and rejects findings whose summary or body still contain secret- or credential-shaped strings, so a mis-tagged or unsanitized file still cannot promote an excluded item. It tracks recurrence in the private overlay ledger above and at three recurrences proposes auto-promotion: a template-matching class becomes a warn-mode guard candidate in `review-rules.json`, and everything else becomes a tracked checklist candidate for `etrnl-dev-autoplan`. Record the proposal in the private overlay only; never write or enable `review-rules.json` entries without explicit repository-owner confirmation, including warn-to-block escalation proposals from `review-learn`. Keep the ledger under `~/.claude/review-learnings/` — never write `review-learnings.json` into the target repository or commit it. Commit promoted changes to `review-rules.json` only after explicit repository-owner confirmation.
6. If the diff is too large to review coherently, split by ownership boundary or file set before creating more review churn.
7. Final readiness requires a clean local gate, no failing required checks, no unresolved must-fix review items, and a PR body that matches the final diff.

## Boundaries

- Do not merge, force-push, mark ready for review, request reviewers, add labels, or post PR comments unless the repository owner explicitly asks.
- Do not hide failing CI behind a summary.
- Do not create a PR from unrelated dirty files.
- Do not mark review feedback as addressed without evidence from the changed code or a concrete false-positive explanation.

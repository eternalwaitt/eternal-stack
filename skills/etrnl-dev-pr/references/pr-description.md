# PR Description Guide

Write PR titles and bodies for two readers at once: a product or business stakeholder skimming for impact, and an engineer reviewing the diff. Lead with outcomes. Put implementation detail after the story is clear.

Sources distilled here: [Google eng-practices](https://google.github.io/eng-practices/review/developer/cl-descriptions.html), [jml What/Why/Notes](https://jml.io/posts/what-why-notes/), Stripe/Kubernetes PR templates, and reviewability guides from product engineering teams.

## Title

Pick one style based on how the repo merges:

**Outcome-first (default):** Name the user, workflow, or business result — not the refactor, file, or library. Verb-led, under ~72 characters.

**Conventional + outcome (squash-merge repos):** When PR titles become commit messages, prefix for searchability and add an outcome clause:

```text
<type>(<scope>)[!]: <imperative outcome in ≤72 chars>
```

Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `ci`, `chore`. Add `!` for breaking changes.

| Weak (tech-first) | Strong (outcome-first) | Strong (conventional + outcome) |
| --- | --- | --- |
| Refactor doctor.sh parallelization | Faster stack health checks without losing install coverage | `perf(doctor): run install smoke by default; keep full suite for releases` |
| Add test-install-smoke.sh | Catch broken installs in minutes instead of a full suite run | `test(install): catch broken installs in minutes instead of full suite` |
| Update etrnl-dev-pr skill | PRs now explain business impact before technical detail | `docs(pr): lead with business impact; add rollout and verification depth` |

## Body shape

Use the repo PR template when one exists. Otherwise use this default structure. **Omit empty sections** — small PRs collapse detail but keep add/remove separation when both exist.

```markdown
## TL;DR
<One sentence: what gets better for whom once this merges.>

## Why this matters
<2–4 sentences. Who benefits, what pain goes away, what risk is reduced, what becomes possible. No file names or stack jargon.>

**Before:** <how it works or fails today>
**After:** <what users/operators can do now>

## What changes
### Adding
- <capability, behavior, or coverage we gain>

### Changing
- <existing behavior, workflow, or expectation that moves>

### Removing
- <capability, step, or burden we drop — say why that is safe or intentional>
<!-- or: Nothing -->

## Impact
- **Users / customers:** <visible effect, or "none — internal only">
- **Operators / support:** <runbooks, alerts, rollout, rollback>
- **Risk:** <residual risk in plain language, or "low — covered by …">

## Out of scope
- <What this PR does not address; follow-up PR or issue #N>

## Technical notes
- **Approach:** <key design choice and why this over the obvious alternative>
- **Touch points:** <modules, flags, env vars — bullets, not a file dump>
- **Compatibility:** <backward compat, defaults, version skew>
- **Observability:** <metrics, logs, doctor gates affected>

## Rollout & rollback
- **Rollout:** <feature flag, phased deploy, env var, who enables>
- **Rollback:** <revert steps, flag off, data impact — or "git revert; no migration">
- **Breaking changes:** <none | list with migration steps>

## Changelog
<!-- Delete when not user-facing — align with CHANGELOG.md / docs/RELEASING.md -->
- <Customer-readable release note>

## Verification / test plan
**Commands run on `<branch>` @ `<short-sha>`:**
```bash
<exact command>
```
- Result: `<pass/fail summary or key output line>`

- [ ] `<check>` — `<result or gh pr checks link>`

## Review guide
<!-- Large PRs only -->
- Start at `<path>` — core logic
- Skim `<generated or test-only paths>` — low review value

## Links
<Only real issue, plan, or doc links. Omit when none.>

## Demo
<!-- UI or docs changes only -->
| Before | After |
| --- | --- |
| … | … |
```

### Section order and who reads what

| Section | Purpose | Primary reader |
| --- | --- | --- |
| TL;DR | One-line merged outcome | Everyone (notifications) |
| Why this matters | Business narrative, before→after | Stakeholders |
| What changes | Honest add / change / remove ledger | Stakeholders + reviewers |
| Impact | Users, operators, risk | Stakeholders |
| Out of scope | Preempts "why didn't you…?" review comments | Reviewers |
| Technical notes | Approach, touch points, compatibility | Engineers |
| Rollout & rollback | How to ship, revert, migrate | Operators + reviewers |
| Changelog | User-facing release note | Customers + release manager |
| Verification / test plan | Copy-paste proof | Reviewers |
| Review guide | Where to start on large diffs | Reviewers |
| Links | Issues, plans, design docs | Everyone |
| Demo | Before/after for visual changes | Stakeholders + QA |

Stakeholders stop after TL;DR, Why, What changes, and Impact. Engineers scroll for the rest.

## Writing rules

1. **TL;DR first.** One sentence above the fold — highest-read section in email and notification contexts.
2. **Business first.** The first screenful answers: why merge this, what gets better, what we stop doing.
3. **Honest change ledger.** Every non-trivial PR states what is added, changed, and removed. If nothing is removed, say so explicitly (`Removing: nothing`).
4. **Promote the work.** Frame the PR as progress toward a goal — faster checks, clearer installs, less review churn — not as a list of touched paths.
5. **Dual depth.** Stakeholders stop early; reviewers get technical notes, rollout, and verification below the fold.
6. **Out of scope saves review time.** One line on what this PR deliberately does not do is among the highest-ROI sections you can write.
7. **Evidence, not vibes.** Paste exact commands and result lines. Do not claim green checks without proof. Empty `- [ ] Tests pass` checkboxes get skipped.
8. **Rollout and rollback in the PR.** Feature flags, env vars, migrations, and breaking changes belong here — not left for reviewers to infer.
9. **Scope truth.** The body must match the final diff. If scope shrank during review, update the body in the same push.
10. **No filler.** Skip "This PR…", "In this change we…", generic AI slop, and polished prose without specifics.
11. **Disclose AI assistance** when the target repo requires it.

## Anti-patterns

| Pattern | Fix |
| --- | --- |
| Title is `Update X` or `Fix stuff` | Name the outcome or the broken workflow |
| Body opens with file paths or `refactor` | Open with TL;DR and the user or operator problem solved |
| Only lists implementation steps | Add `Why this matters`, `Impact`, and `Out of scope` |
| Buries removals in a long tech paragraph | Put removals under `### Removing` |
| Claims "no user impact" without saying who still cares | Name internal audiences: CI, install, support, compliance |
| Duplicate of commit messages | Synthesize commits into one outcome narrative |
| Kitchen-sink PR mixing unrelated concerns | Split by ownership boundary before opening |
| File-list description with no why | Lead with outcome; touch points go under Technical notes |
| Empty test plan checkboxes | Paste commands + output lines or CI links |
| Generic AI-generated prose | Add specifics: where to look, what you tested, what you're unsure about |
| Rollout left implicit | Add `Rollout & rollback` for install, hooks, migrations, flags |

## Short example

**Title:** `test(install): catch broken installs in minutes instead of full suite`

**Body:**

```markdown
## TL;DR
Everyday stack health checks catch install regressions in minutes instead of waiting for a 17-minute full suite.

## Why this matters
Install regressions currently surface only after the full install test suite runs. That slows doctor feedback and hides broken templates until late in the loop. This change adds a fast smoke path so everyday health checks stay trustworthy without paying the full-suite cost every time.

**Before:** `doctor` always runs the full install suite (~17 minutes) even for routine checks.
**After:** `doctor` runs a fast smoke path by default; full suite remains one env var away for release validation.

## What changes
### Adding
- Fast install smoke checks for dry-run, profile validation, and malformed-settings recovery

### Changing
- Default doctor runs smoke instead of the full install suite

### Removing
- Nothing

## Impact
- **Users / customers:** none — developer and CI workflow only
- **Operators / support:** `doctor` completes faster; use `ETRNL_DOCTOR_FULL_INSTALL=1` when validating releases
- **Risk:** low — full suite still runs in release/install validation paths

## Out of scope
- Parallelizing the full install suite itself — separate follow-up if needed

## Technical notes
- **Approach:** smoke covers the highest-signal install failure modes; full suite unchanged for release gates
- **Touch points:** `tests/test-install-smoke.sh`, `scripts/doctor.sh` `--changed` mapping
- **Compatibility:** `ETRNL_DOCTOR_FULL_INSTALL=1` and `DOCTOR_INSTALL_SUITE=full` restore prior behavior

## Rollout & rollback
- **Rollout:** merge; default doctor behavior changes on next run
- **Rollback:** revert PR or set `ETRNL_DOCTOR_FULL_INSTALL=1`
- **Breaking changes:** none — opt-in env vars preserve old behavior

## Verification / test plan
**Commands run on `feat/install-smoke` @ `abc1234`:**
```bash
./scripts/doctor.sh --changed
RUN_INSTALL_SMOKE_MODE=full tests/test-install-smoke.sh
```
- Result: both green on touched paths
```

## When updating an existing PR

1. Re-read the full branch diff against the default branch.
2. Rewrite TL;DR, `Why this matters`, and `What changes` if scope or intent shifted.
3. Refresh `Verification / test plan` with the latest local gates and `gh pr checks` output.
4. Update `Rollout & rollback` when shipping strategy changes during review.
5. Keep review-thread resolution out of the body unless the repo owner asks for a summary comment instead.

When the PR affects public release surfaces, cross-check `docs/RELEASING.md` and `CHANGELOG.md` before claiming readiness.

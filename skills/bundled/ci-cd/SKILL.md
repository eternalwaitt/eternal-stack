---
name: ci-cd
description: This skill should be used when the user asks to design, audit, debug, optimize, or harden CI/CD pipelines; mentions GitHub Actions, GitLab CI, Jenkins, deployment automation, release gates, branch protection, Docker image builds, Turborepo, Nx, monorepos, pnpm workspaces, DevSecOps, SLSA, Cosign, SBOMs, OIDC, staging, canary, blue-green, rollback, flaky tests, or slow builds.
---
# CI/CD Pipeline Engineering

Design pipelines that are deterministic, fast to diagnose, hard to bypass accidentally, and safe to deploy from. Prefer current repository/runtime evidence over generic templates. For large audits, load `references/deep-playbook.md` and run `scripts/audit_github_actions.py` before editing.

## Operating Model

Start by mapping the repo before editing pipeline files:

1. Identify package manager, workspace layout, build system, test runner, deployment target, protected branches, required checks, and current CI durations.
2. Read existing workflow files, hook config, package scripts, Dockerfiles, deployment scripts, and docs before adding new surfaces.
3. Separate feedback lanes:
   - **Local hooks**: ruthless on cheap deterministic checks that prevent obvious bad pushes.
   - **PR CI**: fast signal for review readiness.
   - **Main CI**: full merge-integrity gate and artifact publication.
   - **Deploy workflow**: explicit environment gate, health check, rollback, and production evidence.
   - **Nightly/scheduled**: slow, broad, or noisy checks that should not block every edit.
4. Preserve existing required check names when possible by using an aggregate job. This avoids breaking branch protection while allowing internal fan-out.
5. Verify every pipeline change with local syntax checks, a real CI run, and, for deployment changes, a real status/deploy dry run or production-safe smoke.

For broad CI/CD upgrades, use this sequence:

1. Run the audit helper: `python <skill>/scripts/audit_github_actions.py <repo>`.
2. Load `references/deep-playbook.md` for detailed patterns relevant to the findings.
3. Patch the smallest real pipeline surfaces.
4. Re-run the audit helper, local syntax checks, and the real CI/deploy workflow.

## Non-Negotiables

- Produce the same artifact for the same commit. Avoid mutable deploy inputs unless they are resolved to an immutable digest before rollout.
- Never print, commit, or document secret values. Store secrets in GitHub/GitLab/Jenkins secret stores, cloud secret managers, Vault, or sealed secrets.
- Keep CI test secrets separate from staging/production secrets. CI should not need production credentials.
- Pin external actions and base images deliberately. Prefer commit SHAs for GitHub Actions in high-trust repos and immutable image digests for production bases.
- Avoid direct `${{ github.event.* }}` interpolation inside shell `run:` blocks. Pass event data through env vars and quote carefully.
- Do not skip failing gates to go green. Fix root causes, move unsuitable checks to the right lane, or make them advisory with an explicit plan to harden later.
- Treat flaky tests as production risks. Quarantine only with owner, ticket, expiry, and replacement coverage.

## Quality Gates

Use this default order, tuned per repo:

1. Format and lint
2. Typecheck or compile
3. Unit tests
4. Build/package
5. Integration tests with real services or faithful containers
6. E2E/smoke tests
7. Security and dependency scans
8. Artifact creation, provenance, and publication
9. Staging deploy and verification
10. Production approval, deploy, health check, monitoring, rollback

Prefer fail-fast ordering inside a job, but split independent work into parallel jobs. Do not duplicate equivalent work: for example, avoid running both `test` and `test:coverage` if coverage already executes the full unit suite.

## Local Hooks vs CI

Use hooks to keep bad code from leaving the machine, not as the only enforcement layer.

- **pre-commit**: staged formatting, staged lint, secret scan on staged files, quick generated-file checks.
- **pre-push**: full typecheck, lint baseline/strict lint, fast unit tests, dependency graph checks such as Knip when reliable.
- **CI**: authoritative and reproducible. Hooks are bypassable and developer machines drift.

If hooks become slow enough that developers bypass them, move the slow check to PR/main CI and keep a smaller local guard.

## GitHub Actions Patterns

- Use `concurrency` with `cancel-in-progress: true` for PR and branch CI; keep production deploy concurrency non-cancelable.
- Use `needs:` to fan out independent jobs and converge through an aggregate required check.
- Use composite actions or reusable workflows to avoid repeated setup boilerplate.
- Use path filters for docs-only changes, package-scoped changes, and Docker-only changes, but make filters conservative.
- Upload artifacts on failure for debugging: Playwright reports, coverage, logs, screenshots, built assets, and test result XML.
- Use GitHub Environments for production approval, environment-scoped secrets, deployment history, and URLs.
- Prefer OIDC federation to long-lived cloud keys when deploying to AWS/GCP/Azure.
- Use scheduled workflows for dependency audits, full E2E, long integration suites, image scans, and stale/flaky-test reports.

## Monorepos, Turborepo, Nx, and Workspaces

Before changing a monorepo pipeline, discover the graph:

- Package manager: pnpm/npm/yarn/bun
- Workspace files: `pnpm-workspace.yaml`, `package.json#workspaces`, `turbo.json`, `nx.json`
- App/package ownership and deployable boundaries
- Existing cache location and remote-cache provider

Use affected/incremental execution:

- **Turborepo**: use `turbo run <task> --filter=...` for package-scoped PRs; use `--affected` where supported by the repo's Turbo version; use `--cache-dir` and remote cache when configured; make task outputs explicit in `turbo.json`.
- **Nx**: use `nx affected -t lint,test,build --base=<base> --head=<head>`; keep named inputs accurate so cache invalidation is correct.
- **pnpm workspaces**: use `pnpm --filter <pkg> <script>` for targeted work and `pnpm -r --parallel` only when task dependencies are safe.

Do not let incremental CI hide shared breakage. Run full graph checks on `main`, release branches, or nightly even if PR CI is affected-only.

## Caching and Speed

Optimize slow pipelines in this order:

1. Remove duplicate work.
2. Cache dependencies with lockfile-based keys.
3. Split independent jobs in parallel.
4. Use affected/path-filtered execution for monorepos.
5. Cache build outputs correctly: Turbo/Nx cache, Docker BuildKit GHA cache, Playwright browser cache only when stable.
6. Shard long unit/E2E suites.
7. Move broad non-critical checks to scheduled workflows.
8. Use larger or self-hosted runners for CPU-heavy builds after structural fixes.

Measure before and after. Report the long pole and the wall-clock critical path, not just the sum of job durations.

## Docker and Artifact Pipelines

- Build once, promote the same immutable artifact across environments.
- Tag images with commit SHA and optionally branch/latest aliases; deploy by digest or SHA tag when possible.
- Use multi-stage Dockerfiles, copy dependency manifests before source for layer caching, and keep `.dockerignore` tight.
- Run as non-root, set health checks where appropriate, avoid secrets in `ARG`/`ENV`, and avoid `:latest` base images in production.
- Use BuildKit cache (`cache-from`/`cache-to`) and keep cache scopes stable but not over-broad.
- Scan images with tools such as Trivy/Grype; start advisory if noisy, then make high/critical exploitable findings blocking.
- Generate SBOMs and provenance for release artifacts when the project is production-facing.

## DevSecOps and Supply Chain

Choose the right enforcement level for project maturity:

- **Baseline**: secret scanning, dependency audit/SCA, pinned actions, least-privilege `permissions:`, no production secrets in PR workflows.
- **Production**: CodeQL or Semgrep, container scanning, branch protection, signed commits/tags where required, artifact retention, audit logs.
- **High assurance**: OIDC, SBOMs, SLSA provenance, Cosign signing, reproducible builds, OpenSSF Scorecard/badge alignment.

Never use `pull_request_target` with untrusted checkout unless the workflow is designed specifically to avoid secret exposure.

## Deployment Design

Pick the deployment strategy that matches the runtime:

- **Rolling**: default for horizontally scaled, backward-compatible services.
- **Blue/green**: use when instant rollback matters and duplicate infrastructure is acceptable.
- **Canary**: use when real-traffic validation and observability exist.
- **Feature flags**: decouple deploy from release; require cleanup dates for temporary flags.
- **Manual production deploy**: acceptable for small teams when paired with immutable artifacts, clear input validation, health checks, and rollback.

Every production deploy workflow needs:

- Validated inputs and required secrets
- Explicit environment target
- Immutable artifact reference
- Pre-deploy status capture
- Health/readiness check with bounded retries
- Automatic rollback or a precise manual rollback command
- Post-deploy revision/image evidence
- Public or internal smoke check
- Log capture for failed deploys

## Infrastructure as Code and GitOps

For Terraform, CloudFormation, Pulumi, Kubernetes, Helm, ArgoCD, or Flux:

- Run format/validate/plan in PRs.
- Keep apply/sync behind protected environments.
- Upload plans as artifacts when useful, but do not leak secrets.
- Detect drift on a schedule.
- Prefer GitOps reconciliation for Kubernetes when a controller is already in use.
- Validate manifests with schema/policy tools before deploy.

## Branch Protection and Release Policy

- Require one stable aggregate check for merge protection even if internal jobs change.
- Require review for protected branches unless the project deliberately uses auto-merge with strict checks.
- Disable force-pushes to protected branches.
- Keep deploy separate from merge unless the team explicitly wants continuous deployment.
- Use Dependabot/Renovate with small PR limits and grouped low-risk updates.
- Keep release notes/changelogs tied to actual commits, tags, or PRs.

## Debugging CI Failures

Triage in this order:

1. Confirm whether the failure is deterministic by comparing current and previous runs.
2. Identify the first failing command, not the last noisy stack trace.
3. Reproduce locally with the same package manager, Node/Python/etc. version, env shape, and working directory.
4. Check recent workflow, lockfile, dependency, environment, and runner image changes.
5. Fix the repo or pipeline contract. Avoid rerun-only "fixes" unless there is confirmed external flakiness.

When reporting, include run ID, commit SHA, failing job/step, root cause, fix, and verification evidence.

## Review Checklist

Before calling CI/CD work complete:

- Workflow syntax parses.
- Permissions are least-privilege.
- Secrets are validated but never printed.
- PR checks are fast enough for review.
- Main/release checks preserve full confidence.
- Artifacts are immutable and traceable to commit SHA.
- Deploy has health check and rollback.
- Branch protection will still recognize required checks.
- Slow checks have a lane: PR, main, deploy, or scheduled.
- The change has been verified by a real CI run or a clearly stated source-limited blocker.

## Bundled Resources

- `references/deep-playbook.md`: detailed lane design, GitHub Actions hardening, monorepo/Turbo/Nx patterns, DevSecOps maturity, deployment readiness, and incident response.
- `references/source-map.md`: what external skills/docs were synthesized and what is intentionally excluded.
- `scripts/audit_github_actions.py`: dependency-free static audit for GitHub Actions workflow risks and optimization opportunities.
- `templates/github-actions/`: starter workflows for Node monorepo CI, Docker release images, and manual production deploys. Treat them as patterns to adapt, not drop-in files.
- `evals/prompts.md`: prompts for testing whether the skill drives strong behavior in fresh sessions.

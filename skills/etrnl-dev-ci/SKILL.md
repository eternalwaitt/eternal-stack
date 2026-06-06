---
name: etrnl-dev-ci
description: ETRNL control-plane CI/CD workflow for Claude Code. Use when designing, auditing, hardening, debugging, or repairing CI/CD pipelines, GitHub Actions, deploy gates, release automation, branch protection, OIDC, SBOMs, image builds, staging, canary, blue-green, rollback, flaky CI, or slow builds.
---
# ETRNL CI/CD

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-ci`; on update, ask update/snooze/continue.

Treat CI/CD as an execution harness with lanes, evidence, and rollback, not as scattered workflow YAML.

## Operating Model

1. Map the repository before editing:
   - Package manager, workspace layout, build system, test runner, deployment target, protected branches, required checks, and current workflow files.
   - Existing hooks, package scripts, Dockerfiles, deploy scripts, branch-protection docs, environment names, and release notes.
2. Separate lanes:
   - Local hooks: cheap deterministic checks that block obvious bad pushes.
   - PR CI: fast review-readiness signal.
   - Main CI: full merge-integrity gate and artifact publication.
   - Deploy workflow: explicit environment, immutable artifact, health check, rollback evidence, and post-deploy revision.
   - Scheduled lane: slow scans, broad audits, flaky-test reports, drift checks, dependency reviews, and full E2E.
3. Preserve existing required check names through an aggregate job unless branch protection is intentionally updated.
4. Patch the smallest real pipeline surface that closes the verified gap.
5. Verify syntax, local gates, and the real CI or deploy dry run before reporting completion.

## GitHub Actions Audit Flow

For broad workflow audits:

1. If the companion CI/CD skill helper exists, run it first:
   - `test -f ~/.agents/skills/ci-cd/scripts/audit_github_actions.py && python ~/.agents/skills/ci-cd/scripts/audit_github_actions.py .`
   - This helper belongs to the external `ci-cd` companion skill, not this repo-owned control plane; continue manually when it is absent.
2. Inspect `.github/workflows/*.yml`, `.github/workflows/*.yaml`, action references, `permissions:`, shell `run:` blocks, secrets, caches, artifacts, and concurrency by hand.
3. Record every finding with file, job, step, impact, fix, and verification command.
4. Rerun the helper or manual checklist after patching.

Use this finding shape for pipeline changes:

- Before: current lane, job, permission, artifact, environment, or deploy behavior.
- After: exact changed behavior and preserved check names.
- Why: failure, risk, cost, or release requirement that justifies the pipeline change.

## Non-Negotiables

- Produce the same artifact for the same commit.
- Resolve mutable deploy inputs to an immutable digest, commit SHA, image digest, or release artifact before rollout.
- Keep CI test secrets separate from staging and production secrets.
- Do not print secret values in logs, docs, workflow output, artifacts, or comments.
- Do not use production credentials in untrusted PR workflows.
- Avoid direct `${{ github.event.* }}` interpolation inside shell `run:` blocks; pass event data through `env:` and quote it.
- Give workflows least-privilege `permissions:`.
- Treat `pull_request_target` with checkout as a security finding unless the workflow proves untrusted code cannot access secrets.
- Do not skip failing gates to force green. Move the check to the correct lane, fix the repo contract, or record an accepted-risk decision from Victor.

## Required Gate Order

1. Format and lint.
2. Typecheck or compile.
3. Unit tests.
4. Build or package.
5. Integration tests with real services or faithful containers.
6. E2E or smoke checks.
7. Security and dependency scans.
8. Artifact creation, provenance, and publication.
9. Staging deploy and verification.
10. Production approval, deploy, health check, monitoring, and rollback command.

Split independent jobs in parallel. Keep fail-fast ordering inside a job. Do not duplicate equivalent suites.

## Local Hooks Versus CI

- Pre-commit owns staged format/lint, staged secret scan, generated-file drift checks, and cheap static checks.
- Pre-push owns full typecheck, lint, fast tests, and reliable dependency graph checks.
- CI remains authoritative and reproducible; hooks are bypassable and developer machines drift.
- Slow checks belong in PR/main/scheduled lanes with explicit rationale.

## GitHub Actions Patterns

- Add `concurrency` for PR and branch CI with `cancel-in-progress: true`.
- Keep production deploy concurrency non-cancelable.
- Fan out independent jobs with `needs:` and converge through a stable aggregate required check.
- Use composite actions or reusable workflows for repeated setup.
- Apply conservative path filters only after shared breakage still runs on main or scheduled lanes.
- Upload failure artifacts for debugging: logs, coverage, Playwright reports, screenshots, test XML, build output, and deployment logs.
- Use GitHub Environments for production approval, environment-scoped secrets, deployment history, and URLs.
- Use OIDC federation instead of long-lived cloud keys for AWS, GCP, or Azure deploys.

## Monorepos And Workspaces

Before changing a monorepo pipeline, identify:

- Package manager and lockfile.
- Workspace manifests.
- Turbo, Nx, pnpm workspace, or custom task graph.
- Deployable apps and package ownership.
- Cache locations and remote-cache provider.

Use affected execution for PR signal only. Full graph checks run on main, release branches, or scheduled lanes.

## Docker And Artifacts

- Build once, promote the same immutable artifact across environments.
- Tag images with commit SHA and deploy by digest or SHA tag.
- Use multi-stage Dockerfiles, dependency-manifest-first copies, BuildKit cache, and a tight `.dockerignore`.
- Run containers as non-root and define health checks for long-running services.
- Keep secrets out of Docker `ARG`, `ENV`, layers, build logs, and artifact metadata.
- Scan release images and store SBOM/provenance for production-facing artifacts.

## Deployment Contract

Every production deploy workflow requires:

- Validated inputs and required secrets.
- Explicit target environment.
- Immutable artifact reference.
- Pre-deploy status capture.
- Bounded health/readiness check.
- Automatic rollback or exact manual rollback command.
- Post-deploy revision/image evidence.
- Public or internal smoke check.
- Failure log capture.

## Runner And Scale Decisions

- Use hosted runners for ordinary lint, typecheck, tests, builds, and artifact packaging.
- Use self-hosted runners only for required hardware, private network access, strict data residency, licensing, or cost evidence that hosted runners cannot satisfy.
- Add matrix builds, sharding, or cache complexity only when measured CI duration, platform compatibility, or release policy requires it.
- Do not generate scaffold workflows until target platform, package manager, deploy target, secrets model, and required checks are confirmed.

## Completion Evidence

Before reporting CI/CD work complete, provide:

- Workflow files changed.
- Required check names preserved or intentionally changed.
- Syntax validation command and result.
- Local gates run and result.
- CI run URL, run ID, or source-limited blocker for a real run that was not triggered.
- Deploy dry run, staging run, production-safe smoke, or source-limited blocker for deploy changes.
- Remaining accepted risks with owner and expiry.

Do not claim the pipeline is healthy without a passing real CI run or a concrete source-limited blocker.

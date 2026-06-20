# CI/CD Deep Playbook

Load this file when the task asks for the best possible CI/CD design, a full audit, monorepo optimization, deployment safety, supply-chain hardening, or slow-pipeline remediation.

## Pipeline Lane Design

Use lanes rather than one giant workflow:

| Lane | Trigger | Blocking | Typical contents |
| --- | --- | --- | --- |
| Local pre-commit | staged files | local only | format, staged lint, staged secret scan |
| Local pre-push | push attempt | local only | typecheck, strict/baseline lint, fast unit tests, dependency graph sanity |
| PR fast CI | pull request | yes | static checks, affected unit tests, affected build, smoke E2E |
| Main CI | push to protected branch | yes | full graph tests, coverage thresholds, production build, artifact creation |
| Image/release | main/tag/manual | yes for release | Docker build, scan, SBOM, provenance, signing, registry push |
| Staging deploy | main/manual | typically yes | deploy immutable artifact, migrations, smoke, integration/E2E |
| Production deploy | manual/approval/tag | yes | environment approval, deploy, health checks, rollback, monitoring |
| Scheduled | nightly/weekly | reference or blocking by policy | full E2E, dependency audit, image scans, drift detection, flaky reports |

Keep PR CI fast enough that developers wait for it. Keep main/deploy authoritative enough that production safety does not depend on local hooks.

## GitHub Actions Hardening

Use this checklist for every workflow:

- Declare top-level `permissions: contents: read` and grant write permissions only per job.
- Add `concurrency` to PR/branch workflows with `cancel-in-progress: true`.
- Use non-cancelable deployment concurrency groups for production.
- Pin third-party actions to commit SHAs in high-trust repos; at minimum pin major versions intentionally and update on schedule.
- Avoid `pull_request_target` unless the workflow never checks out or executes untrusted PR code with secrets.
- Avoid direct `${{ github.event.* }}` expansion inside shell scripts; put values in `env:` and quote shell variables.
- Use GitHub Environments for production secrets, URLs, and approvals.
- Use OIDC as the default alternative to long-lived cloud provider keys.
- Add CODEOWNERS coverage for `.github/workflows/` in repos where workflow changes can expose secrets or deploy production.
- Use Dependabot/Renovate for action updates if actions are pinned to SHAs; pinning without an update path becomes silent drift.
- Upload failure artifacts: Playwright reports, logs, screenshots, coverage, test XML, Terraform plans with secrets redacted.
- Set `timeout-minutes` for long-running jobs so stuck jobs do not consume runners indefinitely.
- Use workflow summaries to make pipeline output readable.

## Monorepo and Build-System Patterns

### Turborepo

- Use `turbo run lint test build --affected` in PR CI when the repo version supports it.
- Use `--filter=<pkg>...` for package-specific changes or deployable boundaries.
- Use `turbo query affected` when a binary affected/not-affected decision can skip expensive setup before package installation.
- Ensure checkout history is deep enough for comparisons; shallow checkouts can force all packages to be treated as changed.
- Configure `turbo.json` `outputs` accurately. Bad outputs create false cache hits or missed cache reuse.
- Configure `env` and `globalEnv` for tasks whose output depends on environment variables, or cache hits can reuse artifacts from the wrong environment.
- Use remote cache only when credentials are scoped and untrusted forks cannot poison shared cache.
- Run full graph checks on protected branches or scheduled workflows even when PRs are affected-only.

### Nx

- Use `nx affected -t lint test build --base=<base> --head=<head>` in CI.
- Defaults to a base SHA from the latest successful protected-branch run when available, not merely the current branch tip.
- Keep named inputs and implicit dependencies accurate for config/schema/generated-code changes.
- Use remote caching with branch/fork trust boundaries.
- For dependency lockfile changes, expect broad invalidation; that is a safety feature.

### pnpm Workspaces

- Use `pnpm --filter <pkg> <script>` for targeted tasks.
- Use `pnpm -r --parallel` only when task order does not matter.
- Cache the pnpm store by lockfile, not `node_modules`.
- Keep workspace files copied into Docker dependency stages or production builds will drift from local installs.

## Speed Playbook

When CI is slow, measure the critical path first:

1. Remove duplicate commands.
2. Split independent work with `needs:`.
3. Cache dependencies and build outputs.
4. Use affected/path-filtered execution.
5. Shard long tests.
6. Move broad, low-signal checks to scheduled workflows.
7. Use larger/self-hosted runners only after structural fixes.

Do not optimize by deleting confidence. Reclassify checks by lane.

## Deployment Readiness

Before production deploy automation is considered complete:

- Artifact is immutable and traceable to commit SHA.
- Deploy input validates tag/digest/environment.
- Current production version is captured before mutation.
- Health checks use bounded retries and fail clearly.
- Rollback is automated or the exact manual rollback command is printed.
- Logs from failed deploys are captured.
- Database migrations are forward-compatible or have an explicit rollback/restore plan.
- Feature flags exist for risky release toggles and have cleanup dates.
- Monitoring/error tracking has a defined observation window after deploy.

## DevSecOps Maturity

Apply progressively:

### Baseline

- Secret scanning
- Dependency audit/SCA
- Least-privilege CI permissions
- Pinned actions
- Branch protection
- No production secrets in PR workflows

### Production

- CodeQL or Semgrep
- Container image scanning
- SBOM generation
- Artifact retention policy
- Signed tags/releases where useful
- Deployment audit trail

### High Assurance

- OIDC cloud auth
- SLSA provenance
- Cosign image signing
- Reproducible build checks
- OpenSSF Scorecard/badge alignment
- Ephemeral or hardened self-hosted runners

## IaC and GitOps

- Run `fmt`, `validate`, and `plan` on PRs.
- Keep `apply` behind protected environments.
- Store plans as artifacts only after redaction review.
- Detect drift on a schedule.
- Use ArgoCD/Flux sync when GitOps is already the operating model.
- Validate Kubernetes manifests with schema and policy checks before sync.

## Failure and Incident Response

For CI failures, report: run ID, commit SHA, job, first failing step, root cause, fix, and verification.

For suspected CI/CD compromise:

1. Disable affected workflows or environment secrets.
2. Rotate CI, registry, cloud, deploy, package-manager, and SSH credentials that were reachable.
3. Audit recent workflow changes and runner logs.
4. Rebuild artifacts from trusted commits.
5. Re-enable workflows with least privilege and pinned dependencies.

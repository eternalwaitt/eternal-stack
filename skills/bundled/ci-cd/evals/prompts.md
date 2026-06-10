# CI/CD Skill Evaluation Prompts

Use these prompts to validate whether the skill drives strong behavior in fresh sessions.

## Slow CI

Repo has a 28-minute GitHub Actions pipeline that runs lint, typecheck, unit tests, coverage, build, and E2E serially. Ask the agent to improve the pipeline without weakening production confidence. Expected behavior: inspect current workflows/scripts, remove duplicate work, fan out independent jobs, preserve required check names, add caching/timeouts/artifacts, and verify with a real run.

## Monorepo

Repo uses pnpm workspaces plus Turborepo. PR CI runs every task for every package. Ask the agent to make CI faster. Expected behavior: inspect `turbo.json`, lockfile, workspace graph, cache config, checkout depth, `env/globalEnv`, and use affected/filtering while keeping full main/nightly coverage.

## Deployment Safety

Production deploy is manual to a VPS. Ask the agent to automate deployment safely. Expected behavior: validate secrets, avoid printing values, deploy immutable artifact, capture current revision, health check with bounded retries, implement rollback, use production environment gate, and smoke test live endpoint.

## Supply Chain

Repo uses broad `permissions`, unpinned third-party actions, and cloud deploy keys in secrets. Ask the agent to harden CI/CD. Expected behavior: least privilege, action pinning/update path, OIDC where possible, `pull_request_target` review, CODEOWNERS for workflows, SBOM/provenance/signing when release artifacts exist.

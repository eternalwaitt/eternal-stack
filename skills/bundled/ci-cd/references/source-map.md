# CI/CD Skill Source Map

This skill intentionally synthesizes:

- SkillsMP `ci-cd-and-automation`: quality gates, shift-left, CI feedback loops, CI optimization, branch protection.
- SkillsMP `deployment-patterns`: rollout patterns, Docker production hygiene, health checks, rollback readiness.
- SkillsMP `deployment-pipeline-design`: multi-stage deployment gates, staging, approvals, progressive delivery.
- SkillsMP `cicd-pipelines`: DevSecOps, IaC, GitOps, enterprise readiness, anti-patterns.
- SkillsMP deployment/devops variants: deployment target discovery, monitoring, runbooks, platform engineering.
- Official Turborepo docs: remote caching, `--affected`, `turbo query affected`, checkout history, `env/globalEnv`.
- Official Nx docs: `nx affected`, CI `base`/`head`, latest successful main run, lockfile invalidation.
- Official GitHub Actions secure-use docs: least privilege, OIDC, CODEOWNERS, Dependabot action updates, workflow dependency awareness.

Intentional exclusions:

- Provider-specific full tutorials for AWS, GCP, Azure, Kubernetes, Jenkins, GitLab, and CircleCI. The skill contains decision guidance; load current official docs for implementation details.
- Organization-specific compliance controls. Use this skill for the baseline and add local policy references per org.
- Copy-paste production workflows with real secrets or account identifiers. Templates use placeholders by design.

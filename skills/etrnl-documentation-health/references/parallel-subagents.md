# Parallel Subagent Pattern

Use this reference when a documentation-health run is broad enough to benefit from parallel read-only review or disjoint write remediation.

## Rules

- Keep the parent session as orchestrator: inventory, lane split, integration, edits not delegated, and final verification.
- Dispatch a maximum of 6 agents per batch.
- Use read-only subagents for audit lanes.
- Use write-capable agents only in `fix` mode, only after findings are deduplicated, and only with disjoint file ownership.
- Do not duplicate work between parent and agents.
- Do not let subagents decide final health. The parent must merge evidence and rerun gates.
- Tell every subagent that it is not alone in the codebase, must not revert others' changes, and must preserve user edits.

## Default Read-Only Lanes

Use these lanes for no-skips repo documentation audits:

| Lane | Best Agent | Read Set | Output |
| --- | --- | --- | --- |
| Root and contributor docs | `etrnl-dx-reviewer` | README, CONTRIBUTING, install, troubleshooting, changelog, license, security | setup/operation drift findings |
| Architecture and ADRs | `etrnl-scout` or `etrnl-adversary` | docs architecture, ADRs, package layout, import boundaries | architecture clarity and stale decisions |
| API/data/runtime | `etrnl-scout` | routes, schemas, migrations, env, CI, deploy, runbooks | contract/runtime drift matrix |
| AI context and skills | `etrnl-adversary` | AGENTS, CLAUDE, rules, skills, agents, settings hooks | risky stale agent instructions |
| Comment health | `etrnl-quality-reviewer` | public exports, contracts, schemas, security/auth, scripts, integrations | useful/missing/noise/stale comment findings |
| Recent change impact | `etrnl-scout` | recent `git log --name-status`, latest GitHub PRs when available, changed source/docs paths | docs-impact conclusions and stale terms from recent work |
| Freshness, stale-term, and path sweep | `etrnl-scout` | docs, active plans, handovers, queues, runbooks, AI context, plus `fd`/`rg` path and stale-term references | deleted path, old name, stale command, stale architecture, and remaining-hit findings |

## Read-Only Packet Template

```json
{
  "taskId": "docs-health-root",
  "mode": "read-only",
  "goal": "Audit assigned documentation surface for drift and missing coverage.",
  "contextSummary": "Documentation-health audit. Parent owns integration and final verification.",
  "cwd": "<repo-root>",
  "readSet": ["README.md", "docs/install.md", "scripts/install.sh"],
  "writeScope": [],
  "forbiddenFiles": ["secrets", "credentials", "private transcripts", "unrelated dirty files"],
  "expectedOutput": {
    "coverage": ["files inspected", "source truths checked"],
    "recentChangeProof": ["commits reviewed", "PRs reviewed or skipped reason", "doc-impact conclusions"],
    "freshnessProof": ["stale terms searched", "matches inspected", "false positives", "remaining hits"],
    "findings": ["id", "severity", "path", "evidence", "impact", "recommended_action", "disposition"],
    "skipped": ["check", "reason"]
  },
  "verificationCommand": "read-only; no verification command",
  "modelTier": "inherit",
  "timeout": "bounded",
  "retryPolicy": "retry only if output lacks evidence",
  "doNotRevert": true,
  "webSearchGuidance": "no web unless the assigned docs reference external current behavior"
}
```

## Write Packet Template

Use only after the parent has a deduplicated ledger and disjoint ownership.

```json
{
  "taskId": "docs-health-fix-install-docs",
  "mode": "write",
  "goal": "Patch validated install-doc drift only.",
  "contextSummary": "Fix mode. Parent owns integration, changelog, and final gates.",
  "cwd": "<repo-root>",
  "readSet": ["docs/install.md", "scripts/install.sh", "scripts/doctor.sh"],
  "writeScope": ["docs/install.md"],
  "forbiddenFiles": ["scripts/install.sh", "scripts/doctor.sh", "unrelated dirty files"],
  "expectedOutput": {
    "changedFiles": ["docs/install.md"],
    "fixedFindings": ["DOC-P1-001"],
    "verification": ["command or source recheck used"]
  },
  "verificationCommand": "markdown/prose check or source recheck assigned by parent",
  "modelTier": "inherit",
  "timeout": "bounded",
  "retryPolicy": "stop after repeated blocker and report evidence",
  "doNotRevert": true,
  "reviewers": ["etrnl-quality-reviewer"],
  "specReviewRequired": false,
  "qualityReviewRequired": true,
  "integrationOwner": "parent",
  "expectedDiffShape": "documentation-only, no behavior edits",
  "criticalPath": "shared inventory before lane report",
  "stopCondition": "stop if evidence requires source edits outside writeScope"
}
```

## Integration

Merge lane output by finding id and source-of-truth path. Deduplicate repeated stale claims. Escalate severity when multiple lanes prove the same misleading instruction affects setup, deployment, security, or agent behavior.

After integration, rerun the docs-specific gates and the repo health stack relevant to changed files. If a subagent output lacks paths, evidence, or dispositions, treat it as incomplete and ask for a narrower redo or recheck locally.

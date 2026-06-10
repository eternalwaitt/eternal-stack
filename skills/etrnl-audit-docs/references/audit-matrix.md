# Documentation Audit Matrix

Use this reference when a documentation-health run needs breadth, scoring, or no-skips closure.

## Inventory

Capture these facts before judging quality:

- repository type: single app, monorepo, library, service, CLI, mobile, data, infra, embedded, mixed;
- major folders and their purpose;
- docs found and docs missing;
- packages, apps, services, modules, public entrypoints;
- command surfaces, API surfaces, schema/model surfaces;
- deployment/runtime surfaces;
- AI-agent context surfaces;
- generated/vendor/runtime exclusions;
- git dirty state.

Default to tracked files. Include untracked docs when they are clearly active local work. Exclude dependency folders, build outputs, generated clients, caches, coverage, local runtime state, large binaries, and vendored third-party code only with matching patterns and reasons.

## Documentation Classification

Assign exactly one primary status to every documentation file:

- `canonical`: source of truth for its scope.
- `secondary`: useful supporting explanation.
- `stale`: outdated but not actively dangerous.
- `misleading`: likely to cause wrong implementation or operation.
- `archive`: historical and intentionally non-current.
- `generated`: produced by a tool and must not be hand-edited.
- `duplicate`: repeats another doc without adding value.
- `delete_candidate`: must be removed or moved.
- `missing`: expected doc does not exist.

Record path, audience, owner/scope, freshness evidence, source-of-truth relationship, and action required.

## Freshness And Source-Truth Drift

Every scored run must prove freshness against current source truth. Passing Markdown lint, link checks, comment counters, or a repo-owned docs gate is enforcement evidence, not freshness evidence.

Start with recent change evidence:

- local commits: inspect recent `git log --name-status`, especially code, config, migration, runtime, API, hook, skill, and command changes;
- GitHub PRs: when `gh` access is available for the repo, inspect latest merged and open PRs, changed files, titles, descriptions, labels, and review notes for documentation-impact clues;
- docs-impact conclusions: for each relevant recent change, record whether docs were already updated, stale docs were found, no docs were required, or the check is source-limited with reason.

Build a source-truth matrix with checked claims for:

- current architecture names, component names, model names, provider names, package names, app names, and service names;
- install, update, rollback, test, build, lint, deploy, doctor, and local-run commands;
- runtime topology, domains, ports, queues, workers, jobs, storage buckets, databases, vector/search indexes, OCR/ML pipelines, and external integrations;
- API contracts, route/RPC names, schema names, env vars, secret locations, migrations, and generated surfaces;
- AI-facing workflow claims in AGENTS, CLAUDE, skills, prompts, hooks, settings, and rule files.

Derive stale-reference search terms from the matrix, recent commits, GitHub PRs when available, and recent rename/remove evidence. Search documentation, AI context, comments, active plans, work queues, handovers, migrations, and runbooks. Record term, command or search method, matches, inspected hits, fixed hits, false positives, and remaining hits.

Treat stale labels such as old model names, split architecture names, deprecated service names, old queues, old domains, and removed commands as findings when they imply current state. Mark them `archive` only when the path or heading clearly says the document is historical and the stale wording cannot steer current work.

Old untouched docs are not exempt. Every documentation file in scope must be reviewed or explicitly excluded with reason. If an old doc still describes a current system, validate its claims against source truth. If it describes obsolete behavior, mark it `archive`, `stale`, `misleading`, `superseded`, or `delete_candidate` and add the action to the ledger.

## Root Documentation

Root docs must orient and link, not become a dumping ground. Check whether they answer:

- what the repository is, who it is for, and what problem it solves;
- current maturity and status;
- install, configure, run, test, build, deploy, and operate;
- repository organization and where new code/docs belong;
- important decisions and what contributors must avoid;
- canonical vs secondary docs.

## Local Documentation

Require a local README or equivalent when a folder is an app, package, service, module, subsystem, integration, or tool; has local commands or caveats; defines public exports/API boundaries; owns business logic, infra, data flow, hardware, ML, auth, billing, security, or deployment; or can be misused by future contributors.

Do not create local docs for trivial leaves, generated outputs, vendor/runtime folders, or folders already fully covered by nearby canonical docs unless direct evidence shows a real misuse risk.

## Architecture And Structure

Check whether structure communicates architecture:

- folder names are specific and durable;
- boundaries are clear and shared code is not a dumping ground;
- business logic and infrastructure concerns have obvious homes;
- app/package/service responsibilities are documented;
- dependency direction is documented and followed;
- generated code boundaries are clear;
- test placement is understandable;
- conventions scale for the next 6-12 months.

Flag architecture that exists only in code.

## API And Contract Documentation

Inspect actual contract surfaces, not only docs:

- route files, RPC contracts, GraphQL schemas/resolvers, OpenAPI specs;
- SDK exports, request/response schemas, validation schemas;
- auth/permission middleware, error codes, pagination/filter/sort;
- webhook/event contracts and public package exports.

Flag removed endpoints, renamed procedures, obsolete schemas, old auth models, and old integration paths.

## Data And Runtime Documentation

Verify coverage for environment variables, typed env validation, secrets handling, local infra, database setup, migrations, seed data, queues/workers/jobs, storage buckets, cache layers, external services, observability/logging/tracing, deployment topology, runbooks, and recovery paths.

Commands and env names must match code/config when practical.

## ADR Health

For each ADR, check explicit status, date, clear decision, context constraints, alternatives, consequences, supersession links, implementation match, and current related docs/code references.

Required ADR coverage includes architecture style, API strategy, storage strategy, auth/security, deployment topology, major dependencies, data boundaries, integration strategy, observability, generated code policy, tooling policy, and major migrations when those decisions shape the repo. Do not delete historical ADRs. Supersede them.

## AI Context Health

Audit AI-facing docs as production docs: AGENTS, CLAUDE, `.cursorrules`, rule files, skills, agent prompts, and command docs.

Check architecture, stack/versions, commands, folder boundaries, coding rules, testing rules, anti-patterns, gotchas, design rules, security/secrets constraints, repo-specific tool usage, docs policy, and ADR policy.

Treat stale AI context as high severity because agents will confidently repeat it.

Additional drift checks:

- dead imports: every `@path.md`, markdown import, and generated context reference resolves;
- zero-match globs: every documented path glob matches at least one current file or records an absent-surface rationale;
- hot-path leakage: volatile current-session facts, active todo state, transcripts, credentials, local account details, and private memory content stay out of always-loaded files;
- duplicate rule owners: repeated policy text across AGENTS, CLAUDE, rules, skills, and docs has one canonical owner;
- command drift: every documented mandatory command exists and runs or has a source-limited blocker.

## Plans And Work Queues

Find planning folders, queues, roadmaps, RFCs, specs, and active work docs. Classify as `active`, `completed`, `stale`, `superseded`, `archive`, or `delete_candidate`.

Active plan areas must not become graveyards. Completed plans move to archive or deletion according to repo policy. Active queues must point to current priorities.

Review handover docs, migration notes, status reports, and work queues wherever they live. A date in the filename does not make the doc safe. If it names removed architecture or old runtime behavior without an archive banner, classify it as stale or misleading and add it to the ledger.

## Required Documentation System

Use one clean model:

- root README: orientation and links;
- docs: concepts, architecture, install, operations, troubleshooting;
- ADRs: durable decisions and rejected alternatives;
- folder READMEs: local ownership, commands, boundaries, gotchas;
- runbooks: operations and recovery;
- generated API docs: extracted contracts and public symbols;
- code comments: invariants, contracts, risks, usage;
- AI context: operational instructions for agents;
- not documented: self-evident leaves, generated/vendor outputs, stale duplicate prose.

Move, merge, delete, or create documentation only when justified by evidence.

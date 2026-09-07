# TypeScript and Framework Build Memory

Load this reference only after reproducing a TypeScript or framework build that exhausts memory, is killed near type validation, or succeeds only with a larger V8 heap. This is a symptom-driven diagnostic, not a reason to score every large TypeScript repository.

## First Classify the Failure

Do not call every terminated build a heap OOM.

- V8 heap exhaustion normally prints `JavaScript heap out of memory`, `Ineffective mark-compacts`, or `Reached heap limit`, often after repeated full GCs stop reclaiming meaningful space.
- An external memory limit commonly ends as `SIGKILL`, exit 137, or a provider/container OOM event without a V8 fatal error.
- A framework build can finish compilation and fail during a later `Running TypeScript`, declaration, lint, or static-analysis phase. Attribute the phase from logs before changing bundler code.
- A standalone `tsc` pass does not prove a framework-owned checker fits the same heap. Framework orchestration, generated route types, plugins, and worker IPC add memory pressure.

Record the exact command, exit/signal, final successful phase, Node/TypeScript/framework versions, configured heap limit, maximum RSS, and the environment or container limit. Keep build memory separate from runtime route latency and from application memory leaks.

## Establish a Reproducible Baseline

Run the smallest commands that isolate the failing phase:

```bash
pnpm exec tsc --noEmit --extendedDiagnostics
pnpm exec tsc --noEmit --listFilesOnly > <artifact-dir>/typescript-files.txt
```

Use the repository's actual build command as the end-to-end control. Capture maximum RSS with `/usr/bin/time -l` on macOS or `/usr/bin/time -v` on Linux. When a V8 diagnosis is still ambiguous, add `--trace-gc` for one bounded run and summarize the final GC plateau; do not retain multi-gigabyte traces after extracting the required evidence.

For before/after comparison, retain at least:

```yaml
command:
phase:
exit_or_signal:
heap_limit_mb:
max_rss_bytes:
files:
typescript_lines:
declaration_lines:
types:
instantiations:
compiler_memory_bytes:
check_time_ms:
total_time_ms:
source_revision:
environment:
```

Treat one run as causal diagnostic evidence. Repeat the retained before/after command when observed variance changes the verdict.

## Attribute Compiler-Graph Pressure

Start with `--extendedDiagnostics` and `--listFilesOnly`. Group included files and line counts by workspace package, generated directory, and source versus declaration file. Then inspect why the largest group enters the consumer's program:

- a workspace package exposes implementation `.ts` files instead of built `.d.ts` declarations;
- a `paths` alias points through a package source tree;
- a package lacks a `types` export or declaration build;
- generated ORM clients, API schemas, validators, route types, or SDKs are compiled again inside an application project;
- broad barrels or type exports pull a large generated surface into otherwise small consumers;
- deeply recursive conditional/mapped types or large unions multiply instantiations.

Use `--generateTrace` and a compatible TypeScript trace analyzer only when diagnostics and the file graph do not identify the pressure. Check available disk space first, write traces to a run-scoped temporary directory, preserve a compact summary, and remove or trash raw traces after the finding is reproducible.

Do not guess from repository size alone. The useful evidence is the compiler program that was actually loaded, its source/declaration mix, type and instantiation counts, memory, and the import or project-reference path that caused it.

## Apply Structural Fixes

Test one independently measurable hypothesis at a time. Common structural fixes include:

- make a library a `composite` TypeScript project that emits declarations, then reference it from consumers;
- build dependency declarations before the consuming application typecheck;
- expose built declaration entrypoints through package `types`/exports instead of application aliases to implementation source;
- narrow generated type entrypoints or split broad barrels when consumers need only a small surface;
- remove accidental client or application imports of generated payload modules;
- simplify a proven pathological type only after a trace attributes meaningful instantiation cost to it.

A project-reference boundary is retained only when the consumer demonstrably loads declarations instead of the dependency's implementation sources and the dependency build remains part of the fail-closed gate.

Do not accept casts, `skipLibCheck`, disabled strictness, ignored errors, or skipped typechecks as memory fixes. Casts can move a structural comparison without reducing the program; relaxed checking trades an observed resource failure for unobserved correctness failures.

## Framework-Owned Type Checking

If an ordinary standalone typecheck fits after structural remediation but the framework's duplicate checker still exhausts its worker:

1. Run framework type generation first when generated route or application types are part of the normal build.
1. Run the repository's complete TypeScript gate in its own process and stop immediately on failure.
1. Only after that gate passes, use the framework-supported option to skip the duplicate checker during the production bundle.
1. Keep the sequence in one build wrapper so CI and deployment cannot invoke the skip path without the preceding type gate.
1. Test with an inherited low `NODE_OPTIONS` value so the wrapper either replaces an inadequate `--max-old-space-size` deterministically or fails clearly.

This is fail-closed isolation, not disabled validation. Record both commands and prove that a seeded type error prevents the bundle step when the wrapper's ordering is not already covered by a deterministic contract test.

## Heap Policy and Closure

Raising `--max-old-space-size` is useful to capture diagnostics or provide bounded headroom after structural pressure is understood. It is not root-cause closure by itself.

Close the finding only when:

- the failing phase and termination mode are proven;
- the dominant compiler-graph pressure has an attributed producing path;
- before/after diagnostics use comparable commands and environments;
- the normal type gate passes at the default heap after structural work, or a documented isolated heap budget is justified by remaining measured pressure;
- the full production build passes with type validation fail-closed;
- a deterministic guard covers declaration boundaries, build ordering, and any duplicate-check bypass;
- rejected experiments and their measured effect are recorded, so the next audit does not repeat them.

Use the remediation receipt from `remediation-contract.md`, adding the compiler baseline fields above and the exact low/default-heap verification command.

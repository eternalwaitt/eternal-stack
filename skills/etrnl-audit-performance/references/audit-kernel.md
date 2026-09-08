# Mandatory performance kernel

The six existing lanes schedule work; fine checks in `scripts/lib/performance-contract.mjs` control completion. The parent artifact validator requires contract version 2 for every performance report, including direct runs. Older reports require explicit migration; there is no legacy clean bypass.

## Discovery and dispatch

`node scripts/performance-audit.mjs discover <git-root> > <run>/contract.json` inventories tracked and nonignored untracked files and hashes their current contents. It never executes target code. Git/submodule/read failures are explicit errors. A full-stack audit must additionally reconcile framework route manifests, runtime registrations, deferred journeys, ignored generated entrypoints, infrastructure, external services and prior incidents. Record commands and limitations in `discoveryReview`.

Replace `unclassified-source` with exact named surfaces (routes, operations, components, queries, workers, builds). Each surface has `id`, `files`, `domains`, and `journeys`. Account for every inventoried file in a surface or a reasoned exclusion. Add generated/external surface descriptors to the inventory with retained provenance; update its hash and every receipt after expanding discovery. Inspect non-Next.js routes, non-Prisma persistence and non-JavaScript runtimes explicitly. Domain absence requires an evidence-based classification; unknown is applicable and source-limited. The validator cannot prove semantic discovery completeness from filenames.

Every fine check receives exactly one receipt and the exact applicable surface/journey ids and counts. Split surfaces until producing paths and fixture ownership are clear. Never merge unexamined subchecks into one prose row. All fine receipts roll up to their registered lane, then the common findings/blockers and synthesis; a fine finding prevents a clean lane. Missing profiler, fixture, authentication, load authorization or provider signal requires `source_limited` with `blocker.dependency` and `blocker.action`. Known provider incidents still use the stronger existing finding/closure contract.

## Evidence

Use `tests/fixtures/performance/fixture.mjs` as a structural example only; its synthetic metrics are not reusable audit evidence. Receipts bind `inventoryHash`, exact ids/counts, status, reason and dispatch. Findings/clean receipts require commands, explicit passing criteria and raw files with relative paths and SHA-256 hashes. Files resolve relative to the category artifact directory; traversal, missing files and changed hashes fail.

Findings name the producing path, proposed remediation, priority basis (impact, frequency, scale, confidence) and regression guard. `static_hypothesis` is allowed for findings only. `confirmed_clean` requires measurements; if measurement is impossible, report source-limited even when source inspection looks sound. Measurements include method, metric/value/unit/statistic, variance, warmups, sample count, and matching environment/revision/fixture/auth/cache/device/network/concurrency. Three repeats are a minimum structural floor, not statistical confidence; tail percentiles and soak claims need workload-appropriate data. Emitted bundle observations use one build, but cannot prove latency or memory behavior.

Set `mode` to `audit` or `remediation`. Measurements carry `evidenceType` and the registered `metricDomain`; build, server runtime, browser, bundle and other resource domains cannot substitute for each other. Load measurements also require `loadPlan` with target, environment, authorization, duration, rate/concurrency caps, latency/error/resource abort thresholds, generator limits and cleanup.

Use schema-v2 `performance-baseline.mjs` for comparison and replay. Preserve raw outputs, distribution and environment conditions. Remediation requires `experiments`: check id, change, before/after measurements with artifact hashes and conditions, correctness status, noise percentage, regression guard and keep/revert/inconclusive decision. The validator computes improvement from before/after values (default direction lower; set higher for throughput). Changed conditions, insufficient samples, conflicting correctness or overlapping noise cannot justify keep. Read-only mode produces remediation proposals without executing them.

## Conditional contributors

Built-in domain references are the default and travel with the skill. `dispatchPerformance` returns a built-in fallback unless a candidate is available, compatible, versioned and provenance-bound. `PERFORMANCE_CONTRIBUTORS` enforces allowed domains and capability fields: React/framework versions; Vercel supported framework/project scope/credentials/signals; laboratory remediation mode/replay harness; load-testing authorized target/traffic mix. External dispatch receipts require name, capabilities, exact version, SHA-256, provenance URL and compatibility evidence; record the source license before incorporating text/code. No external skill is installed or vendored by this workflow.

React Best Practices supplements React/bundle checks after React and framework version detection. Vercel Optimize supplements provider checks only for a supported framework, exact linked project/account, read credentials and usable observability signals. Agent Laboratory supplements controlled remediation experiments. Load-testing procedures supplements authorized capacity scenarios. Intel profiling procedures is conditional on its supported OS/hardware/runtime. Other sources remain research, not automatically callable dependencies.

Contributors consume immutable surface ids, input hashes, conditions and named check ids; they return receipts in this contract, not an unstructured success message. The parent validates all outputs and merges findings by producing path without deleting check coverage. Host instructions and audit read-only/evidence rules prevail over contributor update, scope cap, model, install, purchase or mutation instructions. If incompatible, execute the built-in reference sequentially. No host-specific spawn API or model is required. Load only the relevant reference and brief; never preload all external skill collections. Adapter selection/fallback is tested; external-agent quality is not claimed without recorded behavioral runs.

## Distribution

`node scripts/performance-audit.mjs parity <source-root> <staged-or-installed-root>` compares the entire performance skill, entrypoint scripts and helper library tree. It normalizes LF/CRLF for distribution text, detects extra stale files, exits 1 on missing/stale content and never modifies either root. Raw audit evidence remains byte-exact. Installation copies the registered helper and all libraries/references. Compare a disposable package/install stage before publishing; global installation is a separate authorized action. A source doctor pass does not mean an older installed skill is synchronized.

## Investigation depth contract v2

Load `conditional-performance.md` for mandatory stack expertise, full cell sweeps and prior-run reconciliation. Use `experts`, `cells` and `reconcile` from `performance-audit.mjs` to produce reviewable plans. Contract v2 requires these receipts in addition to the 64 check results; a five-item summary cannot satisfy the complete ledger.

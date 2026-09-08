# Browser, React and emitted bundles

Activate browser/bundle checks for any browser UI; React checks only after React ownership is established. Inventory framework/build manifests, all route entrypoints, deferred interactions, client directives, dependency graph, worker and service-worker entrypoints. A missing Next.js page filename never excludes another framework.

| Receipts | Investigation and measurement | Remediation and regression guard |
| --- | --- | --- |
| react.render-commit | React Profiler actual/base durations and commit grouping on named interactions; use a profiling build and record overhead. | Change measured expensive subtree, compare same interaction and correctness. `commitTime` is a timestamp, not commit duration. |
| react.context-subscriptions | Trace which updates trigger subscribers and component renders. | Split subscription breadth or relocate state; replay high-frequency updates. |
| react.virtualization | Render/layout/memory at maximum supported list cardinality. | Window only when measured useful; test keyboard, screen-reader, scroll and selection behavior. |
| react.compiler | Record compiler configuration/version and profiler evidence; inspect escape hatches. | Compiler-aware experiment; no automatic memoization prescriptions or removal of existing memoization. |
| react.effects-leaks | Repeated mount/unmount and route cycles; listener/timer counts, retained nodes and heap. | Correct cleanup/ownership; repeat cycles and verify stable retained state. |
| browser.hydration / long-tasks | Performance trace linking hydration/mismatch work, scripting, layout and long tasks to source stacks. | Reduce startup JS or split work; verify input responsiveness and hydration correctness. |
| browser.field-vitals | Field LCP/INP/CLS p75 by cohort/window; retain sample availability. Lab and interaction traces are separately labeled. | Compare cohort/window and field rollout; Lighthouse/TBT cannot substitute for field INP. |
| browser.constrained-device | Named mobile device or CPU/network emulation with viewport and repeated samples. | Compare under identical constraints; desktop alone cannot close mobile coverage. |
| browser.transitions-streaming | Initial and client navigation waterfalls, Suspense, streaming, prefetch, interaction timing. | Parallelize independent fetches, move boundaries; test network cost and fallback correctness. |
| browser.resource-loading | LCP resource discovery, images, fonts, CSS, scripts, priority and blocking chains. | Right-size assets/loading priority; verify trace, layout stability and bytes. |
| bundle.route-ownership / client-leakage | Emitted manifest and source-map/import-chain ownership per initial and deferred route; inspect server dependency leakage. | Move boundary/import, verify emitted chunks and server-only behavior. |
| bundle.transfer-parse-execute | Raw, compressed and interaction-loaded bytes plus trace parse/compile/execute cost. | Compare both bytes and CPU; smaller transfer alone cannot prove faster interaction. |
| bundle.duplicates-tree-shaking / dynamic-imports | Analyzer evidence for duplicates, barrel imports, side effects and actual split chunks. | Scoped imports or lazy boundaries only when emitted output improves. |
| bundle.budgets | Route-level baseline, justified byte/time limits and comparable build settings. | CI emitted-byte budget plus representative interaction regression. |

Conditional Next.js: use the installed version's bundle analyzer and server/client rules. Do not prescribe caching directives from a different framework version. Conditional external React procedures is supplemental; return these same receipts with exact provider revision/hash. Missing tools stay source-limited.

Primary references: [React Profiler](https://react.dev/reference/react/Profiler), [React Compiler](https://react.dev/learn/react-compiler), [Next.js bundling](https://nextjs.org/docs/app/guides/package-bundling), [Web Vitals](https://web.dev/articles/vitals).

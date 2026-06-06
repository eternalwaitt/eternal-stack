/** Version for the deep-audit category registry schema and expected fixture snapshots. */
export const CATEGORY_REGISTRY_VERSION = "2026-06-05.1";

/** Category ids intentionally left out of the registered deep-audit gate set. */
export const KNOWN_UNIMPLEMENTED_CATEGORIES = [
  "api-data",
  "payments",
  "privacy-compliance",
];

const worklists = {
  excellence: [
    "code_source_files",
    "code_tests",
    "code_types",
    "code_error_paths",
    "code_boundaries",
    "code_architecture",
  ],
  ux: [
    "ux_routes",
    "ux_components",
    "ux_states",
    "ux_styles",
    "ux_copy",
    "ux_accessibility",
  ],
  production: [
    "prod_pages",
    "prod_procedures",
    "prod_routes",
    "prod_actions",
    "prod_webhooks",
    "prod_queues",
    "prod_crons",
    "prod_notifications",
    "prod_uploads",
    "prod_exports",
    "prod_schema",
    "prod_client",
    "prod_mutations",
    "prod_tenant",
    "prod_dates",
    "prod_raw_env_files",
    "prod_error_boundaries",
  ],
  performance: [
    "perf_pages",
    "perf_route_handlers",
    "perf_dynamic_routes",
    "perf_loading",
    "perf_queries",
    "perf_client",
    "perf_dynamic",
    "perf_deps",
    "perf_large_files",
    "perf_next_configs",
    "perf_compiler_status",
  ],
  security: [
    "sec_entrypoints",
    "sec_authz",
    "sec_inputs",
    "sec_sinks",
    "sec_secrets",
    "sec_uploads",
    "sec_webhooks",
    "sec_dependencies",
  ],
  reuse: [
    "reuse_source_files",
    "reuse_components",
    "reuse_helpers",
    "reuse_modules",
    "reuse_tests",
    "reuse_duplicate_candidates",
  ],
  repo: [
    "repo_tracked_files",
    "repo_docs_entrypoints",
    "repo_generated_artifacts",
    "repo_ignored_files",
    "repo_metadata",
  ],
  tooling: [
    "tool_scripts",
    "tool_package_manifests",
    "tool_lint_format",
    "tool_tests",
    "tool_ci",
    "tool_bootstrap",
  ],
};

const RECEIPT_FIELDS = ["laneId", "categoryId", "status", "consumedWorklistHashes", "summary"];

function check(checkId, label, requiredWorklists, applicabilityGate, laneId = "") {
  return { checkId, label, requiredWorklists, applicabilityGate, laneId };
}

/**
 * Canonical registry for deep-audit categories, required worklists, checks, and lane receipts.
 */
export const REGISTERED_DEEP_AUDIT_CATEGORIES = [
  {
    categoryId: "code-excellence",
    skillName: "etrnl-audit-excellence",
    referencePath: "skills/etrnl-audit-excellence/references/audit-checks.md",
    executionMode: "sequential",
    requiredWorklists: worklists.excellence,
    checks: [
      check("code-01-correctness-invariants", "Correctness invariants", ["code_source_files", "code_tests"], "Application source or library code exists"),
      check("code-02-type-contracts", "Type and schema contracts", ["code_types", "code_boundaries"], "Typed language, schemas, or external contracts exist"),
      check("code-03-error-handling", "Error handling and failure clarity", ["code_error_paths", "code_boundaries"], "Error, retry, fallback, or boundary code exists"),
      check("code-04-architecture-boundaries", "Architecture boundaries", ["code_architecture", "code_boundaries"], "Modules, packages, layers, or service boundaries exist"),
      check("code-05-test-signal", "Test signal and regression coverage", ["code_tests", "code_source_files"], "Tests or verification commands exist"),
      check("code-06-complexity-debt", "Complexity, dead code, and stale abstractions", ["code_source_files", "code_architecture"], "Non-trivial source files exist"),
    ],
    lanes: [],
  },
  {
    categoryId: "ui-ux-product",
    skillName: "etrnl-audit-ux",
    referencePath: "skills/etrnl-audit-ux/references/audit-checks.md",
    executionMode: "sequential",
    requiredWorklists: worklists.ux,
    checks: [
      check("ux-01-primary-flows", "Primary product flows", ["ux_routes", "ux_components"], "User-facing routes, screens, or views exist"),
      check("ux-02-information-hierarchy", "Information hierarchy and scanning", ["ux_routes", "ux_copy"], "Screens contain navigable content or decisions"),
      check("ux-03-states-feedback", "States, feedback, and empty paths", ["ux_states", "ux_components"], "Interactive components, async data, forms, or lists exist"),
      check("ux-04-accessibility", "Accessibility and keyboard paths", ["ux_accessibility", "ux_components"], "Interactive or semantic UI exists"),
      check("ux-05-responsive-visual-polish", "Responsive visual polish", ["ux_styles", "ux_routes"], "CSS, layout, or viewport-sensitive surfaces exist"),
      check("ux-06-product-copy", "Product copy and trust cues", ["ux_copy", "ux_routes"], "User-facing text exists"),
    ],
    lanes: [],
  },
  {
    categoryId: "production-readiness",
    skillName: "etrnl-audit-production",
    referencePath: "skills/etrnl-audit-production/references/audit-checks.md",
    executionMode: "sequential",
    requiredWorklists: worklists.production,
    checks: [
      check("prod-01-state-coverage", "State coverage matrix", ["prod_pages"], "Next.js pages or equivalent routed views exist"),
      check("prod-02-transition-integrity", "Transition integrity", ["prod_mutations"], "Client or server mutations exist"),
      check("prod-03-validation-boundaries", "Validation at trust boundaries", ["prod_procedures", "prod_routes", "prod_actions"], "API routes, procedures, or server actions exist"),
      check("prod-04-timezone-locale-market", "Timezone, locale, and market correctness", ["prod_dates"], "Date, timezone, locale, or market-specific behavior exists"),
      check("prod-05-concurrent-write-safety", "Concurrent write safety", ["prod_procedures", "prod_actions", "prod_routes"], "Write paths or booking-like mutations exist"),
      check("prod-06-auth-tier-enforcement", "Auth edge cases and tier enforcement", ["prod_procedures", "prod_routes", "prod_pages"], "Authentication, permissions, tiers, or protected routes exist"),
      check("prod-07-webhook-safety", "Webhook safety", ["prod_webhooks"], "Webhook handlers exist"),
      check("prod-08-notification-deduplication", "Notification deduplication", ["prod_notifications"], "Notification send sites exist"),
      check("prod-09-serverless-platform-failures", "Serverless platform failures", ["prod_queues", "prod_crons", "prod_routes"], "Serverless, cron, worker, or queue surfaces exist"),
      check("prod-10-tenant-isolation", "Multi-tenant data isolation", ["prod_tenant", "prod_schema"], "Tenant or location scoped data exists"),
      check("prod-11-file-upload-atomicity", "File upload atomicity", ["prod_uploads"], "Upload or object-storage handlers exist"),
      check("prod-12-migration-pii-logs", "Migration safety and PII in logs", ["prod_schema"], "Database schema or migration-sensitive data exists"),
      check("prod-13-schema-correctness", "Schema correctness", ["prod_schema"], "ORM schema exists"),
      check("prod-14-export-parity", "Export parity", ["prod_exports"], "Export features exist"),
      check("prod-15-path-route-correctness", "Path and route correctness", ["prod_pages", "prod_routes"], "Routed pages, dynamic links, redirects, or route handlers exist"),
      check("prod-16-raw-env-access", "Raw environment variable access", ["prod_raw_env_files"], "Environment variables are accessed"),
      check("prod-17-error-boundaries", "Missing error route boundaries", ["prod_pages", "prod_error_boundaries"], "Route segments can throw during data fetching"),
      check("prod-18-operability-prr", "Operability PRR", ["prod_queues", "prod_crons", "prod_routes", "prod_notifications"], "Production runbooks, on-call signals, queues, crons, deploy gates, or incident paths exist"),
    ],
    lanes: [],
  },
  {
    categoryId: "security",
    skillName: "etrnl-audit-security",
    referencePath: "skills/etrnl-audit-security/references/audit-checks.md",
    executionMode: "sequential",
    requiredWorklists: worklists.security,
    checks: [
      check("sec-01-trust-boundary-validation", "Trust-boundary validation", ["sec_entrypoints", "sec_inputs"], "External input, request, job, or import boundary exists"),
      check("sec-02-authz-tenant-isolation", "Authorization and tenant isolation", ["sec_authz", "sec_entrypoints"], "Authenticated, role-scoped, tenant-scoped, or account-scoped data exists"),
      check("sec-03-secret-handling", "Secret and credential handling", ["sec_secrets"], "Environment variables, credentials, tokens, or key material are referenced"),
      check("sec-04-injection-command-sinks", "Injection and command sinks", ["sec_sinks", "sec_inputs"], "SQL, shell, template, redirect, path, eval, dynamic import, or external command sinks exist"),
      check("sec-05-webhook-csrf-origin", "Webhook, CSRF, and origin controls", ["sec_webhooks", "sec_entrypoints"], "Webhooks, browser mutations, forms, callbacks, or cross-origin requests exist"),
      check("sec-06-file-upload-deserialization", "File upload and deserialization safety", ["sec_uploads", "sec_inputs"], "File uploads, parsers, archives, importers, serializers, or untrusted payload decoders exist"),
      check("sec-07-dependency-exposure", "Dependency exposure", ["sec_dependencies"], "Runtime dependencies, package manifests, or lockfiles exist"),
    ],
    lanes: [],
  },
  {
    categoryId: "performance",
    skillName: "etrnl-audit-performance",
    referencePath: "skills/etrnl-audit-performance/references/audit-checks.md",
    executionMode: "fanout",
    requiredWorklists: worklists.performance,
    checks: [
      check("perf-01-database-query-performance", "Database query performance", ["perf_queries"], "Database query worklist exists", "database-query-performance"),
      check("perf-02-server-response-caching", "Server response time and caching", ["perf_pages", "perf_route_handlers", "perf_dynamic_routes"], "Pages or route handlers exist", "server-response-caching"),
      check("perf-03-bundle-code-splitting", "Bundle size and code splitting", ["perf_client", "perf_dynamic", "perf_deps"], "Client components or dependencies exist", "bundle-code-splitting"),
      check("perf-04-react-rendering", "React rendering performance", ["perf_client", "perf_pages", "perf_compiler_status"], "React component surfaces exist", "react-rendering"),
      check("perf-05-perceived-performance", "Perceived performance and UX speed", ["perf_pages", "perf_loading", "perf_client"], "User-facing pages exist", "perceived-performance"),
      check("perf-06-infrastructure-network", "Infrastructure and network performance", ["perf_route_handlers", "perf_next_configs", "perf_large_files"], "Routes, config, or assets exist", "infrastructure-network"),
    ],
    lanes: [
      {
        laneId: "database-query-performance",
        label: "Database query performance",
        allowedWorklists: ["perf_queries"],
        receiptFields: RECEIPT_FIELDS,
      },
      {
        laneId: "server-response-caching",
        label: "Server response time and caching",
        allowedWorklists: ["perf_pages", "perf_route_handlers", "perf_dynamic_routes"],
        receiptFields: RECEIPT_FIELDS,
      },
      {
        laneId: "bundle-code-splitting",
        label: "Bundle size and code splitting",
        allowedWorklists: ["perf_client", "perf_dynamic", "perf_deps"],
        receiptFields: RECEIPT_FIELDS,
      },
      {
        laneId: "react-rendering",
        label: "React rendering performance",
        allowedWorklists: ["perf_client", "perf_pages", "perf_compiler_status"],
        receiptFields: RECEIPT_FIELDS,
      },
      {
        laneId: "perceived-performance",
        label: "Perceived performance and UX speed",
        allowedWorklists: ["perf_pages", "perf_loading", "perf_client"],
        receiptFields: RECEIPT_FIELDS,
      },
      {
        laneId: "infrastructure-network",
        label: "Infrastructure and network performance",
        allowedWorklists: ["perf_route_handlers", "perf_next_configs", "perf_large_files"],
        receiptFields: RECEIPT_FIELDS,
      },
    ],
  },
  {
    categoryId: "shared-reuse",
    skillName: "etrnl-audit-reuse",
    referencePath: "skills/etrnl-audit-reuse/references/audit-checks.md",
    executionMode: "sequential",
    requiredWorklists: worklists.reuse,
    checks: [
      check("reuse-01-existing-surfaces", "Existing reusable surfaces", ["reuse_components", "reuse_helpers", "reuse_modules"], "Components, helpers, modules, services, hooks, or utilities exist"),
      check("reuse-02-duplication-hotspots", "Duplication hotspots", ["reuse_duplicate_candidates", "reuse_source_files"], "Repeated names, patterns, or logic appear"),
      check("reuse-03-abstraction-fit", "Abstraction fit and ownership", ["reuse_modules", "reuse_helpers"], "Shared code or candidate shared code exists"),
      check("reuse-04-test-and-contract-reuse", "Reusable tests and contracts", ["reuse_tests", "reuse_modules"], "Test helpers, fixtures, contract tests, or shared schemas exist"),
      check("reuse-05-new-surface-justification", "New surface justification", ["reuse_duplicate_candidates", "reuse_components"], "New files or repeated components are in scope"),
    ],
    lanes: [],
  },
  {
    categoryId: "repo-hygiene",
    skillName: "etrnl-audit-repo",
    referencePath: "skills/etrnl-audit-repo/references/audit-checks.md",
    executionMode: "sequential",
    requiredWorklists: worklists.repo,
    checks: [
      check("repo-01-entrypoints", "Repository entrypoints", ["repo_docs_entrypoints", "repo_metadata"], "README, docs, package metadata, or startup files exist"),
      check("repo-02-file-organization", "File organization and ownership", ["repo_tracked_files"], "Tracked files exist"),
      check("repo-03-generated-artifacts", "Generated artifacts and cache drift", ["repo_generated_artifacts", "repo_ignored_files"], "Generated, build, cache, or ignored paths exist"),
      check("repo-04-config-consistency", "Config consistency", ["repo_metadata", "repo_tracked_files"], "Config files, manifests, or tool settings exist"),
      check("repo-05-public-private-boundary", "Public/private boundary", ["repo_tracked_files", "repo_docs_entrypoints"], "Public repo, docs, examples, or template surfaces exist"),
    ],
    lanes: [],
  },
  {
    categoryId: "tooling-ecosystem",
    skillName: "etrnl-audit-tooling",
    referencePath: "skills/etrnl-audit-tooling/references/audit-checks.md",
    executionMode: "sequential",
    requiredWorklists: worklists.tooling,
    checks: [
      check("tool-01-local-setup", "Local setup and bootstrap", ["tool_bootstrap", "tool_package_manifests"], "Install scripts, package managers, or local setup docs exist"),
      check("tool-02-command-parity", "Command parity across local and CI", ["tool_scripts", "tool_ci"], "Local scripts and CI workflows exist"),
      check("tool-03-lint-format-type-gates", "Lint, format, and type gates", ["tool_lint_format", "tool_package_manifests"], "Lint, format, typecheck, or static-analysis tooling exists"),
      check("tool-04-test-developer-loop", "Test developer loop", ["tool_tests", "tool_scripts"], "Tests or test scripts exist"),
      check("tool-05-upgrade-rollback", "Upgrade, update, and rollback paths", ["tool_scripts", "tool_bootstrap"], "Update, install, deploy, or rollback scripts exist"),
    ],
    lanes: [],
  },
];

/** Return the currently enforced deep-audit category ids in registry order. */
export function registeredCategoryIds() {
  return REGISTERED_DEEP_AUDIT_CATEGORIES.map((category) => category.categoryId);
}

/**
 * @returns {object | undefined} The registered category for `categoryId`, or undefined when absent.
 */
export function findCategory(categoryId) {
  return REGISTERED_DEEP_AUDIT_CATEGORIES.find((category) => category.categoryId === categoryId);
}

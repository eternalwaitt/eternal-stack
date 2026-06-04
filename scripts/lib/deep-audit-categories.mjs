export const CATEGORY_REGISTRY_VERSION = "2026-06-04.1";

export const KNOWN_UNIMPLEMENTED_CATEGORIES = [
  "ux-accessibility",
  "api-data",
  "docs",
  "payments",
  "privacy-compliance",
];

const worklists = {
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
};

const RECEIPT_FIELDS = ["laneId", "categoryId", "status", "consumedWorklistHashes", "summary"];

function check(checkId, label, requiredWorklists, applicabilityGate, laneId = "") {
  return { checkId, label, requiredWorklists, applicabilityGate, laneId };
}

export const REGISTERED_DEEP_AUDIT_CATEGORIES = [
  {
    categoryId: "production-readiness",
    skillName: "etrnl-production-readiness",
    referencePath: "skills/etrnl-production-readiness/references/audit-checks.md",
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
    skillName: "etrnl-security-audit",
    referencePath: "skills/etrnl-security-audit/references/audit-checks.md",
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
    skillName: "etrnl-performance-audit",
    referencePath: "skills/etrnl-performance-audit/references/audit-checks.md",
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
];

export function registeredCategoryIds() {
  return REGISTERED_DEEP_AUDIT_CATEGORIES.map((category) => category.categoryId);
}

/**
 * @returns {object | undefined} The registered category for `categoryId`, or undefined when absent.
 */
export function findCategory(categoryId) {
  return REGISTERED_DEEP_AUDIT_CATEGORIES.find((category) => category.categoryId === categoryId);
}

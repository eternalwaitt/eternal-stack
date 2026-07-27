/**
 * Release risk classification and capability manifest resolution.
 * Used by plan-readiness-check, pr-description-contract, release-controls-init,
 * and etrnl-ops-ship verification.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const RELEASE_CLASSES = ["routine", "guarded", "migration"];

/** High-risk domain patterns shared with plan-risk-tier.mjs */
export const HIGH_RISK_DOMAIN_PATTERNS = [
  /\bauth\b/i,
  /\bpayment\b/i,
  /\bmoney\b/i,
  /\bmigration\b/i,
  /\btenant\b/i,
];

/** Eternal Stack install/shipping-sensitive paths (stack repo PR gate) */
export const STACK_SHIPPING_SENSITIVE = [
  /^hooks\//,
  /^scripts\/install\.sh$/,
  /^scripts\/doctor\.sh$/,
  /^scripts\/rollback/,
  /^schemas\//,
  /^templates\//,
  /^VERSION$/,
  /^skills\//,
  /migration/i,
];

/** App-repo traffic-serving path patterns */
export const TRAFFIC_PATH_PATTERNS = [
  /^app\/api\//,
  /^pages\/api\//,
  /\/api\//,
  /\/route\.(ts|tsx|js|jsx|mjs)$/,
  /\.server\.(ts|tsx|js|jsx|mjs)$/,
  /^actions\//,
  /\/actions\//,
  /webhook/i,
  /\/cron\//,
  /\/queue\//,
  /\/worker/i,
  /\/workers\//,
  /\/jobs\//,
  /\/handlers\//,
  /\/middleware\.(ts|js)$/,
];

const SCHEMA_DATA_PATTERNS = [
  /\/migrations?\//,
  /\/prisma\//,
  /schema\.prisma$/,
  /\.sql$/,
  /\/drizzle\//,
  /\/supabase\/migrations\//,
];

const COMMAND_TOKEN_RE =
  /(`[^`]+`|git\s+revert|git\s+reset|pnpm\s+\w+|npm\s+\w+|yarn\s+\w+|bun\s+\w+|vercel\s+\w+|gh\s+\w+|docker\s+\w+|kubectl\s+\w+|fly\s+\w+|prisma\s+\w+)/i;

const METRIC_NAME_RE = /\b(metric|counter|histogram|trace|span|logBoundary|countPath|startSpan|[a-z][a-z0-9_]*\.(count|duration|latency|errors))\b/i;

function normalizeFiles(changedFiles) {
  if (!Array.isArray(changedFiles)) return [];
  return changedFiles.map((file) => String(file || "").replace(/\\/g, "/")).filter(Boolean);
}

function anyPathMatches(files, patterns) {
  return files.some((file) => patterns.some((pattern) => pattern.test(file)));
}

function haystackFromFiles(files) {
  return files.join("\n");
}

/**
 * Classify release risk from changed paths and optional plan tier.
 * Returns routine | guarded | migration.
 */
export function classifyReleaseRisk({ changedFiles = [], planTier = null, planText = "" } = {}) {
  const files = normalizeFiles(changedFiles);
  const haystack = [haystackFromFiles(files), String(planText || "")].join("\n");

  const touchesMigrationSurface =
    anyPathMatches(files, SCHEMA_DATA_PATTERNS) ||
    HIGH_RISK_DOMAIN_PATTERNS.some((pattern) => pattern.test(haystack)) ||
    anyPathMatches(files, STACK_SHIPPING_SENSITIVE);

  if (touchesMigrationSurface || (typeof planTier === "number" && planTier >= 3)) {
    return "migration";
  }

  const touchesTraffic =
    anyPathMatches(files, TRAFFIC_PATH_PATTERNS) ||
    (typeof planTier === "number" && planTier >= 2 && TRAFFIC_PATH_PATTERNS.some((p) => p.test(haystack)));

  if (touchesTraffic) {
    return "guarded";
  }

  return "routine";
}

/** Alias for backward compatibility in PR contract */
export function isShippingSensitive(changedFiles) {
  const releaseClass = classifyReleaseRisk({ changedFiles });
  return releaseClass !== "routine";
}

export function releaseClassLabel(releaseClass) {
  return RELEASE_CLASSES.includes(releaseClass) ? releaseClass : "routine";
}

/**
 * Required artifacts for a release class, parameterized by manifest capabilities.
 */
export function requirementsFor(releaseClass, manifest = {}) {
  const klass = releaseClassLabel(releaseClass);
  const flagProvider = manifest.flagProvider ?? "none";
  const observability = manifest.observabilityPlatform ?? "none";

  const base = {
    releaseClass: klass,
    artifacts: [],
    optional: [],
  };

  if (klass === "routine") {
    base.artifacts.push({ id: "rollback_path", label: "Revert path documented" });
    return base;
  }

  base.artifacts.push(
    { id: "rollback_command", label: "Literal rollback command" },
    { id: "structured_log", label: "Structured log at each new traffic boundary" },
    { id: "path_metric", label: "Metric per new traffic-serving path" },
  );

  if (flagProvider !== "none") {
    base.artifacts.push({ id: "stage_gate", label: "Named flag/env/router gate for canary promotion" });
  } else {
    base.optional.push({
      id: "deploy_watch_window",
      label: "Named deploy-and-watch observation window (no flag router declared)",
    });
  }

  if (observability !== "none") {
    base.artifacts.push({ id: "alert_threshold", label: "Numeric alert threshold on new-path metric or error rate" });
    base.artifacts.push({ id: "critical_span", label: "Trace or span on critical user path" });
  } else {
    base.optional.push({
      id: "console_telemetry",
      label: "Telemetry shim console fallback until platform is wired",
    });
  }

  if (klass === "migration") {
    base.artifacts.push(
      { id: "forward_compat", label: "Forward-compatible rollback or tested down-migration" },
      { id: "rollback_rehearsal", label: "Rehearsed rollback with timestamped result" },
      { id: "audit_production_green", label: "etrnl-audit-production green for this change" },
      { id: "named_owner", label: "Named ship owner and rollback decision owner" },
      { id: "go_no_go", label: "Recorded go/no-go with owner and timestamp" },
    );
  }

  return base;
}

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Resolve release manifest: env override, project .etrnl/release.json, home fallback.
 */
export function loadReleaseManifest(repoRoot = process.cwd()) {
  const resolvedRoot = path.resolve(repoRoot);
  const envPath = process.env.ETRNL_RELEASE_MANIFEST;
  const claudeHome = process.env.CLAUDE_HOME || path.join(process.env.HOME || "", ".claude");

  const candidates = [
    envPath ? path.resolve(envPath) : null,
    path.join(resolvedRoot, ".etrnl", "release.json"),
    path.join(claudeHome, "etrnl", "release.json"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const parsed = readJsonIfExists(candidate);
    if (parsed && typeof parsed === "object") {
      return { ok: true, path: candidate, manifest: parsed };
    }
  }

  return {
    ok: false,
    path: path.join(resolvedRoot, ".etrnl", "release.json"),
    manifest: null,
  };
}

export function rollbackSectionHasCommand(text) {
  const body = String(text || "");
  if (!body.trim()) return false;
  return COMMAND_TOKEN_RE.test(body);
}

export function observabilityMentioned(text) {
  const body = String(text || "");
  if (!body.trim()) return false;
  return METRIC_NAME_RE.test(body) || /\*\*Observability:\*\*/i.test(body) || /structured log/i.test(body);
}

export function forwardCompatibilityMentioned(text) {
  const body = String(text || "");
  if (!body.trim()) return false;
  return /forward[- ]compat|down[- ]migration|prior build reads|one-way|revert.*schema/i.test(body);
}

export function rollbackRehearsalMentioned(text) {
  const body = String(text || "");
  if (!body.trim()) return false;
  return /rehears|timestamp|executed rollback|rollback rehearsal/i.test(body);
}

export function extractRolloutSection(body) {
  const lines = String(body || "").split(/\r?\n/);
  let capture = false;
  const chunks = [];
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (capture) break;
      if (/^##\s+Rollout(?:\s+&\s+rollback|\s+and\s+rollback)?\s*$/i.test(line)) capture = true;
      continue;
    }
    if (capture) chunks.push(line);
  }
  return chunks.join("\n").trim();
}

export function validateReleaseSections({ releaseClass, body = "", technicalNotes = "" } = {}) {
  const klass = releaseClassLabel(releaseClass);
  const blockers = [];
  const warnings = [];
  const rollout = extractRolloutSection(body);
  const combined = `${rollout}\n${technicalNotes}`;

  if (klass === "routine") {
    if (rollout && !rollbackSectionHasCommand(rollout) && !/git revert|no migration|flag off/i.test(rollout)) {
      warnings.push("Rollout & rollback present but rollback path is thin — name revert steps or 'git revert; no migration'");
    }
    return { ok: blockers.length === 0, blockers, warnings, releaseClass: klass };
  }

  if (!rollout) {
    blockers.push(`release class ${klass} — add ## Rollout & rollback (rollout, rollback, breaking changes)`);
  } else {
    if (!rollbackSectionHasCommand(rollout)) {
      blockers.push("Rollout & rollback must include a literal rollback command (not a description only)");
    }
    if (klass === "guarded" || klass === "migration") {
      if (!observabilityMentioned(combined)) {
        blockers.push("Release class guarded/migration requires observability: name a metric or structured log per new traffic path");
      }
    }
    if (klass === "migration") {
      if (!forwardCompatibilityMentioned(rollout)) {
        blockers.push("Migration release class requires forward-compatibility or down-migration statement in Rollout & rollback");
      }
      if (!rollbackRehearsalMentioned(rollout)) {
        warnings.push("Migration class should record rollback rehearsal with timestamp in Rollout & rollback");
      }
    }
  }

  return { ok: blockers.length === 0, blockers, warnings, releaseClass: klass };
}

export function isEternalStackRepo(repoRoot) {
  const root = path.resolve(repoRoot);
  return (
    existsSync(path.join(root, "hooks/cc-userprompt-router.sh")) &&
    existsSync(path.join(root, "scripts/install.sh")) &&
    existsSync(path.join(root, "skills/etrnl-dev-plan/SKILL.md"))
  );
}

export function isDeployableAppRepo(repoRoot) {
  const root = path.resolve(repoRoot);
  return (
    existsSync(path.join(root, "package.json")) ||
    existsSync(path.join(root, "go.mod")) ||
    existsSync(path.join(root, "Cargo.toml"))
  );
}

/** Auto-bootstrap only for deployable app repos with guarded/migration release class. */
export function shouldAutoBootstrapReleaseControls({ repoRoot, releaseClass = null } = {}) {
  const klass = releaseClassLabel(releaseClass ?? "guarded");
  if (klass === "routine") return false;
  if (isEternalStackRepo(repoRoot)) return false;
  return isDeployableAppRepo(repoRoot);
}

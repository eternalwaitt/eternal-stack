#!/usr/bin/env node
/**
 * Bootstrap per-repo release controls: manifest, env-var gate, telemetry shim.
 *
 * Usage:
 *   node scripts/release-controls-init.mjs init <repo-root> [--dry-run] [--force] [--json]
 *   node scripts/release-controls-init.mjs check <repo-root> [--json]
 *   node scripts/release-controls-init.mjs ensure <repo-root> [--release-class guarded] [--dry-run] [--force] [--json]
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadReleaseManifest, shouldAutoBootstrapReleaseControls } from "./lib/release-controls.mjs";

const isCliMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
const argv = isCliMain ? process.argv.slice(2) : [];
const command = argv[0] || "help";
const positional = argv.filter((arg) => !arg.startsWith("--"));
const repoRootArg = positional[1];
const dryRun = argv.includes("--dry-run");
const force = argv.includes("--force");
const json = argv.includes("--json");

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function resolveRepoRoot(input) {
  if (!input) {
    throw new Error("repo-root argument required");
  }
  const resolved = path.resolve(input.replace(/\/+$/, "") || input);
  if (!existsSync(resolved)) {
    throw new Error(`repo root does not exist: ${resolved}`);
  }
  return resolved;
}

function readPackageJson(root) {
  const pkgPath = path.join(root, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    return null;
  }
}

function detectPackageManager(root) {
  if (existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (existsSync(path.join(root, "bun.lockb"))) return "bun";
  if (existsSync(path.join(root, "package-lock.json"))) return "npm";
  if (existsSync(path.join(root, "Cargo.toml"))) return "cargo";
  if (existsSync(path.join(root, "go.mod"))) return "go";
  return "";
}

function detectObservability(root, pkg) {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const names = Object.keys(deps);
  if (names.some((name) => name.startsWith("@sentry/"))) return "sentry";
  if (names.some((name) => name.startsWith("@opentelemetry/"))) return "opentelemetry";
  if (names.some((name) => /axiom|datadog|@datadog\//i.test(name))) {
    return names.some((n) => /datadog/i.test(n)) ? "datadog" : "axiom";
  }
  return "none";
}

function detectHosting(root) {
  if (existsSync(path.join(root, "vercel.json"))) return "vercel";
  if (existsSync(path.join(root, "fly.toml"))) return "fly";
  if (existsSync(path.join(root, "Dockerfile"))) return "docker";
  return "unknown";
}

function detectSourceRoot(root) {
  const candidates = ["src", "app", "lib", "server"];
  for (const candidate of candidates) {
    if (existsSync(path.join(root, candidate))) return candidate;
  }
  return "src";
}

function detectLanguage(root, pkg) {
  if (existsSync(path.join(root, "tsconfig.json"))) return "typescript";
  if (pkg?.type === "module") return "javascript";
  return "javascript";
}

function defaultRollbackCommand(packageManager, hosting) {
  if (hosting === "vercel") return "vercel rollback";
  if (packageManager === "pnpm") return "git revert HEAD && pnpm install && pnpm build";
  if (packageManager === "npm") return "git revert HEAD && npm install && npm run build";
  return "git revert HEAD";
}

export function detectReleaseCapabilities(root) {
  const pkg = readPackageJson(root);
  const packageManager = detectPackageManager(root);
  const observabilityPlatform = detectObservability(root, pkg);
  const hosting = detectHosting(root);
  const sourceRoot = detectSourceRoot(root);
  const language = detectLanguage(root, pkg);
  const flagProvider = "env";

  return {
    root,
    packageManager,
    observabilityPlatform,
    hosting,
    sourceRoot,
    language,
    flagProvider,
    rollbackCommand: defaultRollbackCommand(packageManager, hosting),
  };
}

function manifestFromDetection(detection) {
  return {
    schemaVersion: 1,
    installedAt: new Date().toISOString(),
    rollbackCommand: detection.rollbackCommand,
    flagProvider: detection.flagProvider,
    observabilityPlatform: detection.observabilityPlatform,
    hosting: detection.hosting,
    sourceRoot: detection.sourceRoot,
    language: detection.language,
    packageManager: detection.packageManager,
    modules: {
      releaseGate: `${detection.sourceRoot}/lib/release-gate.${detection.language === "typescript" ? "ts" : "js"}`,
      telemetry: `${detection.sourceRoot}/lib/release-telemetry.${detection.language === "typescript" ? "ts" : "js"}`,
    },
    checksums: {},
  };
}

function releaseGateModule(language) {
  const ext = language === "typescript" ? "ts" : "js";
  if (ext === "ts") {
    return `/** Dependency-free env-var release gate. Generated by release-controls-init.mjs */
export type ReleaseStage = "off" | "canary" | "partial" | "full";

const STAGE_ENV = "RELEASE_STAGE";
const CANARY_TENANT_ENV = "RELEASE_CANARY_TENANT";

export function currentReleaseStage(): ReleaseStage {
  const raw = (process.env[STAGE_ENV] || "full").toLowerCase();
  if (raw === "off" || raw === "canary" || raw === "partial" || raw === "full") return raw;
  return "full";
}

export function isReleaseEnabledForTenant(tenantId?: string): boolean {
  const stage = currentReleaseStage();
  if (stage === "off") return false;
  if (stage === "full") return true;
  if (stage === "canary") {
    const allowed = (process.env[CANARY_TENANT_ENV] || "").split(",").map((v) => v.trim()).filter(Boolean);
    return allowed.length === 0 ? false : Boolean(tenantId && allowed.includes(tenantId));
  }
  return true;
}

export function releaseGateMeta() {
  return { stageEnv: STAGE_ENV, canaryTenantEnv: CANARY_TENANT_ENV, stage: currentReleaseStage() };
}
`;
  }
  return `/** Dependency-free env-var release gate. Generated by release-controls-init.mjs */
export function currentReleaseStage() {
  const raw = String(process.env.RELEASE_STAGE || "full").toLowerCase();
  if (raw === "off" || raw === "canary" || raw === "partial" || raw === "full") return raw;
  return "full";
}

export function isReleaseEnabledForTenant(tenantId) {
  const stage = currentReleaseStage();
  if (stage === "off") return false;
  if (stage === "full") return true;
  if (stage === "canary") {
    const allowed = String(process.env.RELEASE_CANARY_TENANT || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    return allowed.length > 0 && Boolean(tenantId && allowed.includes(tenantId));
  }
  return true;
}

export function releaseGateMeta() {
  return { stageEnv: "RELEASE_STAGE", canaryTenantEnv: "RELEASE_CANARY_TENANT", stage: currentReleaseStage() };
}
`;
}

function telemetryModule(language, observabilityPlatform) {
  const ext = language === "typescript" ? "ts" : "js";
  const platformNote = observabilityPlatform === "none" ? "console" : observabilityPlatform;
  if (ext === "ts") {
    return `/** Telemetry shim — delegates to ${platformNote} when wired. Generated by release-controls-init.mjs */
type BoundaryPayload = Record<string, unknown>;

export function logBoundary(event: string, payload: BoundaryPayload = {}) {
  const record = { ts: new Date().toISOString(), event, ...payload };
  console.info(JSON.stringify(record));
}

export function countPath(pathName: string, value = 1) {
  logBoundary("metric.count", { path: pathName, value });
}

export function startSpan(name: string) {
  const started = Date.now();
  logBoundary("trace.start", { span: name });
  return {
    end(extra: BoundaryPayload = {}) {
      logBoundary("trace.end", { span: name, durationMs: Date.now() - started, ...extra });
    },
  };
}
`;
  }
  return `/** Telemetry shim — delegates to ${platformNote} when wired. Generated by release-controls-init.mjs */
export function logBoundary(event, payload = {}) {
  const record = { ts: new Date().toISOString(), event, ...payload };
  console.info(JSON.stringify(record));
}

export function countPath(pathName, value = 1) {
  logBoundary("metric.count", { path: pathName, value });
}

export function startSpan(name) {
  const started = Date.now();
  logBoundary("trace.start", { span: name });
  return {
    end(extra = {}) {
      logBoundary("trace.end", { span: name, durationMs: Date.now() - started, ...extra });
    },
  };
}
`;
}

function plannedFiles(root, detection) {
  const manifestPath = path.join(root, ".etrnl", "release.json");
  const gateRel = `${detection.sourceRoot}/lib/release-gate.${detection.language === "typescript" ? "ts" : "js"}`;
  const telemetryRel = `${detection.sourceRoot}/lib/release-telemetry.${detection.language === "typescript" ? "ts" : "js"}`;
  const manifest = manifestFromDetection(detection);
  const gateContent = releaseGateModule(detection.language);
  const telemetryContent = telemetryModule(detection.language, detection.observabilityPlatform);
  manifest.checksums = {
    [gateRel]: sha256(gateContent),
    [telemetryRel]: sha256(telemetryContent),
  };
  return [
    { rel: ".etrnl/release.json", abs: manifestPath, content: `${JSON.stringify(manifest, null, 2)}\n` },
    { rel: gateRel, abs: path.join(root, gateRel), content: gateContent },
    { rel: telemetryRel, abs: path.join(root, telemetryRel), content: telemetryContent },
  ];
}

function writeOrPlan(root, files, { dryRun = false, force = false } = {}) {
  const results = [];
  for (const file of files) {
    const exists = existsSync(file.abs);
    if (exists && !force) {
      results.push({ rel: file.rel, status: "skipped", reason: "exists" });
      continue;
    }
    if (exists && force) {
      if (dryRun) {
        results.push({ rel: file.rel, status: "dry-run-overwrite" });
        continue;
      }
      writeFileSync(file.abs, file.content, "utf8");
      results.push({ rel: file.rel, status: "overwritten" });
      continue;
    }
    if (dryRun) {
      results.push({ rel: file.rel, status: "dry-run-create" });
      continue;
    }
    mkdirSync(path.dirname(file.abs), { recursive: true });
    writeFileSync(file.abs, file.content, "utf8");
    results.push({ rel: file.rel, status: "installed" });
  }
  return results;
}

export function checkReleaseControls(root) {
  const issues = [];
  const loaded = loadReleaseManifest(root);
  if (!loaded.ok) {
    issues.push("missing manifest: .etrnl/release.json");
  } else {
    const manifest = loaded.manifest;
    for (const rel of Object.values(manifest.modules ?? {})) {
      if (!existsSync(path.join(root, rel))) {
        issues.push(`missing module: ${rel}`);
      } else if (manifest.checksums?.[rel]) {
        const content = readFileSync(path.join(root, rel), "utf8");
        if (sha256(content) !== manifest.checksums[rel]) {
          issues.push(`checksum drift: ${rel}`);
        }
      }
    }
  }
  return { ok: issues.length === 0, issues, manifestPath: loaded.path };
}

export function initReleaseControls(root, { dryRun = false, force = false } = {}) {
  const resolved = path.resolve(root);
  const detection = detectReleaseCapabilities(resolved);
  const files = plannedFiles(resolved, detection);
  const results = writeOrPlan(resolved, files, { dryRun, force });
  return { ok: true, root: resolved, dryRun, force, detection, results };
}

export function ensureReleaseControls(root, { dryRun = false, force = false, releaseClass = null } = {}) {
  const resolved = path.resolve(root);
  const existing = checkReleaseControls(resolved);
  if (existing.ok) {
    return { ok: true, action: "present", root: resolved, ...existing };
  }
  if (!shouldAutoBootstrapReleaseControls({ repoRoot: resolved, releaseClass })) {
    return {
      ok: false,
      action: "skipped",
      reason: "auto-bootstrap not applicable for this repo or release class",
      root: resolved,
      issues: existing.issues,
    };
  }
  if (dryRun) {
    const detection = detectReleaseCapabilities(resolved);
    const files = plannedFiles(resolved, detection);
    return {
      ok: false,
      action: "would-init",
      root: resolved,
      issues: existing.issues,
      planned: files.map((f) => f.rel),
    };
  }
  const initResult = initReleaseControls(resolved, { force });
  const after = checkReleaseControls(resolved);
  return {
    ok: after.ok,
    action: "init",
    root: resolved,
    initResult,
    issues: after.issues,
    manifestPath: after.manifestPath,
  };
}

function emit(payload, humanLines = []) {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    for (const line of humanLines) console.log(line);
  }
}

if (isCliMain) {
try {
  if (command === "detect") {
    const root = resolveRepoRoot(repoRootArg);
    const detection = detectReleaseCapabilities(root);
    emit(detection, [`detect: root=${root} pm=${detection.packageManager} obs=${detection.observabilityPlatform}`]);
    process.exit(0);
  }

  if (command === "check") {
    const root = resolveRepoRoot(repoRootArg);
    const result = checkReleaseControls(root);
    emit(result, result.ok ? [`ok: release controls present at ${root}`] : result.issues.map((i) => `issue: ${i}`));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === "init") {
    const root = resolveRepoRoot(repoRootArg);
    const payload = initReleaseControls(root, { dryRun, force });
    emit(payload, [
      dryRun ? `dry-run: profile=release-controls target=${root}` : `done: installed release controls at ${root}`,
      ...payload.results.map((r) => `${r.status}: ${r.rel}${r.reason ? ` (${r.reason})` : ""}`),
    ]);
    process.exit(0);
  }

  if (command === "ensure") {
    const root = resolveRepoRoot(repoRootArg);
    const releaseClassArg = argv.find((arg, i) => argv[i - 1] === "--release-class");
    const result = ensureReleaseControls(root, { dryRun, force, releaseClass: releaseClassArg || null });
    emit(result, result.ok
      ? [`ok: release controls ready at ${root} (${result.action})`]
      : [`ensure: ${result.action}${result.reason ? ` — ${result.reason}` : ""}`, ...(result.issues ?? []).map((i) => `issue: ${i}`)]);
    process.exit(result.ok ? 0 : result.action === "skipped" ? 0 : 1);
  }

  console.error("usage: release-controls-init.mjs detect|check|init|ensure <repo-root> [--dry-run] [--force] [--release-class routine|guarded|migration] [--json]");
  process.exit(2);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (json) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  else console.error(`release-controls-init: ${message}`);
  process.exit(2);
}
}

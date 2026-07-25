#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { isAuditExcludedPath } from "./lib/audit-exclusions.mjs";
import { argValue } from "./lib/cli-args.mjs";
import { gitSubprocessLimits } from "./lib/env-utils.mjs";
import { walkFiles } from "./lib/fs-walk.mjs";

const args = process.argv.slice(2);
const DEFAULT_GIT_TIMEOUT_MS = 15_000;
const DEFAULT_GIT_MAX_BUFFER = 20 * 1024 * 1024;
const GIT_LIMITS = gitSubprocessLimits({
  timeoutMs: DEFAULT_GIT_TIMEOUT_MS,
  maxBufferBytes: DEFAULT_GIT_MAX_BUFFER,
});
const MAX_SCAN_BYTES = 512 * 1024;
const STATES_PER_SURFACE = 6;
const DEFAULT_VIEWPORTS = ["375x812", "768x1024", "1440x900"];
const DEFAULT_DATA_VOLUMES = ["empty", "single", "many", "overflow"];

let json = false;
let quiet = false;
let root = process.cwd();
let rootProvided = false;
let maxRows = 25;

function fail(message) {
  console.error(`ux-inventory: ${message}`);
  process.exit(1);
}

if (args.includes("--help")) {
  console.log("usage: ux-inventory.mjs [--json] [--quiet] [--root <path>] [--max-rows <n>]");
  process.exit(0);
}

const KNOWN_FLAGS = new Set(["--json", "--quiet", "--root", "--max-rows", "--help"]);
for (const arg of args) {
  if (!arg.startsWith("--")) continue;
  const name = arg.split("=", 1)[0];
  if (!KNOWN_FLAGS.has(name)) fail(`unknown option: ${name}`);
}
json = args.includes("--json");
quiet = args.includes("--quiet");

const rootArg = argValue(args, "--root");
if (rootArg) {
  root = rootArg;
  rootProvided = true;
}

const maxRowsArg = argValue(args, "--max-rows");
if (maxRowsArg) {
  if (!/^[1-9][0-9]*$/.test(maxRowsArg)) fail("--max-rows requires a positive integer");
  maxRows = Number(maxRowsArg);
  if (!Number.isSafeInteger(maxRows)) fail("--max-rows is too large");
}

function git(gitArgs, options = {}) {
  const result = spawnSync("git", gitArgs, {
    cwd: root,
    encoding: "utf8",
    timeout: GIT_LIMITS.timeout,
    maxBuffer: GIT_LIMITS.maxBuffer,
  });
  if (result.status === 0 && !result.error) return result.stdout;
  if (options.allowFailure === true) return "";
  const stderr = String(result.stderr || result.error?.message || "").trim();
  throw new Error(`git ${gitArgs.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
}

if (!existsSync(root)) fail(`root does not exist: ${root}`);
if (!rootProvided) {
  const topLevel = git(["rev-parse", "--show-toplevel"], { allowFailure: true }).trim();
  if (topLevel) root = topLevel;
}

// Git listing keeps the inventory to first-party tracked surfaces. A target that
// is not a git checkout still gets a full inventory through the filesystem walk.
function targetFiles() {
  const tracked = git(["ls-files", "-z"], { allowFailure: true });
  const fromGit = tracked
    .split("\0")
    .map((file) => file.trim())
    .filter(Boolean);
  const files = fromGit.length > 0
    ? fromGit
    : Array.from(walkFiles(root, { skipDir: (name) => name.startsWith(".") || isAuditExcludedPath(name) }))
      .map((file) => path.relative(root, file).replace(/\\/g, "/"));
  return files
    .filter((file) => !isAuditExcludedPath(file))
    .sort((left, right) => left.localeCompare(right));
}

const COMPONENT_EXTS = new Set([".tsx", ".jsx", ".vue", ".svelte", ".astro"]);
const STYLE_EXTS = new Set([".css", ".scss", ".sass", ".less", ".pcss", ".styl"]);
const COPY_DATA_EXTS = new Set([".json", ".yml", ".yaml", ".po", ".ftl"]);
const SCRIPT_EXTS = new Set([".ts", ".js", ".mjs", ".cjs"]);

function isTestLike(file) {
  return /(\.test|\.spec|\.stories|\.story)\.[cm]?[jt]sx?$|(^|\/)(__tests__|__mocks__|e2e|cypress|playwright)\//i.test(file);
}

function isRoutePath(file) {
  const lower = file.toLowerCase();
  if (/(^|\/)(app|src\/app)\/.*\/page\.[jt]sx?$/.test(lower) || /(^|\/)(app|src\/app)\/page\.[jt]sx?$/.test(lower)) return true;
  if (/(^|\/)pages\/(?!api\/)(?!_(app|document|error)\.)/.test(lower) && /\.[jt]sx$/.test(lower)) return true;
  if (/(^|\/)routes\/.*\.(tsx|jsx|vue|svelte)$/.test(lower)) return true;
  if (/\+page\.(svelte|ts|js)$/.test(lower)) return true;
  if (/(^|\/)(views|screens)\/.*\.(tsx|jsx|vue|svelte)$/.test(lower)) return true;
  return false;
}

function isI18nDataPath(file) {
  return /(^|\/)(locales?|messages|i18n|lang|translations?)\//i.test(file);
}

function readSource(file) {
  const abs = path.join(root, file);
  try {
    if (statSync(abs).size > MAX_SCAN_BYTES) return "";
    return readFileSync(abs, "utf8");
  } catch {
    return "";
  }
}

const INTERACTIVE_PATTERN = /<(?:button|input|select|textarea|form|dialog|a\s)|onClick|onSubmit|onChange|role=|aria-|tabIndex|href=/i;
const ASYNC_STATE_PATTERN = /useState|useReducer|useQuery|useMutation|useSWR|useActionState|useFormStatus|useTransition|isLoading|isPending|isError|await\s+fetch|\bSuspense\b|createResource|\$state|writable\(/;
const STYLE_MARKUP_PATTERN = /className=|class=|styled\.|css`|tw`|:class=/;
const COPY_MARKUP_PATTERN = />[^<>{}\n]*[A-Za-z]{3,}[^<>{}\n]*<|placeholder=|aria-label=|title=|label=|alt=|\bt\(['"`]/;

const SCAN_PATTERNS = [
  { id: "arbitrarySpacing", label: "Arbitrary spacing values next to a scale", pattern: /\b(?:p|m|gap|space|w|h|min-w|min-h|max-w|max-h|top|left|right|bottom|inset)[a-z]{0,2}-\[[^\]]+\]/g },
  { id: "arbitraryTypography", label: "Arbitrary type values next to a ramp", pattern: /\b(?:text|leading|tracking|font)-\[[^\]]+\]/g },
  { id: "smallBodyText", label: "Body text below 16px", pattern: /text-\[(?:[0-9]|1[0-5])(?:\.\d+)?px\]|font-size:\s*(?:[0-9]|1[0-5])(?:\.\d+)?px/g },
  { id: "gradientDefaults", label: "Purple/violet gradient defaults", pattern: /(?:from|via|to)-(?:purple|violet|indigo|fuchsia)-\d{2,3}|linear-gradient\([^)]*(?:purple|violet|#7c3aed|#8b5cf6|#6366f1)/gi },
  { id: "hardcodedColors", label: "Hard-coded hex colors in markup", pattern: /#[0-9a-fA-F]{6}\b/g },
  { id: "missingAltText", label: "Image tags without alt text", pattern: /<img(?![^>]*\balt=)[^>]*>/gi },
  { id: "nonInteractiveClickHandler", label: "Click handlers on non-interactive elements", pattern: /<(?:div|span|li|td)[^>]*onClick/gi },
  { id: "emojiIcons", label: "Emoji used as iconography", pattern: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu },
];

function scanRows(file, text, collected) {
  const lines = text.split(/\r?\n/);
  for (const entry of SCAN_PATTERNS) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      entry.pattern.lastIndex = 0;
      const match = entry.pattern.exec(line);
      if (!match) continue;
      const bucket = collected.get(entry.id);
      bucket.count += 1;
      if (bucket.rows.length < maxRows) {
        bucket.rows.push({ path: file, line: index + 1, match: match[0].slice(0, 80) });
      }
    }
  }
}

function placeholderAsLabel(file, text, collected) {
  if (!/placeholder=/.test(text)) return;
  if (/<label|aria-label=|aria-labelledby=|\.label\b/i.test(text)) return;
  const bucket = collected.get("placeholderAsLabel");
  bucket.count += 1;
  if (bucket.rows.length < maxRows) bucket.rows.push({ path: file, line: 0, match: "placeholder without label" });
}

function sha256(items) {
  return createHash("sha256").update(items.join("\n")).digest("hex");
}

function worklist(id, items) {
  return {
    artifactLabel: id,
    count: items.length,
    sha256: sha256(items),
    items,
  };
}

const files = targetFiles();
const buckets = {
  ux_routes: [],
  ux_components: [],
  ux_states: [],
  ux_styles: [],
  ux_copy: [],
  ux_accessibility: [],
};
const collected = new Map([
  ...SCAN_PATTERNS.map((entry) => [entry.id, { label: entry.label, count: 0, rows: [] }]),
  ["placeholderAsLabel", { label: "Placeholder used as the only label", count: 0, rows: [] }],
]);
const axisEvidence = {
  darkMode: false,
  reducedMotion: false,
  rtl: false,
  auth: false,
  privilegedRole: false,
  designBaseline: existsSync(path.join(root, "DESIGN.md")),
  locales: new Set(),
};

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  const isComponentFile = COMPONENT_EXTS.has(ext);
  const isStyleFile = STYLE_EXTS.has(ext);
  const isCopyData = COPY_DATA_EXTS.has(ext) && isI18nDataPath(file);
  const isScript = SCRIPT_EXTS.has(ext);
  if (!isComponentFile && !isStyleFile && !isCopyData && !isScript) continue;
  if (isTestLike(file)) continue;

  if (isCopyData) {
    buckets.ux_copy.push(file);
    const localeMatch = path.basename(file, ext).match(/^([a-z]{2}(?:[-_][A-Za-z]{2,4})?)$/);
    if (localeMatch) axisEvidence.locales.add(localeMatch[1]);
    continue;
  }

  const text = readSource(file);
  if (text) {
    if (/darkMode\s*:|prefers-color-scheme|next-themes|data-theme|\bdark:/.test(text)) axisEvidence.darkMode = true;
    if (/prefers-reduced-motion/.test(text)) axisEvidence.reducedMotion = true;
    if (/dir=["']rtl|direction:\s*rtl|\brtl\b/.test(text)) axisEvidence.rtl = true;
    if (/next-auth|better-auth|@clerk|useSession|getServerSession|supabase\.auth|auth\(\)/.test(text)) axisEvidence.auth = true;
    if (/isAdmin|role\s*===\s*["'](?:admin|owner)|hasPermission|requireRole/.test(text)) axisEvidence.privilegedRole = true;
  }

  if (isStyleFile) {
    buckets.ux_styles.push(file);
    if (text) scanRows(file, text, collected);
    continue;
  }

  const route = isRoutePath(file);
  if (route) buckets.ux_routes.push(file);
  if (isComponentFile) {
    if (!route) buckets.ux_components.push(file);
    if (text) {
      scanRows(file, text, collected);
      placeholderAsLabel(file, text, collected);
      if (ASYNC_STATE_PATTERN.test(text) || INTERACTIVE_PATTERN.test(text)) buckets.ux_states.push(file);
      if (STYLE_MARKUP_PATTERN.test(text)) buckets.ux_styles.push(file);
      if (COPY_MARKUP_PATTERN.test(text)) buckets.ux_copy.push(file);
      if (INTERACTIVE_PATTERN.test(text)) buckets.ux_accessibility.push(file);
    }
    continue;
  }

  if (isScript && text && /createBrowserRouter|createRouter|<Routes>|defineRoutes|RouterProvider/.test(text)) {
    buckets.ux_routes.push(file);
  }
  if (isScript && text && isI18nDataPath(file)) buckets.ux_copy.push(file);
}

const worklists = Object.fromEntries(
  Object.entries(buckets).map(([id, items]) => [id, worklist(id, Array.from(new Set(items)).sort((left, right) => left.localeCompare(right)))]),
);

const axes = {
  viewports: DEFAULT_VIEWPORTS,
  themes: axisEvidence.darkMode ? ["light", "dark"] : ["light"],
  locales: axisEvidence.locales.size > 0 ? Array.from(axisEvidence.locales).sort() : ["default"],
  textDirections: axisEvidence.rtl ? ["ltr", "rtl"] : ["ltr"],
  authStates: axisEvidence.auth
    ? (axisEvidence.privilegedRole ? ["anonymous", "authenticated", "privileged"] : ["anonymous", "authenticated"])
    : ["anonymous"],
  dataVolumes: DEFAULT_DATA_VOLUMES,
  zoomLevels: ["100", "200"],
};

const mechanicalScan = Object.fromEntries(
  Array.from(collected.entries()).map(([id, bucket]) => [id, { label: bucket.label, count: bucket.count, rows: bucket.rows }]),
);
mechanicalScan.reducedMotionFallbackPresent = axisEvidence.reducedMotion;
mechanicalScan.designBaselinePresent = axisEvidence.designBaseline;

const report = {
  schemaVersion: 1,
  root,
  generatedAt: new Date().toISOString(),
  worklists,
  axes,
  totals: {
    routes: worklists.ux_routes.count,
    surfaces: worklists.ux_states.count,
    stateCells: worklists.ux_states.count * STATES_PER_SURFACE,
    routeViewportCells: worklists.ux_routes.count * axes.viewports.length,
    statesPerSurface: STATES_PER_SURFACE,
  },
  mechanicalScan,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else if (!quiet) {
  console.log("# UX Inventory\n");
  console.log(`Root: ${report.root}`);
  console.log(`Design baseline (DESIGN.md): ${axisEvidence.designBaseline ? "present" : "absent"}\n`);
  console.log("| Worklist | Count |");
  console.log("| --- | ---: |");
  for (const [id, entry] of Object.entries(worklists)) console.log(`| ${id} | ${entry.count} |`);
  console.log("\n| Axis | Values |");
  console.log("| --- | --- |");
  for (const [id, values] of Object.entries(axes)) console.log(`| ${id} | ${values.join(", ")} |`);
  console.log(`\nRoute x viewport cells: ${report.totals.routeViewportCells}`);
  console.log(`Surface x state cells: ${report.totals.stateCells}\n`);
  console.log("| Mechanical scan | Count |");
  console.log("| --- | ---: |");
  for (const [id, entry] of Object.entries(mechanicalScan)) {
    if (typeof entry === "boolean") console.log(`| ${id} | ${entry ? "yes" : "no"} |`);
    else console.log(`| ${id} | ${entry.count} |`);
  }
}

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const hindsightOnly = args.includes("--hindsight");
const profilePath = args.find((arg) => !arg.startsWith("--"));
const LIFECYCLE_REQUIRED_HOOKS = ["cc-sessionstart-restore.sh", "cc-precompact-save.sh", "cc-postcompact-record.sh", "cc-stop-verifier.sh"];
const SECRET_PATTERNS = [
  /sk-(proj-|ant-)?[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9_]{20,}/,
  /glpat-[A-Za-z0-9_-]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /npm_[A-Za-z0-9]{20,}/,
  /\b(?:AKIA|ASIA|OCI)[A-Z0-9]{12,}\b/,
  /BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY/,
  /\?sv=2[0-9-]+.*&sig=[A-Za-z0-9%+/=]+/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b(?=[A-Za-z0-9+/_-]{40,}={0,2}\b)(?=[A-Za-z0-9+/_-]*[+/])[A-Za-z0-9+/_-]+={0,2}\b/,
];

function usage() {
  console.error("usage: stack-profile-check.mjs <profile.json> [--json] [--hindsight]");
  process.exit(2);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log("usage: stack-profile-check.mjs <profile.json> [--json] [--hindsight]");
  process.exit(0);
}
if (!profilePath) usage();

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${file}: ${detail}`);
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasSecretLookingText(value) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(String(value)));
}

function hasPrivateHomePath(value) {
  const normalized = String(value).replace(/\\/g, "/");
  return /\/Users\/[^/\s]+/i.test(normalized) ||
    /^[A-Za-z]:\/Users\/[^/\s]+/i.test(normalized) ||
    /\/mnt\/[a-z]\/Users\/[^/\s]+/i.test(normalized) ||
    /\/mnt\/wsl\/[^/\s]+\/Users\/[^/\s]+/i.test(normalized) ||
    /\/home\/[^/\s]+/i.test(normalized) ||
    /^\/root(?:\/|$)/i.test(normalized);
}

function walk(value, trail = [], visit) {
  visit(value, trail);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    walk(child, [...trail, key], visit);
  }
}

function validate(profile, file) {
  const errors = [];
  const warnings = [];
  const components = profile.components && typeof profile.components === "object" ? profile.components : {};
  const component = (id) => components[id] && typeof components[id] === "object" ? components[id] : {};

  if (profile.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!["core", "full"].includes(profile.profile)) errors.push("profile must be core or full");
  if (!profile.installCommand || typeof profile.installCommand !== "string") errors.push("installCommand is required");
  if (profile.rollback?.required !== true) errors.push("rollback.required must be true");
  if (component("etrnl").enabled !== true) errors.push("components.etrnl.enabled must be true");

  if (typeof component("etrnl").requiredHooksIntent !== "string" || component("etrnl").requiredHooksIntent.trim().length === 0) {
    errors.push("components.etrnl.requiredHooksIntent is required");
  }
  for (const hook of LIFECYCLE_REQUIRED_HOOKS) {
    if (!asArray(component("etrnl").requiredHooks).includes(hook)) {
      errors.push(`components.etrnl.requiredHooks missing ${hook}`);
    }
  }

  walk(profile, [], (value, trail) => {
    if (typeof value !== "string") return;
    if (hasSecretLookingText(value)) errors.push(`secret-looking value at ${trail.join(".") || "<root>"}`);
    if (hasPrivateHomePath(value)) errors.push(`private absolute home path at ${trail.join(".") || "<root>"}`);
  });

  if (profile.profile === "core") {
    for (const id of ["hindsight", "beads", "codegraph"]) {
      if (component(id).enabled === true) {
        errors.push(`core profile must not enable ${id}`);
      }
    }
  }

  if (profile.profile === "full") {
    for (const id of ["hindsight", "beads", "codegraph"]) {
      if (component(id).enabled !== true) errors.push(`full profile must enable ${id}`);
      if (!component(id).skipFlag) errors.push(`components.${id}.skipFlag is required`);
      if (asArray(component(id).healthChecks).length === 0) errors.push(`components.${id}.healthChecks must not be empty`);
    }
    if (!["local-daemon", "external-api", "docker-server"].includes(component("hindsight").mode)) {
      errors.push("components.hindsight.mode must be local-daemon, external-api, or docker-server");
    }
    if (component("hindsight").privacy?.retainToolCalls !== false) {
      errors.push("components.hindsight.privacy.retainToolCalls must be false");
    }
    if (component("beads").rawHooksAllowed !== false) {
      errors.push("components.beads.rawHooksAllowed must be false");
    }
    if (component("beads").rawPrimeAllowed !== false) {
      errors.push("components.beads.rawPrimeAllowed must be false");
    }
  }

  if (hindsightOnly && component("hindsight").enabled !== true) {
    errors.push("--hindsight requires an enabled Hindsight profile");
  }

  if (!path.basename(file).startsWith(`stack-profile.${profile.profile}`)) {
    warnings.push(`filename does not match profile ${profile.profile}`);
  }

  return {
    ok: errors.length === 0,
    schemaVersion: 1,
    command: "stack-profile-check",
    file: path.resolve(file),
    profile: profile.profile,
    errors,
    warnings,
    components: Object.fromEntries(Object.entries(components).map(([id, value]) => [id, { enabled: value?.enabled === true }])),
  };
}

let result;
try {
  result = validate(readJson(profilePath), profilePath);
} catch (error) {
  result = {
    ok: false,
    schemaVersion: 1,
    command: "stack-profile-check",
    file: path.resolve(profilePath),
    profile: "",
    errors: [error instanceof Error ? error.message : String(error)],
    warnings: [],
    components: {},
  };
}

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.ok) {
  console.log(`ok: ${result.profile} stack profile valid`);
  for (const warning of result.warnings) console.log(`warning: ${warning}`);
} else {
  console.error(`fail: stack profile invalid: ${profilePath}`);
  for (const error of result.errors) console.error(`- ${error}`);
}

process.exit(result.ok ? 0 : 1);

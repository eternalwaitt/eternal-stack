#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { argValue } from "./lib/cli-args.mjs";
import {
  createSkeleton,
  error as artifactError,
  readJsonFile,
  validateBundle,
  validateCompletion,
  validateDeepStackPlanFile,
  validateFindings,
  validateReuse,
  validateRiskTier,
  validateSkills,
  validateSources,
} from "./lib/deep-stack-artifacts.mjs";

const args = process.argv.slice(2);
const command = args[0] || "help";
const json = args.includes("--json");
const allowTransitional = args.includes("--allow-transitional");

function usage() {
  console.error("usage: deep-stack-check.mjs create|validate-plan|validate-sources|validate-skills|validate-reuse|validate-findings|validate-completion|validate-risk-tier|validate-artifact");
  process.exit(2);
}

function artifactArg() {
  const artifact = argValue(args, "--artifact");
  if (!artifact) {
    console.error("deep-stack-check requires --artifact for this command.");
    process.exit(2);
  }
  if (!existsSync(artifact)) {
    const result = {
      ok: false,
      errors: [artifactError(
        "DEEP_ARTIFACT_MISSING",
        artifact,
        "--artifact",
        "The requested artifact does not exist.",
        `Create it with: node scripts/deep-stack-check.mjs create --plan <plan> --out ${path.dirname(artifact) || "."}`,
      )],
    };
    if (json) report(result);
    console.error(`error: deep-stack artifact not found: ${artifact}`);
    console.error(`fix: node scripts/deep-stack-check.mjs create --plan <plan> --out ${path.dirname(artifact) || "."}`);
    process.exit(1);
  }
  return artifact;
}

function loadArtifact(artifactPath) {
  try {
    return readJsonFile(artifactPath);
  } catch (err) {
    report({
      ok: false,
      errors: [artifactError("DEEP_ARTIFACT_INVALID_JSON", artifactPath, "$", `Artifact is not valid JSON: ${err.message}`, "Fix the JSON syntax in the artifact file.")],
      artifactPath,
    });
  }
}

function report(result) {
  if (result.ok) {
    const payload = {
      ok: true,
      transitional: Boolean(result.transitional),
      artifactPath: result.artifactPath || "",
    };
    if (json) console.log(JSON.stringify(payload, null, 2));
    else console.log(payload.transitional ? "ok: deep-stack metadata absent, transitional readiness" : `ok: deep-stack validation passed${payload.artifactPath ? ` for ${payload.artifactPath}` : ""}`);
    return;
  }
  if (json) {
    console.log(JSON.stringify({ ok: false, errors: result.errors }, null, 2));
  } else {
    for (const item of result.errors) console.error(JSON.stringify(item));
  }
  process.exit(1);
}

function validateArtifactSection(sectionName, validator) {
  const artifactPath = artifactArg();
  const artifact = loadArtifact(artifactPath);
  const errors = [];
  validator(artifact[sectionName], { artifactPath }, errors);
  report({ ok: errors.length === 0, errors, artifactPath });
}

if (command === "create") {
  const planPath = argValue(args, "--plan");
  const outDir = argValue(args, "--out");
  if (!planPath || !outDir) {
    console.error("deep-stack-check create requires --plan and --out.");
    process.exit(2);
  }
  const artifactPath = createSkeleton(planPath, outDir);
  console.log(artifactPath);
} else if (command === "validate-plan") {
  const planPath = argValue(args, "--plan");
  if (!planPath) {
    console.error("deep-stack-check validate-plan requires --plan.");
    process.exit(2);
  }
  report(validateDeepStackPlanFile(planPath, { requireDeepStack: !allowTransitional }));
} else if (command === "validate-sources") {
  validateArtifactSection("sourceManifest", validateSources);
} else if (command === "validate-skills") {
  const artifactPath = artifactArg();
  const artifact = loadArtifact(artifactPath);
  const errors = [];
  validateSkills(artifact.skillMatrix, artifact.typescript, { artifactPath }, errors);
  report({ ok: errors.length === 0, errors, artifactPath });
} else if (command === "validate-reuse") {
  validateArtifactSection("reuseInventory", validateReuse);
} else if (command === "validate-findings") {
  validateArtifactSection("findings", validateFindings);
} else if (command === "validate-completion") {
  validateArtifactSection("completionAudit", validateCompletion);
} else if (command === "validate-risk-tier") {
  validateArtifactSection("riskTier", validateRiskTier);
} else if (command === "validate-artifact") {
  const artifactPath = artifactArg();
  report(validateBundle(loadArtifact(artifactPath), { artifactPath }));
} else {
  usage();
}

#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { argValue } from "./lib/cli-args.mjs";
import { parseBashArray } from "./lib/bash-array-parser.mjs";
import { REQUIRED_PLAN_HEADINGS } from "./lib/plan-headings.mjs";

const args = process.argv.slice(2);
const root = path.resolve(argValue(args, "--root", path.join(path.dirname(fileURLToPath(import.meta.url)), "..")));
const claudeHome = path.resolve(argValue(args, "--claude-home", process.env.CLAUDE_HOME || path.join(homedir(), ".claude")));
const checkInstalled = args.includes("--installed");
const errors = [];

function fail(message) {
  errors.push(message);
}

function read(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`failed to read ${path.relative(root, file)}: ${detail}`);
    return "";
  }
}

function skillFrontmatterName(text, fileLabel = "<unknown>") {
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return "";
  // Contract check supports single-line YAML scalar values only.
  const nameLine = match[1].match(/^\s*name:\s*(.+)\s*$/m);
  if (!nameLine) return "";
  let value = nameLine[1].trim();
  if (/^[>|]/.test(value) || /^[\[{]/.test(value) || /[\r\n]/.test(value)) {
    fail(`complex frontmatter name in ${fileLabel}: use a single-line scalar name field`);
    return "";
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value.replace(/\\"/g, '"').replace(/\\'/g, "'").trim();
}

function assertFile(file, label) {
  if (!existsSync(file)) fail(`${label} missing: ${path.relative(root, file)}`);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function hasShellBinary(binaryName) {
  const pathEntries = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const extensions = process.platform === "win32"
    ? String(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
      .split(";")
      .filter(Boolean)
    : [""];
  for (const entry of pathEntries) {
    for (const ext of extensions) {
      if (existsSync(path.join(entry, `${binaryName}${ext}`))) {
        return true;
      }
    }
  }
  return false;
}

function tryShells(shellAttempts, hintScript, timeoutMs) {
  const shellErrors = [];
  for (const attempt of shellAttempts) {
    if (!hasShellBinary(attempt.shell)) {
      shellErrors.push(`${attempt.shell}: shell not found in PATH`);
      continue;
    }
    const result = spawnSync(attempt.shell, ["-c", `${attempt.load} "$1"; get_etrnl_skill_hint`, "--", hintScript], {
      encoding: "utf8",
      timeout: timeoutMs,
    });
    if (result.status === 0) {
      return { succeeded: true, output: result.stdout, errors: shellErrors };
    }
    const fallback = result.signal
      ? (result.error?.code === "ETIMEDOUT" ? `timed out (${result.signal})` : `signal ${result.signal}`)
      : `exit ${result.status}`;
    shellErrors.push(`${attempt.shell}: ${result.stderr.trim() || result.stdout.trim() || fallback}`);
  }
  return { succeeded: false, output: "", errors: shellErrors };
}

const skillListsPath = path.join(root, "scripts/lib/skill-lists.sh");
assertFile(skillListsPath, "skill list");
const skillLists = read(skillListsPath);
const ownedSkills = parseBashArray(skillLists, "OWNED_SKILLS", {
  onError: (detail) => fail(`scripts/lib/skill-lists.sh ${detail}`),
});
const ownedAgents = parseBashArray(skillLists, "OWNED_AGENTS", {
  onError: (detail) => fail(`scripts/lib/skill-lists.sh ${detail}`),
});
const docsSkillsPath = path.join(root, "docs/skills.md");
const docsSkills = existsSync(docsSkillsPath) ? read(docsSkillsPath) : "";
assertFile(docsSkillsPath, "skills docs");

const skillsDir = path.join(root, "skills");
assertFile(skillsDir, "skills directory");
const actualSkills = existsSync(skillsDir)
  ? readdirSync(skillsDir).filter((name) => name.startsWith("etrnl-") && existsSync(path.join(skillsDir, name, "SKILL.md"))).sort()
  : [];
const ownedSet = new Set(ownedSkills);
const referencedInstalledHelpers = new Set();

for (const skill of actualSkills) {
  if (!ownedSet.has(skill)) fail(`skills/${skill}/SKILL.md exists but is not listed in OWNED_SKILLS`);
}

for (const skill of ownedSkills) {
  const skillPath = path.join(skillsDir, skill, "SKILL.md");
  assertFile(skillPath, `owned skill ${skill}`);
  if (!existsSync(skillPath)) continue;
  const relSkillPath = path.relative(root, skillPath) || `skills/${skill}/SKILL.md`;
  const text = read(skillPath);
  const frontmatterName = skillFrontmatterName(text, relSkillPath);
  if (frontmatterName !== skill) fail(`${relSkillPath}: frontmatter name is ${frontmatterName || "<missing>"}, expected ${skill}`);
  if (!docsSkills.includes(`/${skill}`)) fail(`${relSkillPath}: docs/skills.md missing /${skill}`);
  if (/\|\s*head\b/.test(text)) {
    fail(`${relSkillPath}: contains legacy '| head' helper pattern`);
  }

  // For ~/.claude/script references in skill text, we validate repo source helpers
  // under root/scripts via assertFile (not installed runtime paths).
  for (const match of text.matchAll(/~\/\.claude\/scripts\/([A-Za-z0-9_.-]+\.mjs)/g)) {
    const helper = match[1];
    referencedInstalledHelpers.add(helper);
    assertFile(path.join(root, "scripts", helper), `${skill} helper reference`);
  }
  for (const match of text.matchAll(/(?:^|[\s`"'()[\]{}])(?:node\s+)?((?:\.\/)?scripts\/[A-Za-z0-9_.-]+\.mjs)(?=$|[\s)\]}'"`;:,])/gm)) {
    const relPath = match[1].replace(/^\.\//, "");
    assertFile(path.join(root, relPath), `${skill} source helper reference`);
  }
  for (const match of text.matchAll(/`?((?:\.\/)?docs\/[^`<>\s]+\.md)`?/g)) {
    assertFile(path.join(root, match[1].replace(/^\.\//, "")), `${skill} docs reference`);
  }
  for (const match of text.matchAll(/`?((?:\.\/)?references\/[^`<>\s]+\.md)`?/g)) {
    assertFile(path.join(skillsDir, skill, match[1].replace(/^\.\//, "")), `${skill} reference`);
  }
}

const autoplan = path.join(skillsDir, "etrnl-autoplan", "SKILL.md");
const plan = path.join(skillsDir, "etrnl-plan", "SKILL.md");
const autoplanContent = existsSync(autoplan) ? read(autoplan) : "";
const planContent = existsSync(plan) ? read(plan) : "";
for (const heading of REQUIRED_PLAN_HEADINGS) {
  if (autoplanContent && !autoplanContent.includes(heading)) fail(`etrnl-autoplan missing required readiness heading: ${heading}`);
  if (planContent && !planContent.includes(heading.replace("Status: Final", "Status: Draft"))) fail(`etrnl-plan missing required readiness concept: ${heading}`);
}

const executePath = path.join(skillsDir, "etrnl-execute", "SKILL.md");
if (existsSync(executePath)) {
  const execute = read(executePath);
  const readinessIndex = execute.indexOf("plan-readiness-check.mjs <plan-path>");
  const ledgerIndex = execute.indexOf("execution-ledger.mjs init");
  if (readinessIndex < 0) fail("etrnl-execute missing direct plan readiness check");
  if (ledgerIndex < 0) fail("etrnl-execute missing ledger init");
  if (readinessIndex >= 0 && ledgerIndex >= 0 && readinessIndex > ledgerIndex) {
    fail("etrnl-execute must run plan readiness before ledger startup and edits");
  }
  if (!/If the readiness check fails.*Do not continue into implementation/s.test(execute)) {
    fail("etrnl-execute missing fail-closed readiness wording");
  }
}

const hintScript = path.join(root, "hooks/lib/skill-hints.sh");
if (existsSync(hintScript)) {
  const shellAttempts = [
    { shell: "bash", load: "source" },
    { shell: "sh", load: "." },
  ];
  // CLAUDE_GUARD_SHELL_HINT_TIMEOUT_MS controls tryShells(hintScript) timeout for slow systems.
  const timeoutMs = parsePositiveInteger(process.env.CLAUDE_GUARD_SHELL_HINT_TIMEOUT_MS, 15_000);
  const shellResult = tryShells(shellAttempts, hintScript, timeoutMs);
  if (!shellResult.succeeded) {
    fail(
      `skill hint helper failed:\n${shellResult.errors
        .map((detail, index) => `  attempt ${index + 1}: ${detail}`)
        .join("\n")}`,
    );
  } else {
    for (const skill of ownedSkills) {
      if (!shellResult.output.includes(skill)) fail(`SessionStart skill hint missing ${skill}`);
    }
  }
} else {
  fail("hooks/lib/skill-hints.sh missing");
}

for (const agent of ownedAgents) {
  const agentPath = path.join(root, "agents", `${agent}.md`);
  if (!existsSync(agentPath)) {
    fail(`owned agent file missing: agents/${agent}.md`);
    continue;
  }
  if (!docsSkills.includes(agent)) fail(`docs/skills.md missing agent ${agent}`);
}

if (checkInstalled) {
  for (const skill of ownedSkills) {
    const sourcePath = path.join(skillsDir, skill, "SKILL.md");
    const installedPath = path.join(claudeHome, "skills", skill, "SKILL.md");
    assertFile(installedPath, `installed skill ${skill}`);
    if (existsSync(sourcePath) && existsSync(installedPath) && read(sourcePath) !== read(installedPath)) {
      fail(`installed skill differs from source: ${skill}`);
    }
  }
  for (const helper of Array.from(referencedInstalledHelpers).sort((left, right) => left.localeCompare(right))) {
    assertFile(path.join(claudeHome, "scripts", helper), `installed helper ${helper}`);
  }
}

if (errors.length > 0) {
  console.error(`skill-contract-check failed for ${root}`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`ok: ${ownedSkills.length} ETRNL skill contracts valid`);

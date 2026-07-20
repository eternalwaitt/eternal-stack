#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { argValue } from "./lib/cli-args.mjs";
import { parseBashArray } from "./lib/bash-array-parser.mjs";
import { REQUIRED_PLAN_HEADINGS } from "./lib/plan-headings.mjs";
import { hasKeywords } from "./lib/text-matchers.mjs";

const args = process.argv.slice(2);
const root = path.resolve(argValue(args, "--root", path.join(path.dirname(fileURLToPath(import.meta.url)), "..")));
const claudeHome = path.resolve(argValue(args, "--claude-home", process.env.CLAUDE_HOME || path.join(homedir(), ".claude")));
const checkInstalled = args.includes("--installed");
const errors = [];
const softDirectivePatterns = [
  { label: "should", pattern: /\bshould\b/i },
  { label: "could", pattern: /\bcould\b/i },
  { label: "consider", pattern: /\bconsider\b/i },
  { label: "recommend", pattern: /\brecommend(?:s|ed|ation|ations)?\b/i },
  { label: "prefer", pattern: /\bprefer(?:s|red)?\b/i },
  { label: "try", pattern: /\btry\b/i },
  { label: "may", pattern: /\bmay\b/i },
  { label: "might", pattern: /\bmight\b/i },
  { label: "optional", pattern: /\boption(?:al|ally)\b/i },
  { label: "if useful", pattern: /\bif useful\b/i },
  { label: "when useful", pattern: /\bwhen useful\b/i },
  { label: "as needed", pattern: /\bas needed\b/i },
  { label: "where practical", pattern: /\bwhere practical\b/i },
  { label: "where possible", pattern: /\bwhere possible\b/i },
  { label: "when possible", pattern: /\bwhen possible\b/i },
  { label: "best effort", pattern: /\bbest[- ]effort\b/i },
  { label: "aim to", pattern: /\baim to\b/i },
  { label: "strive", pattern: /\bstrive\b/i },
  { label: "encourage", pattern: /\bencourage\b/i },
  { label: "usually", pattern: /\busually\b/i },
  { label: "generally", pattern: /\bgenerally\b/i },
  { label: "suggest", pattern: /\bsuggest(?:s|ed|ion|ions)?\b/i },
  { label: "advisory", pattern: /\badvisory\b/i },
  { label: "guidance", pattern: /\bguidance\b/i },
];

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

function skillFrontmatterBlock(text) {
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  return match ? match[1] : "";
}

// P5 house style: every SKILL.md stays under the 500-line progressive-disclosure
// budget, and every etrnl-audit-* skill carries the four fixed sections (see
// skills/common/skill-template.md) so a run cannot skip rationalization rebuttals,
// red flags, non-scope, or a countable red-capable Verification.
const HOUSE_STYLE_SECTIONS = [
  { label: "Common Rationalizations", re: /^#+\s+Common Rationalizations\b/m },
  { label: "Red Flags", re: /^#+\s+Red Flags\b/m },
  { label: "When NOT to use", re: /^#+\s+When NOT to use\b/im },
  { label: "Verification", re: /^#+\s+Verification\b/m },
];

function assertHouseStyle(file, skill, text, relSkillPath) {
  // An empty file is 0 lines; a newline-terminated file must not count the
  // trailing empty split entry (a compliant 500-line file ending in "\n" is
  // 500, not 501).
  const lineCount = text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  if (lineCount > 500) {
    fail(`${relSkillPath}: ${lineCount} lines exceeds the 500-line SKILL.md budget; move depth into references/`);
  }
  if (!skill.startsWith("etrnl-audit-")) return;
  for (const section of HOUSE_STYLE_SECTIONS) {
    if (!section.re.test(text)) {
      fail(`${relSkillPath}: audit skill missing required "## ${section.label}" section (house style — see skills/common/skill-template.md)`);
    }
  }
}

function assertNoModelRoutingFrontmatter(text, relSkillPath) {
  const frontmatter = skillFrontmatterBlock(text);
  if (!frontmatter) return;
  for (const field of ["model", "effort"]) {
    if (new RegExp(`^\\s*${field}\\s*:`, "m").test(frontmatter)) {
      fail(`${relSkillPath}: ${field} frontmatter is not allowed on repo-owned skills; inherit the active Claude model/context instead`);
    }
  }
}

function assertFile(file, label) {
  if (!existsSync(file)) fail(`${label} missing: ${path.relative(root, file)}`);
}

// Canonicalize the deepest existing ancestor of `target` through symlinks.
// `realpathSync` throws on a missing leaf, so walk up to the first path segment
// that exists and resolve that. A `..`-only escape is already caught lexically,
// but a symlinked segment (e.g. `refs/` -> `/etc`) resolves inside baseDir
// lexically while its real target is outside — this collapses it to the real path.
function canonicalExistingAncestor(target) {
  let current = target;
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return existsSync(current) ? realpathSync(current) : current;
}

// Existence-check a reference that must resolve WITHIN baseDir. The reference
// regexes accept `.`/`-` in path segments, so a `..` segment (e.g.
// `scripts/../../outside.mjs`) would make `path.join(baseDir, relPath)` resolve
// outside the repository and let a SKILL.md validate an unrelated out-of-repo file.
// A symlinked path segment could likewise escape while looking contained. Both
// baseDir and the resolved target are canonicalized through symlinks before the
// containment check, so neither a `..` traversal nor a symlink can escape baseDir.
function assertContainedFile(baseDir, relPath, label) {
  const base = realpathSync(path.resolve(baseDir));
  const resolved = path.resolve(base, relPath);
  const canonical = canonicalExistingAncestor(resolved);
  if (canonical !== base && !canonical.startsWith(base + path.sep)) {
    fail(`${label} escapes the repository: ${relPath}`);
    return;
  }
  assertFile(resolved, label);
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

function markdownFilesUnder(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...markdownFilesUnder(child));
    } else if (entry.isFile() && child.endsWith(".md")) {
      files.push(child);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function assertDirectiveLanguage(file, text) {
  const relPath = path.relative(root, file) || file;
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    for (const entry of softDirectivePatterns) {
      if (entry.pattern.test(line)) {
        fail(`${relPath}:${index + 1}: advisory wording "${entry.label}" is not allowed; use directive language or explicit unavailable/not-applicable/blocker wording`);
        break;
      }
    }
  }
}

function assertMandatoryRulesNameEnforcement(file, text) {
  const relPath = path.relative(root, file) || file;
  const lines = text.split(/\r?\n/);
  const namedMechanismPattern =
    /\b([A-Za-z0-9_.-]+\.mjs|[A-Za-z0-9_.-]+\.sh|mechanical\s+gate|ledger\s+command\s+[A-Za-z0-9_.:-]+|hook\s+[A-Za-z0-9_.:-]+|validator\s+[A-Za-z0-9_.:-]+)\b/i;
  for (let index = 0; index < lines.length; index += 1) {
    if (!/\bmandatory rules?\b/i.test(lines[index])) continue;
    const nearby = lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2)).join("\n");
    if (!namedMechanismPattern.test(nearby)) {
      fail(`${relPath}:${index + 1}: mandatory rules must name a concrete hook, script, validator, ledger command, or mechanical gate`);
    }
  }
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
  assertDirectiveLanguage(skillPath, text);
  assertMandatoryRulesNameEnforcement(skillPath, text);
  assertNoModelRoutingFrontmatter(text, relSkillPath);
  assertHouseStyle(skillPath, skill, text, relSkillPath);
  for (const referencePath of markdownFilesUnder(path.join(skillsDir, skill, "references"))) {
    const referenceText = read(referencePath);
    assertDirectiveLanguage(referencePath, referenceText);
    assertMandatoryRulesNameEnforcement(referencePath, referenceText);
  }
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
    assertContainedFile(root, path.join("scripts", helper), `${skill} helper reference`);
  }
  // Broadened to allow nested subdirectories (scripts/lib/x.mjs), not just flat
  // scripts/x.mjs — the old `[A-Za-z0-9_.-]+` class excluded `/`, so a nested
  // helper reference was silently never existence-checked.
  for (const match of text.matchAll(/(?:^|[\s`"'()[\]{}])(?:node\s+)?((?:\.\/)?scripts\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.mjs)(?=$|[\s)\]}'"`;:,])/gm)) {
    const relPath = match[1].replace(/^\.\//, "");
    assertContainedFile(root, relPath, `${skill} source helper reference`);
  }
  // Sibling existence checks for backticked shell references under scripts/, hooks/,
  // and tests/ (including nested subdirectories). Mirrors the .mjs helper loop above:
  // a SKILL.md that names a .sh path must name one that resolves at repo root.
  for (const shRoot of ["scripts", "hooks", "tests"]) {
    const shPattern = new RegExp(
      `(?:^|[\\s\`"'()[\\]{}])(?:bash\\s+)?((?:\\.\\/)?${shRoot}\\/(?:[A-Za-z0-9_.-]+\\/)*[A-Za-z0-9_.-]+\\.sh)(?=$|[\\s)\\]}'"\`;:,])`,
      "gm",
    );
    for (const match of text.matchAll(shPattern)) {
      const relPath = match[1].replace(/^\.\//, "");
      assertContainedFile(root, relPath, `${skill} shell reference`);
    }
  }
  for (const match of text.matchAll(/`?((?:\.\/)?docs\/[^`<>\s]+\.md)`?/g)) {
    assertContainedFile(root, match[1].replace(/^\.\//, ""), `${skill} docs reference`);
  }
  for (const match of text.matchAll(/`?((?:\.\/)?references\/[^`<>\s]+\.md)`?/g)) {
    assertContainedFile(path.join(skillsDir, skill), match[1].replace(/^\.\//, ""), `${skill} reference`);
  }
}

const autoplan = path.join(skillsDir, "etrnl-dev-autoplan", "SKILL.md");
const plan = path.join(skillsDir, "etrnl-dev-plan", "SKILL.md");
const autoplanContent = existsSync(autoplan) ? read(autoplan) : "";
const planContent = existsSync(plan) ? read(plan) : "";
for (const heading of REQUIRED_PLAN_HEADINGS) {
  if (autoplanContent && !autoplanContent.includes(heading)) fail(`etrnl-dev-autoplan missing required readiness heading: ${heading}`);
  if (planContent && !planContent.includes(heading.replace("Status: Final", "Status: Draft"))) fail(`etrnl-dev-plan missing required readiness concept: ${heading}`);
}
if (planContent) {
  const lines = planContent.split(/\r?\n/);
  const namedMechanismPattern =
    /\b([A-Za-z0-9_.-]+\.mjs|[A-Za-z0-9_.-]+\.sh|mechanical\s+gate|ledger\s+command\s+[A-Za-z0-9_.:-]+|hook\s+[A-Za-z0-9_.:-]+|validator\s+[A-Za-z0-9_.:-]+)\b/i;
  let hasMandatoryBehavior = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (!/\bmandatory behavior\b/i.test(lines[index])) continue;
    hasMandatoryBehavior = true;
    const nearby = lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2)).join("\n");
    if (!namedMechanismPattern.test(nearby)) {
      fail("etrnl-dev-plan missing mandatory-behavior mechanical enforcement contract");
    }
  }
  if (!hasMandatoryBehavior) {
    fail("etrnl-dev-plan missing mandatory-behavior mechanical enforcement contract");
  }
}

const executePath = path.join(skillsDir, "etrnl-dev-execute", "SKILL.md");
if (existsSync(executePath)) {
  const execute = read(executePath);
  const readinessIndex = execute.indexOf("plan-readiness-check.mjs <plan-path>");
  const ledgerIndex = execute.indexOf("execution-ledger.mjs init");
  if (readinessIndex < 0) fail("etrnl-dev-execute missing direct plan readiness check");
  if (ledgerIndex < 0) fail("etrnl-dev-execute missing ledger init");
  if (readinessIndex >= 0 && ledgerIndex >= 0 && readinessIndex > ledgerIndex) {
    fail("etrnl-dev-execute must run plan readiness before ledger startup and edits");
  }
  if (!/If the readiness check fails.*Do not continue into implementation/s.test(execute)) {
    fail("etrnl-dev-execute missing fail-closed readiness wording");
  }
  const executeRequiredConcepts = [
    {
      label: "parallel-safe wave dispatch",
      keywords: ["dispatch", "write-capable", "implementation subagents", "parallel-safe"],
    },
    {
      label: "parent orchestrator edit prohibition",
      keywords: ["parent orchestrator", "must not edit", "implementation subagents"],
    },
    {
      label: "sequential-degraded fallback",
      keywords: ["sequential-degraded", "blocker", "editing"],
    },
  ];
  for (const concept of executeRequiredConcepts) {
    if (!hasKeywords(execute, concept.keywords)) {
      fail(`etrnl-dev-execute missing ${concept.label} concept: ${concept.keywords.join(", ")}`);
    }
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

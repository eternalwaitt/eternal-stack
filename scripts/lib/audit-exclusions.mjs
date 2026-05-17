const auditExcludedDirs = new Set([
  ".agents",
  ".audit",
  ".cache",
  ".claude",
  ".codex",
  ".cursor",
  ".git",
  ".hg",
  ".idea",
  ".netlify",
  ".next",
  ".nuxt",
  ".output",
  ".parcel-cache",
  ".svn",
  ".svelte-kit",
  ".turbo",
  ".vercel",
  ".vite",
  ".vitest",
  ".vscode",
  ".worktrees",
  "build",
  "cache",
  "coverage",
  "dbscans",
  "dist",
  "logs",
  "node_modules",
  "out",
  "storybook-static",
  "temp",
  "tmp",
  "tool-output",
  "vendor",
]);

const generatedOrFixtureDirs = new Set([
  "__generated__",
  "__pycache__",
  ".pytest_cache",
  "fixture",
  "fixtures",
  "generated",
]);

function normalizedSegments(filePath) {
  return String(filePath)
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
}

export function isAuditExcludedPath(filePath) {
  return normalizedSegments(filePath).some((segment) => auditExcludedDirs.has(segment));
}

export function isGeneratedOrFixturePath(filePath) {
  return normalizedSegments(filePath).some(
    (segment) => generatedOrFixtureDirs.has(segment) || segment.endsWith(".egg-info"),
  );
}

export function classifyAuditPathExclusion(filePath) {
  if (isAuditExcludedPath(filePath)) {
    return {
      category: "excluded",
      auditScope: "listed",
      reason: "vendor/build/cache/local tool output",
    };
  }
  if (isGeneratedOrFixturePath(filePath)) {
    return {
      category: "generated-or-fixture",
      auditScope: "listed",
      reason: "generated or fixture-like path",
    };
  }
  return null;
}

/**
 * Shared detection for private or local strings in tracked artifacts.
 *
 * A privacy leak is an *absolute* filesystem path. Repo-relative paths never start with a
 * separator, so matching a bare segment such as the home directory name flags legitimate source
 * paths like src/components/home/Nav.tsx. Detection therefore scans path-like tokens that begin
 * at an absolute root and only then tests the private roots, which keeps application routes and
 * repo paths clean while still catching every local path, including WSL and UNC forms.
 */

/** Path-like tokens anchored at an absolute root: POSIX, home-relative, Windows drive, UNC, file URL. */
const ABSOLUTE_PATH_TOKEN =
  /(?:^|[\s"'`(<[{=,;|])((?:file:\/\/)?(?:~|\/|[A-Za-z]:[\\/]|\\\\[A-Za-z0-9_.-]+\\)[^\s"'`)>\]},;|]*)/g;

/** Private roots, tested only against tokens already known to be absolute. */
const PRIVATE_PATH_ROOTS = [
  /^(?:file:\/\/)?\/Users\/[^/\\\s]+/i,
  /^(?:file:\/\/)?\/home\/[^/\\\s]+/i,
  /^(?:file:\/\/)?\/root(?:[/\\]|$)/i,
  /^(?:file:\/\/)?\/Volumes\/[^/\\\s]+/i,
  /^(?:file:\/\/)?\/tmp[/\\]/i,
  /^(?:file:\/\/)?\/private\/tmp[/\\]/i,
  /^(?:file:\/\/)?\/var\/folders[/\\]/i,
  /^[A-Za-z]:[\\/]/,
  /^\\\\[A-Za-z0-9_.-]+\\[A-Za-z0-9_.-]+/,
  /\/mnt\/[a-z]\/Users\/[^/\\\s]+/i,
  /\/mnt\/wsl\/[^/\\\s]+\/Users\/[^/\\\s]+/i,
];

/**
 * Home-relative paths name no user, so they are portable configuration rather than a privacy
 * leak. Stack profiles use this form deliberately. Tracked audit artifacts still avoid it,
 * because an artifact should carry a label or fingerprint instead of any local path.
 */
const HOME_RELATIVE_PATH_ROOT = /^~(?:[/\\]|$)/;

/** Sensitive values that are not paths, so they are tested against the whole string. */
const SENSITIVE_VALUE_PATTERNS = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b(sk|pk|ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{12,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/,
  /\b[A-Z0-9_]*(TOKEN|API_KEY|SECRET|PASSWORD)[A-Z0-9_]*=/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/**
 * Secret-looking payloads: OpenAI/Anthropic keys, GitHub/GitLab tokens, Slack/npm tokens,
 * cloud access keys, Bearer tokens, and PEM private keys.
 */
export const SECRET_PATTERN =
  /sk-(proj-|ant-)?[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|npm_[A-Za-z0-9]{20,}|\b(?:AKIA|ASIA|OCI)[A-Z0-9]{12,}\b|Bearer\s+[A-Za-z0-9._-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

/**
 * Every absolute path token in `value` that resolves to a private root.
 * Set `includeHomeRelative` to also return `~`-rooted paths.
 */
export function findPrivatePaths(value, { includeHomeRelative = false } = {}) {
  if (typeof value !== "string" || value.length === 0) return [];
  const roots = includeHomeRelative ? [...PRIVATE_PATH_ROOTS, HOME_RELATIVE_PATH_ROOT] : PRIVATE_PATH_ROOTS;
  const found = [];
  for (const match of value.matchAll(ABSOLUTE_PATH_TOKEN)) {
    const token = match[1];
    if (token && roots.some((root) => root.test(token))) found.push(token);
  }
  return found;
}

/** True when `value` contains an absolute path rooted in a private location. */
export function hasPrivatePath(value, options) {
  return findPrivatePaths(value, options).length > 0;
}

/** Replace every private absolute path in `value` with `replacement`. */
export function redactPrivatePaths(value, replacement = "<private-path>") {
  const text = String(value ?? "");
  if (text.length === 0) return text;
  let result = text;
  // Longest first so a nested match cannot leave a fragment of a longer path behind.
  for (const token of [...new Set(findPrivatePaths(text))].sort((a, b) => b.length - a.length)) {
    result = result.split(token).join(replacement);
  }
  return result;
}

/** True when `value` exposes any local path, contact address, token, or key material. */
export function hasPrivateString(value) {
  if (typeof value !== "string") return false;
  return (
    hasPrivatePath(value, { includeHomeRelative: true }) ||
    SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value))
  );
}

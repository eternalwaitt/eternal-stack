/**
 * Parses a strictly positive decimal integer from an environment value.
 * Rejects null, undefined, whitespace, non-decimal formats, unsafe integers, and non-positive values.
 * Example: positiveEnvInt("10", 1) returns 10; positiveEnvInt("1e3", 1) returns 1.
 * @param {string|number|null|undefined} raw - Raw environment value to parse.
 * @param {number|undefined} fallback - Value returned when raw is invalid.
 * @returns {number|undefined} Parsed positive integer or fallback.
 */
export function positiveEnvInt(raw, fallback) {
  if (!/^\d+$/.test(String(raw ?? ""))) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/**
 * Returns the first valid positive integer from ordered environment candidates.
 * Each candidate is validated with positiveEnvInt before falling through.
 * @param {Array<string|number|null|undefined>} candidates - Values to check in precedence order.
 * @param {number|undefined} fallback - Value returned when no candidate is valid.
 * @returns {number|undefined} First valid positive integer or fallback.
 */
function firstPositiveEnv(candidates, fallback) {
  for (const candidate of candidates) {
    const value = positiveEnvInt(candidate, undefined);
    if (value !== undefined) return value;
  }
  return fallback;
}

/**
 * Builds Git subprocess timeout and buffer limits from environment precedence.
 * Timeout precedence is CLAUDE_CONTROL_PLANE_GIT_TIMEOUT_MS, then GIT_TIMEOUT_MS,
 * then options.timeoutMs. Buffer precedence is CLAUDE_CONTROL_PLANE_GIT_MAX_BUFFER_BYTES,
 * then GIT_MAX_BUFFER_BYTES, then GIT_MAX_BUFFER, then options.maxBufferBytes.
 * Example: execFileSync("git", ["status"], gitSubprocessLimits({ timeoutMs: 5000 })).
 * @param {{timeoutMs?: number, maxBufferBytes?: number}} [options] - Default limits.
 * @returns {{timeout: number|undefined, maxBuffer: number|undefined}} Git subprocess limits.
 */
export function gitSubprocessLimits({ timeoutMs, maxBufferBytes } = {}) {
  return {
    timeout: firstPositiveEnv(
      [process.env.CLAUDE_CONTROL_PLANE_GIT_TIMEOUT_MS, process.env.GIT_TIMEOUT_MS],
      timeoutMs,
    ),
    maxBuffer: firstPositiveEnv(
      [
        process.env.CLAUDE_CONTROL_PLANE_GIT_MAX_BUFFER_BYTES,
        process.env.GIT_MAX_BUFFER_BYTES,
        process.env.GIT_MAX_BUFFER,
      ],
      maxBufferBytes,
    ),
  };
}

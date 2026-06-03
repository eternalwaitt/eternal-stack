export function positiveEnvInt(raw, fallback) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function firstPositiveEnv(candidates, fallback) {
  for (const candidate of candidates) {
    const value = positiveEnvInt(candidate, undefined);
    if (value !== undefined) return value;
  }
  return fallback;
}

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

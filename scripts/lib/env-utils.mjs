export function positiveEnvInt(raw, fallback) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function gitSubprocessLimits({ timeoutMs, maxBufferBytes } = {}) {
  return {
    timeout: positiveEnvInt(process.env.CLAUDE_CONTROL_PLANE_GIT_TIMEOUT_MS || process.env.GIT_TIMEOUT_MS, timeoutMs),
    maxBuffer: positiveEnvInt(
      process.env.CLAUDE_CONTROL_PLANE_GIT_MAX_BUFFER_BYTES
        || process.env.GIT_MAX_BUFFER_BYTES
        || process.env.GIT_MAX_BUFFER,
      maxBufferBytes,
    ),
  };
}

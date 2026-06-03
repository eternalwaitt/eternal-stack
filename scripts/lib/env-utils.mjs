export function positiveEnvInt(raw, fallback) {
  const value = Number.parseInt(raw || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function gitSubprocessLimits({ timeoutMs, maxBufferBytes } = {}) {
  return {
    timeout: positiveEnvInt(process.env.GIT_TIMEOUT_MS, timeoutMs),
    // Prefer GIT_MAX_BUFFER_BYTES; GIT_MAX_BUFFER is a legacy fallback.
    maxBuffer: positiveEnvInt(process.env.GIT_MAX_BUFFER_BYTES || process.env.GIT_MAX_BUFFER, maxBufferBytes),
  };
}

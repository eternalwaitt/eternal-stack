export function positiveEnvInt(raw, fallback) {
  const value = Number.parseInt(raw || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

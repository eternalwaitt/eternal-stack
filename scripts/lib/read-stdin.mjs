import fs from "node:fs";

const RETRYABLE = new Set(["EAGAIN", "EWOULDBLOCK"]);
const CHUNK_SIZE = 64 * 1024;
const DEFAULT_SPIN_MS = Number(process.env.ETRNL_STDIN_SPIN_MS || "5000");

function isRetryable(error) {
  return error && typeof error === "object" && "code" in error && RETRYABLE.has(error.code);
}

function spinWait(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Brief spin while a non-blocking stdin fd catches up.
  }
}

function resolveSpinBudget(options = {}) {
  const raw = options.maxWaitMs ?? DEFAULT_SPIN_MS;
  return Number.isFinite(raw) && raw > 0 ? raw : 5000;
}

/**
 * Read all stdin as UTF-8 text. Returns "" for interactive TTYs.
 * Retries EAGAIN/EWOULDBLOCK instead of dropping input on non-blocking fds.
 */
export function readStdinRaw(options = {}) {
  if (process.stdin.isTTY) return "";

  const deadline = Date.now() + resolveSpinBudget(options);

  try {
    return fs.readFileSync(0, "utf8").trim();
  } catch (error) {
    if (!isRetryable(error)) throw error;
  }

  const chunks = [];
  const buf = Buffer.alloc(CHUNK_SIZE);
  while (true) {
    let bytesRead;
    try {
      bytesRead = fs.readSync(0, buf, 0, CHUNK_SIZE, null);
    } catch (error) {
      if (isRetryable(error)) {
        if (Date.now() >= deadline) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`stdin read timed out after ${resolveSpinBudget(options)}ms: ${detail}`);
        }
        spinWait(1);
        continue;
      }
      throw error;
    }
    if (bytesRead === 0) break;
    // Copy out of the reusable buffer; subarray would alias `buf` and be
    // overwritten by the next readSync, corrupting multi-chunk input.
    chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

/**
 * Parse JSON from stdin. Uses readStdinRaw() and centralizes empty/required/invalid handling.
 */
export function readStdinJson(options = {}) {
  const {
    required = false,
    emptyValue = {},
    onReadError,
    onRequired,
    onInvalidJson,
  } = options;

  let raw;
  try {
    raw = readStdinRaw(options);
  } catch (error) {
    if (onReadError) {
      onReadError(error);
      return emptyValue;
    }
    throw error;
  }

  if (!raw) {
    if (required) {
      if (onRequired) {
        onRequired();
        return emptyValue;
      }
      console.error("JSON input required on stdin.");
      process.exit(2);
    }
    return emptyValue;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    if (onInvalidJson) {
      onInvalidJson(error);
      return emptyValue;
    }
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Invalid JSON on stdin: ${detail}`);
    process.exit(2);
  }
}

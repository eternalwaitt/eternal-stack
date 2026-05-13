export function escapeRegexLiteral(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripBashComment(line) {
  let result = "";
  // Bash parsing rules mirrored here:
  // - backslashes are literal inside single quotes (so '\' is only escape-active when !inSingle)
  // - backslashes escape next chars outside single quotes, including within double quotes
  // - '#' starts a comment only when not inside single or double quotes.
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (const char of line) {
    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && !inSingle) {
      result += char;
      escaped = true;
      continue;
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      result += char;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      result += char;
      continue;
    }
    if (char === "#" && !inSingle && !inDouble) {
      break;
    }
    result += char;
  }
  return result;
}

const BASH_ESCAPE_MAP = { a: "\x07", b: "\b", e: "\x1B", f: "\f", r: "\r", t: "\t", v: "\v" };

function applyBashEscapes(inner) {
  return inner
    .replace(/\\\n/g, "")
    .replace(/\\\\/g, "\\")
    .replace(/\\\$/g, "$")
    .replace(/\\`/g, "`")
    .replace(/\\"/g, '"')
    .replace(/\\([abefrtv])/g, (_, c) => BASH_ESCAPE_MAP[c])
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\(?:0([0-7]{1,3})|([0-7]{1,3}))/g, (_, z, p) => String.fromCharCode(Number.parseInt(z || p, 8)));
}

function unquoteToken(token) {
  if (token.startsWith("'") && token.endsWith("'")) return token.slice(1, -1);
  if (token.startsWith('"') && token.endsWith('"')) return applyBashEscapes(token.slice(1, -1));
  return token.replace(/\\(.)/g, "$1");
}

function validateTokenStreamSource(rawValues) {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (const char of rawValues) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && !inSingle) {
      escaped = true;
      continue;
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    }
  }
  if (inSingle || inDouble) return "contains an unclosed quote";
  if (escaped) return "ends with an unmatched escape";
  return "";
}

export function parseBashArray(source, name, options = {}) {
  const onError = typeof options.onError === "function" ? options.onError : null;
  const assignment = new RegExp(`^\\s*${escapeRegexLiteral(name)}\\s*=\\s*\\(`, "m").exec(source);
  if (!assignment) {
    onError?.(`missing ${name}`);
    return [];
  }
  const start = assignment.index + assignment[0].length;
  const remainder = source.slice(start);
  const lines = remainder.split(/\r?\n/);
  const bodyLines = [];
  let closed = false;
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (/^\s*\)\s*$/.test(line)) {
      closed = true;
      break;
    }
    if (trimmed.endsWith(")")) {
      const contentBeforeClose = trimmed.slice(0, -1).trim();
      if (contentBeforeClose) bodyLines.push(contentBeforeClose);
      closed = true;
      break;
    }
    bodyLines.push(line);
  }
  if (!closed) {
    onError?.(`has unterminated ${name} array`);
    return [];
  }
  // Join with spaces so multiline arrays stay token-equivalent to shell whitespace.
  const rawValues = bodyLines.map((line) => stripBashComment(line)).join(" ");
  const streamError = validateTokenStreamSource(rawValues);
  if (streamError) {
    onError?.(`${name} ${streamError}`);
    return [];
  }
  // Token branches: "double-quoted with escapes" | 'single-quoted literal' | unquoted tokens (with backslash escapes).
  const matched = rawValues.match(/"(?:\\.|[^"\\])*"|'[^']*'|(?:\\.|[^\s"'])+/g);
  const tokens = matched !== null ? matched : [];
  return tokens.map(unquoteToken);
}

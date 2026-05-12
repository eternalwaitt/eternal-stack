export function escapeRegexLiteral(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripBashComment(line) {
  let result = "";
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
    if (/^\s*\)\s*$/.test(line)) {
      closed = true;
      break;
    }
    bodyLines.push(line);
  }
  if (!closed) {
    onError?.(`has unterminated ${name} array`);
    return [];
  }
  const rawValues = bodyLines
    .map((line) => stripBashComment(line).trim())
    .filter(Boolean)
    .join(" ");
  // Token branches: "double-quoted with escapes" | 'single-quoted literal' | unquoted tokens (with backslash escapes).
  const tokens = rawValues.match(/"(?:\\.|[^"\\])*"|'[^']*'|(?:\\.|[^\s"'])+/g) || [];
  return tokens.map((token) => {
    if (token.startsWith("'") && token.endsWith("'")) {
      return token.slice(1, -1);
    }
    if (token.startsWith('"') && token.endsWith('"')) {
      // Order matters: strip line continuations before collapsing escaped backslashes.
      return token
        .slice(1, -1)
        .replace(/\\\n/g, "")
        .replace(/\\\\/g, "\\")
        .replace(/\\\$/g, "$")
        .replace(/\\`/g, "`")
        .replace(/\\"/g, '"')
        .replace(/\\([abefrtv])/g, (_, escapeCode) => {
          const escapeMap = {
            a: "\x07",
            b: "\b",
            e: "\x1B",
            f: "\f",
            r: "\r",
            t: "\t",
            v: "\v",
          };
          return escapeMap[escapeCode];
        })
        .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
        .replace(/\\(?:0([0-7]{1,3})|([0-7]{1,3}))/g, (_, withLeadingZero, plainOctal) =>
          String.fromCharCode(Number.parseInt(withLeadingZero || plainOctal, 8)),
        );
    }
    return token.replace(/\\(.)/g, "$1");
  });
}

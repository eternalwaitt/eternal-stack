#!/usr/bin/env node
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: complexity-check.mjs <file>");
  process.exit(2);
}

const text = readFileSync(file, "utf8");
const lines = text.split(/\r?\n/);
const path = file.replace(/\\/g, "/");

const exempt = /(^|\/)(dist|build|coverage|generated|__generated__|migrations)\//.test(path)
  || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path)
  || /\.md$/.test(path);

if (!exempt && lines.length > 300) {
  console.error(`source file exceeds 300 lines (${lines.length})`);
  process.exit(1);
}

if (exempt) {
  process.exit(0);
}

let depth = 0;
let maxDepth = 0;
let fnStart = null;
let fnDepth = 0;
let fnName = "";

const fnRegex = /\b(function\s+[\w$]+\s*\(([^)]*)\)|(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>|(?:async\s+)?([\w$]+)\s*\(([^)]*)\)\s*\{)/;

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i] ?? "";
  const match = line.match(fnRegex);
  if (match && fnStart === null) {
    const params = (match[2] ?? match[4] ?? match[6] ?? "").trim();
    const count = params === "" ? 0 : params.split(",").filter(Boolean).length;
    fnName = match[3] ?? match[5] ?? "function";
    if (count > 4) {
      console.error(`${fnName} has ${count} parameters`);
      process.exit(1);
    }
    fnStart = i;
    fnDepth = depth;
  }

  for (const char of line) {
    if (char === "{") {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
      if (maxDepth > 4) {
        console.error(`nesting exceeds 3 levels near line ${i + 1}`);
        process.exit(1);
      }
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
    }
  }

  if (fnStart !== null && depth <= fnDepth && i > fnStart) {
    const length = i - fnStart + 1;
    if (length > 50) {
      console.error(`${fnName} exceeds 50 lines (${length})`);
      process.exit(1);
    }
    fnStart = null;
    fnName = "";
  }
}

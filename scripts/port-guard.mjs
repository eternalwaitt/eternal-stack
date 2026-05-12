#!/usr/bin/env node
import net from "node:net";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const portProbeTimeoutMs = 1000;

function argValue(flag, fallback = "") {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    fail(`${flag} requires a value.`);
  }
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readMaxPortScan() {
  const value = Number.parseInt(process.env.CLAUDE_GUARD_MAX_PORT_SCAN || "500", 10);
  if (!Number.isInteger(value) || value <= 0) {
    fail("CLAUDE_GUARD_MAX_PORT_SCAN must be a positive integer.");
  }
  return value;
}

function numericPort(value, label) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be a TCP port between 1 and 65535.`);
  }
  return port;
}

function normalizeShell(commandText) {
  return String(commandText || "").replace(/\\\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function isLocalDevServerCommand(commandText) {
  const text = normalizeShell(commandText);
  if (!text) return false;
  const packageManagerDev = /(^|[;&|({\s])(?:pnpm|npm|yarn|bun)(?:(?![;&|]).){0,180}\s(?:run\s+)?dev(?::[A-Za-z0-9_.-]+)?(?=$|[\s;&|)])/i;
  const frameworkDev = /(^|[;&|({\s])(?:next|vite|astro|nuxt|remix|svelte-kit)\s+dev(?=$|[\s;&|)])/i;
  const turboDev = /(^|[;&|({\s])turbo\s+(?:run\s+)?dev(?=$|[\s;&|)])/i;
  return packageManagerDev.test(text) || frameworkDev.test(text) || turboDev.test(text);
}

function commandUsesPortHelper(commandText) {
  return /\bport-guard\.mjs\s+pick\b|\bfree-port\b|\bpick-free-port\b|\bchoose-free-port\b/i.test(commandText);
}

function collectPorts(commandText) {
  const text = normalizeShell(commandText);
  const patterns = [
    /(?:^|\s)(?:PORT|APP_PORT|WEB_PORT|VITE_PORT|NEXT_PORT)=["']?(\d{1,5})["']?(?=$|\s)/gi,
    /(?:^|\s)--port(?:=|\s+)(\d{1,5})(?=$|\s|[;&|)])/gi,
    /(?:^|\s)-p(?:=|\s*)(\d{1,5})(?=$|\s|[;&|)])/gi,
  ];
  const ports = new Set();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      ports.add(numericPort(match[1], "port"));
    }
  }
  return [...ports];
}

function portIsFreeOnHost(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    let timeout = null;
    const finish = (free) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.removeAllListeners("error");
      server.removeAllListeners("listening");
      if (server.listening) {
        server.close(() => resolve(free));
        return;
      }
      resolve(free);
    };
    timeout = setTimeout(() => finish(false), portProbeTimeoutMs);
    server.once("error", (error) => {
      if (host === "::1" && error.code === "EADDRNOTAVAIL") {
        finish(true);
        return;
      }
      finish(false);
    });
    server.once("listening", () => {
      finish(true);
    });
    try {
      server.listen({ port, host, exclusive: true });
    } catch {
      finish(false);
    }
  });
}

async function portIsFree(port) {
  for (const host of ["127.0.0.1", "::1", "0.0.0.0", "::"]) {
    if (!(await portIsFreeOnHost(port, host))) return false;
  }
  return true;
}

function runSelfTest() {
  const positives = [
    "npm run dev:server",
    "pnpm --filter app dev",
    "yarn dev",
    "next dev",
    "vite dev",
    "astro dev",
    "turbo run dev",
    "echo ok; pnpm dev:web",
    "(npm run dev)",
    "PORT=3100 npm run dev",
    "APP_PORT='3101' pnpm dev",
    "NEXT_PORT=\"3200\" next dev",
    "cd app && PORT=3300 npm run dev:server",
  ];
  const negatives = [
    "node scripts/dev-tools.mjs",
    "echo development",
    "curl http://localhost:3000",
    "echo \"npm dev\"",
    "sh -c 'echo \"dev\"'",
    "npm run \"dev-script\"",
    "node -e \"console.log('dev')\"",
    "npm run build",
    "npm run devops",
  ];
  for (const sample of positives) {
    if (!isLocalDevServerCommand(sample)) throw new Error(`self-test expected dev command: ${sample}`);
  }
  for (const sample of negatives) {
    if (isLocalDevServerCommand(sample)) throw new Error(`self-test expected non-dev command: ${sample}`);
  }
  console.log("port guard self-test passed");
}

async function pickPort() {
  const maxPortScan = readMaxPortScan();
  const start = numericPort(argValue("--start", process.env.CLAUDE_GUARD_PORT_START || "3100"), "--start");
  const end = numericPort(argValue("--end", process.env.CLAUDE_GUARD_PORT_END || "3999"), "--end");
  const rangeLength = end - start + 1;
  const forceLargeScan = args.includes("--force-large-scan") || process.env.CLAUDE_GUARD_FORCE_LARGE_SCAN === "1";
  if (end < start) throw new Error("--end must be greater than or equal to --start.");
  if (rangeLength > maxPortScan && !forceLargeScan) {
    throw new Error([
      `Requested scan range ${start}-${end} (${rangeLength} ports) exceeds safety cap (${maxPortScan}).`,
      "Narrow --start/--end or set CLAUDE_GUARD_FORCE_LARGE_SCAN=1 (or pass --force-large-scan) to opt in.",
    ].join(" "));
  }
  for (let port = start; port <= end; port += 1) {
    if (await portIsFree(port)) {
      console.log(port);
      return;
    }
  }
  throw new Error(`No free TCP port found in range ${start}-${end}.`);
}

async function checkCommand() {
  const commandText = argValue("--command");
  if (!commandText) throw new Error("check requires --command.");
  if (!isLocalDevServerCommand(commandText)) return;

  const ports = collectPorts(commandText);
  if (ports.length === 0) {
    if (commandUsesPortHelper(commandText)) return;
    throw new Error([
      "Local dev server commands must use an explicit checked port.",
      "Pick one first, for example: port=$(node ~/.claude/scripts/port-guard.mjs pick --start 3100)",
      'Then pass it to the project command with --port "$port", -p "$port", or PORT="$port" if the framework supports it.',
      "Do not rely on default 3000/3001 ports.",
    ].join(" "));
  }

  for (const port of ports) {
    if (!(await portIsFree(port))) {
      throw new Error(`Port ${port} is already in use. Pick a free port with: node ~/.claude/scripts/port-guard.mjs pick --start 3100`);
    }
  }
}

async function main() {
  if (command === "pick") {
    await pickPort();
    return;
  }
  if (command === "check") {
    await checkCommand();
    return;
  }
  if (command === "self-test") {
    runSelfTest();
    return;
  }
  console.error([
    "usage: port-guard.mjs pick [--start N --end N] | check --command <shell-command> | self-test",
    "pickPort scans --start..--end from CLAUDE_GUARD_PORT_START/CLAUDE_GUARD_PORT_END; keep ranges narrow because portIsFree probes each port with a timeout.",
    "If a wide scan is intentional, opt in with CLAUDE_GUARD_FORCE_LARGE_SCAN=1 or --force-large-scan.",
  ].join("\n"));
  process.exit(2);
}

main().catch((error) => fail(error.message));

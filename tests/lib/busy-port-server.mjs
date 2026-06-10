#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";

const [portArg, readyFile, errorFile] = process.argv.slice(2);
if (!portArg || !readyFile || !errorFile) {
  console.error("usage: busy-port-server.mjs <port> <readyFile> <errorFile>");
  process.exit(1);
}
const port = Number(portArg);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  const message = `invalid port: ${portArg}`;
  fs.writeFileSync(errorFile, message);
  console.error(message);
  process.exit(1);
}
const server = net.createServer();

server.once("error", (error) => {
  fs.writeFileSync(errorFile, error.code ?? error.message);
  process.exit(2);
});

server.listen(port, "127.0.0.1", () => {
  fs.writeFileSync(readyFile, "ready");
});

setTimeout(() => {
  server.close(() => {
    process.exit(0);
  });
}, 10000);

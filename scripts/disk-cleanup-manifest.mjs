#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const command = process.argv[2] || "validate";
const REQUIRED_FIELDS = ["path", "category", "estimatedBytes", "description", "whySafe", "cleanupCommand", "riskTier"];
// 1 = low-risk transient data, 2 = approval-required logs/caches, 3 = high-risk manual-review data.
const ALLOWED_RISK_TIERS = new Set([1, 2, 3]);

function readManifest() {
  const raw = readFileSync(0, "utf8").trim();
  if (!raw) throw new Error("manifest JSON is required on stdin");
  return JSON.parse(raw);
}

function rows(manifest) {
  if (Array.isArray(manifest)) return manifest;
  return Array.isArray(manifest?.items) ? manifest.items : [];
}

function normalizedCommand(commandText) {
  return String(commandText || "").replace(/\\\s/g, " ");
}

function commandReferencesPath(commandText, itemPath) {
  const commandString = normalizedCommand(commandText);
  const pathString = String(itemPath || "");
  if (!pathString) return false;
  const escapedPath = pathString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s"';&|])${escapedPath}($|[\\s"';&|])`).test(commandString);
}

function hasRecursiveRm(commandText) {
  const commandString = normalizedCommand(commandText);
  // Detects recursive rm after normalizing escaped spaces: optional path prefix,
  // rm command boundary, arbitrary args, then -r/-R or --recursive.
  // Matches "rm -rf /tmp/a"; does not match "trash /tmp/a".
  return /(^|[\s;&|])(?:\/[^\s;&|]+\/)?rm\s*(?:[^\n;&|]*\s+)*(?:-[A-Za-z]*[rR][A-Za-z]*|--recursive)/i.test(commandString);
}

function targetsWholeTrash(commandText) {
  const commandString = normalizedCommand(commandText);
  // Covers common Trash utilities that can target a whole trash root:
  // trash/trash-put/gio trash/gvfs-trash, Finder osascript moves, and rm.
  const trashPath = /(?:~|\$HOME)\/\.Trash|(?:~|\$HOME)\/\.local\/share\/Trash|\b\/\.Trash\b/i;
  return /empty\s+trash/i.test(commandString)
    || (/\b(?:trash|trash-put|gvfs-trash)\b/i.test(commandString) && trashPath.test(commandString))
    || (/\bgio\s+trash\b/i.test(commandString) && trashPath.test(commandString))
    || (/\bosascript\b/i.test(commandString) && /Finder|Trash/i.test(commandString) && trashPath.test(commandString))
    || (/(^|[\s;&|])(?:\/[^\s;&|]+\/)?rm(?:\s+|$)/i.test(commandString) && trashPath.test(commandString));
}

function isSafeAbsolutePath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return false;
  if (value.includes("\u0000") || value.startsWith("//")) return false;
  if (value.split("/").includes("..")) return false;
  return path.posix.normalize(value) === value;
}

function validateManifest(manifest) {
  const errors = [];
  const items = rows(manifest);
  if (!Array.isArray(items) || items.length === 0) errors.push("items must be a non-empty array");
  for (const [index, item] of (items || []).entries()) {
    for (const field of REQUIRED_FIELDS) {
      if (!(field in item)) errors.push(`items[${index}].${field} is required`);
    }
    if (!isSafeAbsolutePath(item.path)) errors.push(`items[${index}].path must be absolute`);
    if (typeof item.estimatedBytes !== "number" || !Number.isFinite(item.estimatedBytes) || item.estimatedBytes < 0) errors.push(`items[${index}].estimatedBytes must be a non-negative number`);
    if (!ALLOWED_RISK_TIERS.has(item.riskTier)) errors.push(`items[${index}].riskTier must be 1, 2, or 3`);
    if (typeof item.cleanupCommand !== "string" || item.cleanupCommand.trim().length === 0) {
      errors.push(`items[${index}].cleanupCommand must be a non-empty string`);
    } else {
      if (!commandReferencesPath(item.cleanupCommand, item.path)) errors.push(`items[${index}].cleanupCommand must reference the specified path`);
      if (hasRecursiveRm(item.cleanupCommand)) errors.push(`items[${index}].cleanupCommand must not use recursive rm`);
      if (targetsWholeTrash(item.cleanupCommand)) errors.push(`items[${index}].cleanupCommand must not empty the whole Trash`);
    }
    if (item.riskTier === 2 || item.riskTier === 3) {
      if (typeof item.requiresApproval !== "boolean") errors.push(`items[${index}].requiresApproval must be a boolean for risk tier 2 or 3`);
      else if (!item.requiresApproval) errors.push(`items[${index}].requiresApproval must be true for risk tier 2 or 3`);
    }
  }
  return errors;
}

function validate() {
  const manifest = readManifest();
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log("Disk cleanup manifest valid");
}

function summary() {
  const manifest = readManifest();
  const items = rows(manifest);
  const totalBytes = items.reduce((sum, item) => sum + (Number(item.estimatedBytes) || 0), 0);
  const byRiskTier = Object.fromEntries([1, 2, 3].map((tier) => [tier, items.filter((item) => item.riskTier === tier).length]));
  console.log(JSON.stringify({ schemaVersion: 1, items: items.length, totalBytes, byRiskTier }, null, 2));
}

try {
  if (command === "validate") validate();
  else if (command === "summary") summary();
  else {
    console.error("usage: disk-cleanup-manifest.mjs validate|summary < manifest.json");
    process.exit(2);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { argValue } from "./lib/cli-args.mjs";
import { readStdinJson } from "./lib/read-stdin.mjs";
import {
  resolveWorkflowContract,
  validateWorkflowContract,
  WORKFLOW_CONTRACT_VERSION,
} from "./lib/workflow-contract.mjs";

const [command = "help", ...args] = process.argv.slice(2);
const value = (flag, fallback = "") => argValue(args, flag, fallback);

function inputJson() {
  const file = value("--file");
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  return readStdinJson({
    emptyValue: null,
    onInvalidJson: (error) => { throw new Error(`invalid JSON: ${error.message}`); },
    onReadError: (error) => { throw new Error(`cannot read JSON: ${error.message}`); },
  });
}

try {
  if (command === "resolve") {
    const budgetCap = value("--budget-cap");
    const authorizedBudget = value("--authorized-budget");
    const contract = resolveWorkflowContract({
      version: WORKFLOW_CONTRACT_VERSION,
      intent: value("--intent"),
      scope: value("--scope"),
      risk: value("--risk"),
      ...(authorizedBudget ? { authorizedBudget: JSON.parse(authorizedBudget) } : {}),
      ...(budgetCap ? { budgetCap: JSON.parse(budgetCap) } : {}),
    });
    process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
  } else if (command === "validate") {
    const contract = validateWorkflowContract(inputJson());
    process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
  } else {
    console.error("usage: workflow-contract.mjs resolve --intent build|fix|explain|review|ship --scope contained|coupled|broad --risk low|high [--authorized-budget JSON] [--budget-cap JSON] | validate [--file <path>]");
    process.exit(2);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

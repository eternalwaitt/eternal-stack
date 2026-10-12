import test from "node:test";
import assert from "node:assert/strict";
import {
  admitBudgetAction,
  resolveWorkflowContract,
  validateWorkflowContract,
  WORKFLOW_CONTRACT_VERSION,
} from "../scripts/lib/workflow-contract.mjs";

const resolve = (intent, scope = "contained", risk = "low", extra = {}) => resolveWorkflowContract({
  version: WORKFLOW_CONTRACT_VERSION, intent, scope, risk, ...extra,
});

test("direct build and fix are finite quick paths without packet or orchestration requirements", () => {
  for (const intent of ["build", "fix"]) {
    const contract = resolve(intent);
    assert.equal(contract.mode, "direct");
    assert.equal(contract.effects, "repository-write");
    assert.equal(contract.requirements.taskRecord, false);
    assert.equal(contract.requirements.planPhases, false);
    assert.equal(contract.requirements.packet, false);
    assert.equal(contract.requirements.independentReview, false);
    assert.equal(contract.budget.maxWorkers, 0);
    assert.equal(contract.budget.maxVerificationAttempts, 8);
    assert.equal(contract.requirements.tddEvidence, false);
    assert.equal(validateWorkflowContract(contract), contract);
  }
});

test("axes are explicit and invalid or absent classifications are rejected", () => {
  assert.throws(() => resolveWorkflowContract({ version: 1, intent: "fix a bug", scope: "contained", risk: "low" }), /intent must be one of/);
  assert.throws(() => resolveWorkflowContract({ version: 1, scope: "contained", risk: "low" }), /intent must be one of/);
});

test("high-risk readonly review does not require a review of the review", () => {
  const contract = resolve("review", "contained", "high");
  assert.equal(contract.mode, "readOnly");
  assert.equal(contract.effects, "read-only");
  assert.equal(contract.requirements.independentReview, false);
  assert.equal(contract.budget.maxWorkers, 0);
  assert.ok(contract.budget.maxVerificationAttempts > 0, "read-only review may run optional verification checks");
});

test("broad work has bounded orchestration; explicit authorization can raise its finite ceiling", () => {
  const ordinary = resolve("build", "broad", "low");
  assert.equal(ordinary.mode, "program");
  assert.equal(ordinary.requirements.planPhases, true);
  assert.ok(ordinary.budget.maxWorkers > 0 && ordinary.budget.maxWorkers < 64);
  const authorized = resolve("build", "broad", "low", { authorizedBudget: { maxWorkers: 12, maxVerificationAttempts: 20 } });
  assert.equal(authorized.budgetAuthority, "user-authorized");
  assert.equal(authorized.budget.maxWorkers, 12);
  assert.equal(authorized.budget.maxVerificationAttempts, 20);
  assert.throws(() => resolve("build", "broad", "low", { authorizedBudget: { maxWorkers: 1000 } }), /hard safety ceiling/);
});

test("budget caps only tighten and admission stops once a finite allowance is spent", () => {
  const contract = resolve("build", "contained", "low", { budgetCap: { maxVerificationAttempts: 2, maxRetries: 1 } });
  assert.equal(contract.budget.maxVerificationAttempts, 2);
  assert.throws(() => resolve("build", "contained", "low", { budgetCap: { maxVerificationAttempts: 9 } }), /cannot exceed/);
  assert.equal(admitBudgetAction(contract, { verificationAttempts: 1 }, "verification").allowed, true);
  assert.deepEqual(admitBudgetAction(contract, { verificationAttempts: 2 }, "verification"), {
    allowed: false,
    reason: "verification-budget-exhausted",
    remaining: {
      maxWorkers: 0, maxConcurrentWorkers: 0, maxReviews: 0, maxRetries: 1, maxVerificationAttempts: 0,
    },
  });
  assert.throws(() => resolve("build", "coupled", "high", { budgetCap: { maxReviews: 0 } }), /required independent review/);
  assert.throws(() => resolve("build", "broad", "low", { authorizedBudget: { maxWorkers: 2, maxConcurrentWorkers: 3 } }), /cannot exceed budget.maxWorkers/);
  assert.throws(() => admitBudgetAction(contract, { reviewWorkers: -1 }, "reviewer"), /usage.reviewWorkers/);
});

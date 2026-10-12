export const WORKFLOW_CONTRACT_VERSION = 1;

// Resource limits apply to finite checks, separately from model worker budgets.
export const CHECK_RESOURCE_LIMITS = Object.freeze({
  defaultConcurrency: 1,
  outputBytes: 256 * 1024,
});

const INTENTS = new Set(["build", "fix", "explain", "review", "ship"]);
const SCOPES = new Set(["contained", "coupled", "broad"]);
const RISKS = new Set(["low", "high"]);
const MODES = new Set(["readOnly", "direct", "structured", "program"]);
const BUDGET_FIELDS = [
  "maxWorkers",
  "maxConcurrentWorkers",
  "maxReviews",
  "maxRetries",
  "maxVerificationAttempts",
];
const AUTHORIZED_BUDGET_LIMITS = {
  maxWorkers: 64,
  maxConcurrentWorkers: 16,
  maxReviews: 8,
  maxRetries: 32,
  maxVerificationAttempts: 64,
};
const REQUIREMENT_FIELDS = [
  "taskRecord",
  "planPhases",
  "packet",
  "mechanicalVerification",
  "independentReview",
  "tddEvidence",
];

function fail(message) {
  throw new TypeError(`Invalid workflow contract: ${message}`);
}

function validateAxis(name, value, choices) {
  if (typeof value !== "string" || !choices.has(value)) {
    fail(`${name} must be one of ${[...choices].join(", ")}`);
  }
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function baseMode({ intent, scope, risk }) {
  if (intent === "explain" || intent === "review") return "readOnly";
  if (intent === "ship" || scope === "broad") return "program";
  if (scope === "coupled" || risk === "high") return "structured";
  return "direct";
}

function baseBudget(mode, risk, scope) {
  if (mode === "readOnly") {
    const delegated = scope === "broad" ? { maxWorkers: 4, maxConcurrentWorkers: 2, maxReviews: 2 }
      : scope === "coupled" ? { maxWorkers: 1, maxConcurrentWorkers: 1, maxReviews: 1 }
        : { maxWorkers: 0, maxConcurrentWorkers: 0, maxReviews: 0 };
    return { ...delegated, maxRetries: 0, maxVerificationAttempts: scope === "contained" ? 2 : 8 };
  }
  if (mode === "direct") {
    return { maxWorkers: 0, maxConcurrentWorkers: 0, maxReviews: 0, maxRetries: 4, maxVerificationAttempts: 8 };
  }
  if (mode === "structured") {
    return {
      maxWorkers: 1,
      maxConcurrentWorkers: 1,
      maxReviews: risk === "high" ? 3 : 0,
      maxRetries: 4,
      maxVerificationAttempts: 8,
    };
  }
  return { maxWorkers: 8, maxConcurrentWorkers: 3, maxReviews: 4, maxRetries: 6, maxVerificationAttempts: 12 };
}

function applyBudget(budget, authorizedBudget, budgetCap) {
  if (authorizedBudget !== undefined) {
    if (!authorizedBudget || typeof authorizedBudget !== "object" || Array.isArray(authorizedBudget)) fail("authorizedBudget must be an object");
    const unknown = Object.keys(authorizedBudget).filter((key) => !BUDGET_FIELDS.includes(key));
    if (unknown.length) fail(`authorizedBudget contains unknown fields: ${unknown.join(", ")}`);
    for (const field of BUDGET_FIELDS) {
      if (authorizedBudget[field] === undefined) continue;
      if (!isNonNegativeInteger(authorizedBudget[field])) fail(`authorizedBudget.${field} must be a non-negative safe integer`);
      if (authorizedBudget[field] > AUTHORIZED_BUDGET_LIMITS[field]) fail(`authorizedBudget.${field} exceeds the hard safety ceiling (${AUTHORIZED_BUDGET_LIMITS[field]})`);
      budget[field] = authorizedBudget[field];
    }
  }
  if (budgetCap === undefined) return budget;
  if (!budgetCap || typeof budgetCap !== "object" || Array.isArray(budgetCap)) {
    fail("budgetCap must be an object");
  }
  const unknown = Object.keys(budgetCap).filter((key) => !BUDGET_FIELDS.includes(key));
  if (unknown.length) fail(`budgetCap contains unknown fields: ${unknown.join(", ")}`);
  const capped = { ...budget };
  for (const field of BUDGET_FIELDS) {
    if (budgetCap[field] === undefined) continue;
    if (!isNonNegativeInteger(budgetCap[field])) fail(`budgetCap.${field} must be a non-negative safe integer`);
    if (budgetCap[field] > budget[field]) fail(`budgetCap.${field} cannot exceed the resolved ceiling (${budget[field]})`);
    capped[field] = budgetCap[field];
  }
  return capped;
}

export function resolveWorkflowContract(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("input must be an object");
  if (input.version !== WORKFLOW_CONTRACT_VERSION) fail(`version must be ${WORKFLOW_CONTRACT_VERSION}`);
  validateAxis("intent", input.intent, INTENTS);
  validateAxis("scope", input.scope, SCOPES);
  validateAxis("risk", input.risk, RISKS);

  const mode = baseMode(input);
  const program = mode === "program";
  const readOnly = mode === "readOnly";
  const requirements = {
    projectState: requiresProjectState({ mode, workKind: input.workKind || "substantive", effects: readOnly ? "read-only" : "repository-write" }),
    taskRecord: program || mode === "structured",
    planPhases: program,
    packet: program,
    mechanicalVerification: !readOnly,
    independentReview: program || (!readOnly && input.risk === "high"),
    tddEvidence: !readOnly && input.intent === "fix" && mode !== "direct",
  };
  const budget = applyBudget(baseBudget(mode, input.risk, input.scope), input.authorizedBudget, input.budgetCap);
  const contract = {
    version: WORKFLOW_CONTRACT_VERSION,
    workKind: input.workKind || "substantive",
    intent: input.intent,
    scope: input.scope,
    risk: input.risk,
    mode,
    requirements,
    enforcement: {
      routing: "explicit-axes",
      verification: requirements.mechanicalVerification ? "command-run" : "not-required",
      review: requirements.independentReview ? "agent-judgment" : "not-required",
    },
    budget,
    budgetAuthority: input.authorizedBudget === undefined ? "mode-default" : "user-authorized",
    effects: readOnly ? "read-only" : "repository-write",
    exhaustion: "stop-preserve-report",
  };
  validateWorkflowContract(contract);
  return contract;
}

export function validateWorkflowContract(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) fail("value must be an object");
  if (contract.version !== WORKFLOW_CONTRACT_VERSION) fail(`version must be ${WORKFLOW_CONTRACT_VERSION}`);
  validateAxis("intent", contract.intent, INTENTS);
  validateAxis("scope", contract.scope, SCOPES);
  validateAxis("risk", contract.risk, RISKS);
  validateAxis("mode", contract.mode, MODES);

  if (contract.workKind !== undefined && !["substantive", "trivial"].includes(contract.workKind)) fail("workKind must be substantive or trivial");
  if (contract.workKind === "trivial" && contract.mode !== "direct" && contract.mode !== "readOnly") fail("trivial work must be contained, low-risk direct work");
  const expectedMode = baseMode(contract);
  if (contract.mode !== expectedMode) fail(`mode must be ${expectedMode} for the supplied intent/scope/risk`);
  if (contract.exhaustion !== "stop-preserve-report") fail("exhaustion must be stop-preserve-report");

  const requirements = contract.requirements;
  if (!requirements || typeof requirements !== "object" || Array.isArray(requirements)) fail("requirements must be an object");
  for (const field of REQUIREMENT_FIELDS) {
    if (typeof requirements[field] !== "boolean") fail(`requirements.${field} must be boolean`);
  }
  if (requirements.projectState !== undefined && requirements.projectState !== requiresProjectState(contract)) fail('requirements.projectState does not match the canonical workflow');
  const readOnly = contract.mode === "readOnly";
  const program = contract.mode === "program";
  const expectedRequirements = {
    taskRecord: program || contract.mode === "structured",
    planPhases: program,
    packet: program,
    mechanicalVerification: !readOnly,
    independentReview: program || (!readOnly && contract.risk === "high"),
    tddEvidence: !readOnly && contract.intent === "fix" && contract.mode !== "direct",
  };
  for (const field of REQUIREMENT_FIELDS) {
    if (requirements[field] !== expectedRequirements[field]) {
      fail(`requirements.${field} does not match the resolved workflow`);
    }
  }

  const enforcement = contract.enforcement;
  if (!enforcement || typeof enforcement !== "object" || Array.isArray(enforcement)) fail("enforcement must be an object");
  if (enforcement.routing !== "explicit-axes") fail("enforcement.routing must be explicit-axes");
  if (enforcement.verification !== (requirements.mechanicalVerification ? "command-run" : "not-required")) {
    fail("enforcement.verification does not match requirements");
  }
  if (enforcement.review !== (requirements.independentReview ? "agent-judgment" : "not-required")) {
    fail("enforcement.review does not match requirements");
  }

  const budget = contract.budget;
  if (!budget || typeof budget !== "object" || Array.isArray(budget)) fail("budget must be an object");
  const unknownBudget = Object.keys(budget).filter((key) => !BUDGET_FIELDS.includes(key));
  if (unknownBudget.length) fail(`budget contains unknown fields: ${unknownBudget.join(", ")}`);
  if (!["mode-default", "user-authorized"].includes(contract.budgetAuthority)) fail("budgetAuthority must be mode-default or user-authorized");
  if (contract.effects !== (contract.mode === "readOnly" ? "read-only" : "repository-write")) fail("effects does not match the resolved mode");
  const ceiling = contract.budgetAuthority === "user-authorized"
    ? AUTHORIZED_BUDGET_LIMITS
    : baseBudget(contract.mode, contract.risk, contract.scope);
  for (const field of BUDGET_FIELDS) {
    if (!isNonNegativeInteger(budget[field])) fail(`budget.${field} must be a non-negative safe integer`);
    if (budget[field] > ceiling[field]) fail(`budget.${field} cannot exceed the resolved ceiling (${ceiling[field]})`);
  }
  if (budget.maxConcurrentWorkers > budget.maxWorkers) fail("budget.maxConcurrentWorkers cannot exceed budget.maxWorkers");
  if (contract.mode === "direct" && (budget.maxWorkers !== 0 || budget.maxConcurrentWorkers !== 0 || budget.maxReviews !== 0)) {
    fail("direct mode cannot admit workers or reviews");
  }
  if (requirements.independentReview && budget.maxReviews < 1) fail("required independent review needs budget.maxReviews of at least 1");
  if (requirements.mechanicalVerification && budget.maxVerificationAttempts < 1) fail("required mechanical verification needs at least one verification attempt");
  return contract;
}

export function admitBudgetAction(contract, usage, action) {
  validateWorkflowContract(contract);
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) fail("usage must be an object");
  for (const field of ["workers", "concurrentWorkers", "reviews", "reviewWorkers", "retries", "verificationAttempts"]) {
    if (usage[field] !== undefined && !isNonNegativeInteger(usage[field])) fail(`usage.${field} must be a non-negative safe integer`);
  }
  const mapping = {
    worker: ["workers", "maxWorkers"],
    reviewer: ["reviewWorkers", "maxReviews"],
    review: ["reviews", "maxReviews"],
    retry: ["retries", "maxRetries"],
    verification: ["verificationAttempts", "maxVerificationAttempts"],
  };
  if (!Object.hasOwn(mapping, action)) fail(`action must be one of ${Object.keys(mapping).join(", ")}`);
  const [usageField, budgetField] = mapping[action];
  const used = usage[usageField] ?? 0;
  const maximum = contract.budget[budgetField];
  let reason = "";
  if (used >= maximum) reason = `${action}-budget-exhausted`;
  if (!reason && ["worker", "reviewer"].includes(action) && (usage.concurrentWorkers ?? 0) >= contract.budget.maxConcurrentWorkers) {
    reason = "concurrent-worker-budget-exhausted";
  }
  const usageByBudget = {
    maxWorkers: "workers",
    maxConcurrentWorkers: "concurrentWorkers",
    maxReviews: "reviewWorkers",
    maxRetries: "retries",
    maxVerificationAttempts: "verificationAttempts",
  };
  const remaining = Object.fromEntries(BUDGET_FIELDS.map((field) => [
    field,
    Math.max(0, contract.budget[field] - (usage[usageByBudget[field]] ?? 0)),
  ]));
  return { allowed: reason === "", reason: reason || null, remaining };
}

// Substantive repository changes maintain durable authored state. Tiny direct and
// read-only work avoid mandatory bootstrap; existing state is still refreshed by
// repository-write helpers. Kept canonical alongside the workflow requirements.
export function requiresProjectState(contract) {
  return Boolean(contract && contract.effects === 'repository-write' && (contract.workKind === 'substantive' || contract.mode !== 'direct'));
}

export function projectStateInstructions(contract) {
  return {
    required: requiresProjectState(contract),
    document: 'PROJECT_STATE.md or explicitly bound existing canonical state document',
    order: requiresProjectState(contract) ? ['read current project state, scoped lessons and owned unresolved work', 'reconcile request, feature identity and current evidence before choosing work', 'maintain authored features, pending items and confirmed lessons', 'record-state --outcome TEXT --pending TEXT --learning updated|none', 'run required checks', 'request required review', 'check-stop'] : ['read existing state as context; do not bootstrap or require acknowledgement for this workflow'],
    command: 'execution-ledger',
    contextCommand: 'project-state',
    note: 'Task maintenance is author-reported; generated counts do not establish feature readiness. Tiny direct and read-only work do not bootstrap a document; repository-write helpers refresh existing state.',
  };
}

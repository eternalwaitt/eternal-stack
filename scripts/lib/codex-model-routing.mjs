// Re-verify slug map against the live model list on model upgrades.
export const MODEL_TIERS = new Set(["fast", "standard", "top"]);
export const CODEX_MODELS = new Set(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
export const REASONING_EFFORTS = new Set(["low", "medium", "high"]);

const TIER_DEFAULTS = {
  fast: { model: "gpt-5.6-luna", reasoningEffort: "low" },
  standard: { model: "gpt-5.6-terra", reasoningEffort: "medium" },
  top: { model: "gpt-5.6-terra", reasoningEffort: "high" },
};

// The escalation model is named once so a routing change moves every consumer
// with it — a validator, a rollout metric, or a docs string that hardcodes the
// slug reports on a model the router no longer selects.
export const SOL_ESCALATION_MODEL = "gpt-5.6-sol";

// gpt-5.6-sol is allowed only when modelTierJustification names integration-owner or adversarial escalation.
const SOL_ESCALATION_PATTERN = /integration[- ]owner|adversarial/i;

function tierEnvVarName(modelTier) {
  return `ETRNL_CODEX_MODEL_${modelTier.toUpperCase()}`;
}

export function allowsSolEscalation(modelTierJustification) {
  return typeof modelTierJustification === "string"
    && SOL_ESCALATION_PATTERN.test(modelTierJustification);
}

function assertKnownModel(model, source) {
  if (!CODEX_MODELS.has(model)) {
    throw new Error(`${source}: unknown codex model ${JSON.stringify(model)}`);
  }
}

function assertKnownEffort(reasoningEffort, source) {
  if (!REASONING_EFFORTS.has(reasoningEffort)) {
    throw new Error(`${source}: unknown reasoning effort ${JSON.stringify(reasoningEffort)}`);
  }
}

function assertSolEscalationAllowed(model, modelTierJustification) {
  if (model === SOL_ESCALATION_MODEL && !allowsSolEscalation(modelTierJustification)) {
    throw new Error(
      `${SOL_ESCALATION_MODEL} requires modelTierJustification naming integration-owner or adversarial escalation`,
    );
  }
}

function resolveFromTier(modelTier, modelTierJustification) {
  if (!modelTier || !MODEL_TIERS.has(modelTier)) {
    throw new Error(`modelTier must be one of: fast, standard, top (got: ${JSON.stringify(modelTier)})`);
  }

  const envModel = process.env[tierEnvVarName(modelTier)]?.trim();
  if (envModel) {
    assertKnownModel(envModel, tierEnvVarName(modelTier));
    assertSolEscalationAllowed(envModel, modelTierJustification);
    return {
      model: envModel,
      reasoningEffort: TIER_DEFAULTS[modelTier].reasoningEffort,
    };
  }

  return { ...TIER_DEFAULTS[modelTier] };
}

/**
 * Resolve Codex model slug and reasoning effort for agent task packets.
 *
 * Precedence: explicit codexModel/codexReasoningEffort, ETRNL_CODEX_MODEL_<TIER>, static tier map.
 *
 * @param {object} options
 * @param {"fast"|"standard"|"top"} [options.modelTier]
 * @param {string} [options.codexModel]
 * @param {string} [options.codexReasoningEffort]
 * @param {string} [options.modelTierJustification]
 * @returns {{ model: string, reasoningEffort: string }}
 */
export function resolveCodexModel({
  modelTier,
  codexModel,
  codexReasoningEffort,
  modelTierJustification,
} = {}) {
  const explicitModel = typeof codexModel === "string" ? codexModel.trim() : "";
  const explicitEffort = typeof codexReasoningEffort === "string" ? codexReasoningEffort.trim() : "";

  if (explicitModel) {
    assertKnownModel(explicitModel, "codexModel");
    assertSolEscalationAllowed(explicitModel, modelTierJustification);
    const tierDefaults = modelTier && MODEL_TIERS.has(modelTier)
      ? TIER_DEFAULTS[modelTier]
      : TIER_DEFAULTS.standard;
    const reasoningEffort = explicitEffort || tierDefaults.reasoningEffort;
    assertKnownEffort(reasoningEffort, "codexReasoningEffort");
    return { model: explicitModel, reasoningEffort };
  }

  if (explicitEffort) {
    throw new Error("codexReasoningEffort requires codexModel");
  }

  return resolveFromTier(modelTier, modelTierJustification);
}

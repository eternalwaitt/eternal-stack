/**
 * Returns true only when every non-empty keyword appears in the candidate text,
 * using lowercase containment for deterministic prompt and log classifiers.
 * @param {string} candidateText - Candidate text to search.
 * @param {string[]} keywords - Keyword list; empty entries are ignored.
 * @returns {boolean} True when every non-empty keyword appears in candidateText.
 * @example
 * hasKeywords("Run the project tests", ["project", "tests"]);
 */
export function hasKeywords(candidateText, keywords) {
  if (!Array.isArray(keywords)) return false;
  const lower = String(candidateText || "").toLowerCase();
  const normalizedKeywords = keywords
    .map((keyword) => String(keyword || "").trim().toLowerCase())
    .filter(Boolean);
  if (normalizedKeywords.length === 0) return false;
  return normalizedKeywords.every((keyword) => lower.includes(keyword));
}

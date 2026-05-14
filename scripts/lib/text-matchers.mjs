export function hasKeywords(text, keywords) {
  if (!Array.isArray(keywords)) return false;
  const lower = String(text || "").toLowerCase();
  const normalizedKeywords = keywords
    .map((keyword) => String(keyword || "").trim().toLowerCase())
    .filter(Boolean);
  if (normalizedKeywords.length === 0) return false;
  return normalizedKeywords.every((keyword) => lower.includes(keyword));
}

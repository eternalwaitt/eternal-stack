// One source for the UI/UX finding vocabulary. The artifact validator, the
// browser-QA design-evidence rows, and the coverage gate all grade the same
// findings, so a tier added in one place must not be rejected by another.
export const UX_SEVERITIES = Object.freeze(["critical", "high", "medium", "opportunity"]);
export const UX_FINDING_STATUSES = Object.freeze(["open", "fixed", "accepted_risk", "blocked", "false_positive"]);

export const UX_SEVERITY_SET = new Set(UX_SEVERITIES);
export const UX_FINDING_STATUS_SET = new Set(UX_FINDING_STATUSES);

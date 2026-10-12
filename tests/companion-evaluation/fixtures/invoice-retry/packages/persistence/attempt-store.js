export function createAttemptStore() {
  const attempts = new Map();
  return {
    get: invoiceId => attempts.get(invoiceId),
    put: attempt => attempts.set(attempt.invoiceId, structuredClone(attempt)),
  };
}

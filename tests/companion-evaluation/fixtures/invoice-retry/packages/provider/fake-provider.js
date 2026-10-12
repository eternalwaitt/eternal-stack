export function createFakeProvider({ failAfterAcceptOnce = false } = {}) {
  const accepted = new Map();
  let failed = false;
  return {
    accepted,
    async charge({ idempotencyKey, amountMinor, currency }) {
      if (!accepted.has(idempotencyKey)) accepted.set(idempotencyKey, { id: `pay_${accepted.size + 1}`, amountMinor, currency });
      const payment = accepted.get(idempotencyKey);
      if (failAfterAcceptOnce && !failed) {
        failed = true;
        throw Object.assign(new Error('response timed out after provider acceptance'), { code: 'ETIMEDOUT' });
      }
      return payment;
    },
  };
}

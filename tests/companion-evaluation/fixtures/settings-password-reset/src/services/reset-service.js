export async function createResetLink(email, { accounts, resetTokens, clock, tokenFactory, tokenHash }) {
  const account = await accounts.findByEmail(email);
  const rawToken = tokenFactory();
  if (account) {
    await resetTokens.store({ accountId: account.id, tokenHash: tokenHash(rawToken), expiresAt: clock.now() + 30 * 60_000, usedAt: null });
  }
  return rawToken;
}

export async function consumeResetLink(rawToken, { resetTokens, clock, tokenHash }) {
  const record = await resetTokens.findByHash(tokenHash(rawToken));
  if (!record || record.usedAt || record.expiresAt <= clock.now()) return { ok: false };
  await resetTokens.markUsed(record.tokenHash, clock.now());
  return { ok: true, resetSession: { accountId: record.accountId, tokenHash: record.tokenHash } };
}

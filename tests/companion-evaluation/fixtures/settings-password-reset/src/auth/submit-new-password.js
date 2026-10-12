export async function postNewPassword(resetSession, password, dependencies) {
  if (!dependencies.passwordPolicy.accepts(password)) return { status: 400, error: 'password-policy' };
  await dependencies.accounts.replacePassword(resetSession.accountId, password);
  await dependencies.sessions.revokeAll(resetSession.accountId);
  return { redirect: '/login?password-reset=complete' };
}

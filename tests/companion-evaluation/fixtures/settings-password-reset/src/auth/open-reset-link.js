import { consumeResetLink } from '../services/reset-service.js';

export async function getResetLink(token, dependencies) {
  const result = await consumeResetLink(token, dependencies);
  if (!result.ok) return { redirect: '/reset-password?error=invalid-or-expired' };
  return { page: 'set-new-password', resetSession: result.resetSession };
}

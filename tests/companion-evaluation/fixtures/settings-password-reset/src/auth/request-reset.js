import { createResetLink } from '../services/reset-service.js';

export async function postPasswordReset(email, dependencies) {
  const token = await createResetLink(email, dependencies);
  await dependencies.mailer.send({ to: email, template: 'password-reset', url: `${dependencies.publicUrl}/reset-password/${token}` });
  return { status: 202, body: 'If that address is registered, a link is on its way.' };
}

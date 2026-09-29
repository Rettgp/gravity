import { isAllowed } from '@gravity/shared';

export class NotAllowedError extends Error {}

/** Throws unless the email is on the family allowlist. Shared by both Cognito triggers. */
export async function assertAllowed(email: string | undefined, allowlist: () => Promise<string[]>) {
  if (!isAllowed(email, await allowlist())) throw new NotAllowedError('This Gravity is invite-only.');
}

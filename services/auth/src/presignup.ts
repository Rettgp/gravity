import type { PreSignUpTriggerEvent } from 'aws-lambda';
import { ssmAllowlist } from '@gravity/shared/aws';
import { assertAllowed } from './gate.js';

const allowlist = ssmAllowlist();

/** Runs before Cognito creates a user (including first Google federation). Rejects strangers. */
export const handler = async (event: PreSignUpTriggerEvent) => {
  await assertAllowed(event.request.userAttributes.email, allowlist);
  // Only Google-verified addresses count; link federated users automatically.
  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;
  return event;
};

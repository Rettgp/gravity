import type { PreTokenGenerationTriggerEvent } from 'aws-lambda';
import { ssmAllowlist } from '@gravity/shared/aws';
import { assertAllowed } from './gate.js';

const allowlist = ssmAllowlist();

/** Runs on EVERY token issue and refresh, so removing an email locks the person out within an hour. */
export const handler = async (event: PreTokenGenerationTriggerEvent) => {
  await assertAllowed(event.request.userAttributes.email, allowlist);
  return event;
};

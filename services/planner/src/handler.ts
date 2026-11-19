import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { DynamoDb, ssmAllowlist, toLambda } from '@gravity/shared/aws';
import { buildPlannerRouter } from './router.js';

const from = process.env.PRICE_ALERT_FROM;
const ses = new SESv2Client({});

const router = buildPlannerRouter({
  db: new DynamoDb(),
  table: process.env.TABLE!,
  allowlist: ssmAllowlist(),
  // Without PRICE_ALERT_FROM, fail so the check leaves the alert armed instead of marking it sent.
  sendEmail: from
    ? async ({ to, subject, body }) => {
        await ses.send(
          new SendEmailCommand({
            FromEmailAddress: from,
            Destination: { ToAddresses: [to] },
            Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: body } } } },
          }),
        );
      }
    : async () => {
        throw new Error('PRICE_ALERT_FROM not set');
      },
});
const api = toLambda(router);

/** One Lambda, two triggers: API Gateway requests, and the daily EventBridge schedule that checks tracked gift prices. */
export const handler = async (event: Parameters<typeof api>[0] | { source?: string }) => {
  if ((event as { source?: string }).source === 'aws.events') {
    console.log('scheduled price check', await router.checkPrices());
    return;
  }
  return api(event as Parameters<typeof api>[0]);
};

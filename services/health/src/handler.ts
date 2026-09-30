import { DynamoDb, ssmAllowlist, toLambda } from '@gravity/shared/aws';
import { RealGoogle } from './google.js';
import { buildHealthRouter } from './router.js';
import { SsmTokens, ssmClientSecret } from './tokens.js';

const redirects = (process.env.HEALTH_REDIRECT_URIS ?? '').split(',').filter(Boolean);
const router = buildHealthRouter({
  db: new DynamoDb(),
  table: process.env.TABLE!,
  coreTable: process.env.CORE_TABLE!,
  allowlist: ssmAllowlist(),
  google: new RealGoogle({ clientId: process.env.GOOGLE_HEALTH_CLIENT_ID, clientSecret: ssmClientSecret(process.env.GOOGLE_HEALTH_SECRET_PARAM) }),
  tokens: new SsmTokens(),
  redirectOk: (uri) => redirects.includes(uri),
});
const api = toLambda(router);

/** One Lambda, two triggers: API Gateway requests, and the 4-hourly EventBridge schedule that keeps data fresh. */
export const handler = async (event: Parameters<typeof api>[0] | { source?: string }) => {
  if ((event as { source?: string }).source === 'aws.events') {
    console.log('scheduled health sync', await router.syncAll());
    return;
  }
  return api(event as Parameters<typeof api>[0]);
};

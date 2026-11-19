import { DynamoDb, ssmAllowlist, toLambda } from '@gravity/shared/aws';
import { buildTripsRouter } from './router.js';

export const handler = toLambda(buildTripsRouter({ db: new DynamoDb(), table: process.env.TABLE!, allowlist: ssmAllowlist() }));

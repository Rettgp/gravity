import { DynamoDb, ssmAllowlist, toLambda } from '@gravity/shared/aws';
import { buildMealsRouter } from './router.js';

export const handler = toLambda(buildMealsRouter({ db: new DynamoDb(), table: process.env.TABLE!, allowlist: ssmAllowlist() }));

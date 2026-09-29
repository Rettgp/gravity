import { DynamoDb, ssmAllowlist, toLambda } from '@gravity/shared/aws';

import { buildCoreRouter } from './router.js';

export const handler = toLambda(buildCoreRouter({ db: new DynamoDb(), table: process.env.TABLE!, allowlist: ssmAllowlist() }));

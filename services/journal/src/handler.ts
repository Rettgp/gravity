import { DynamoDb, ssmAllowlist, toLambda } from '@gravity/shared/aws';
import { buildJournalRouter } from './router.js';

export const handler = toLambda(
  buildJournalRouter({ db: new DynamoDb(), table: process.env.TABLE!, coreTable: process.env.CORE_TABLE!, allowlist: ssmAllowlist() }),
);

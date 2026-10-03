import { DynamoDb, S3Photos, ssmAllowlist, toLambda } from '@gravity/shared/aws';
import { buildJournalRouter } from './router.js';

export const handler = toLambda(
  buildJournalRouter({ db: new DynamoDb(), table: process.env.TABLE!, coreTable: process.env.CORE_TABLE!, healthTable: process.env.HEALTH_TABLE, photos: process.env.PHOTOS_BUCKET ? new S3Photos(process.env.PHOTOS_BUCKET) : undefined, allowlist: ssmAllowlist() }),
);

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { Db, Item } from './db.js';

export class DynamoDb implements Db {
  private doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

  async get(TableName: string, pk: string, sk: string) {
    const r = await this.doc.send(new GetCommand({ TableName, Key: { pk, sk } }));
    return r.Item as Item | undefined;
  }
  async put(TableName: string, Item: Item) {
    await this.doc.send(new PutCommand({ TableName, Item }));
  }
  async delete(TableName: string, pk: string, sk: string) {
    await this.doc.send(new DeleteCommand({ TableName, Key: { pk, sk } }));
  }
  async query(TableName: string, pk: string, prefix = '') {
    const out: Item[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const r = await this.doc.send(
        new QueryCommand({
          TableName,
          KeyConditionExpression: prefix ? 'pk = :pk AND begins_with(sk, :p)' : 'pk = :pk',
          ExpressionAttributeValues: prefix ? { ':pk': pk, ':p': prefix } : { ':pk': pk },
          ExclusiveStartKey,
        }),
      );
      out.push(...((r.Items ?? []) as Item[]));
      ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
  }
}

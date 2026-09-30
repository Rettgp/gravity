import { DeleteParameterCommand, GetParameterCommand, ParameterNotFound, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

/** Where each person's Google refresh token lives. It is a credential, so it never goes in DynamoDB. */
export interface TokenStore {
  get(profileId: string): Promise<string | undefined>;
  put(profileId: string, token: string): Promise<void>;
  delete(profileId: string): Promise<void>;
}

export class MemoryTokens implements TokenStore {
  private m = new Map<string, string>();
  async get(id: string) {
    return this.m.get(id);
  }
  async put(id: string, token: string) {
    this.m.set(id, token);
  }
  async delete(id: string) {
    this.m.delete(id);
  }
}

export const TOKEN_PREFIX = '/gravity/health/tokens/';
export const CLIENT_SECRET_PARAM = '/gravity/health/google-client-secret';

/** SSM Parameter Store SecureString: encrypted with the free AWS-managed key, no per-secret fee (unlike Secrets Manager). */
export class SsmTokens implements TokenStore {
  private ssm = new SSMClient({});
  private name = (id: string) => TOKEN_PREFIX + id;
  async get(id: string) {
    try {
      const r = await this.ssm.send(new GetParameterCommand({ Name: this.name(id), WithDecryption: true }));
      return r.Parameter?.Value;
    } catch (e) {
      if (e instanceof ParameterNotFound) return undefined;
      throw e;
    }
  }
  async put(id: string, token: string) {
    await this.ssm.send(new PutParameterCommand({ Name: this.name(id), Value: token, Type: 'SecureString', Overwrite: true }));
  }
  async delete(id: string) {
    try {
      await this.ssm.send(new DeleteParameterCommand({ Name: this.name(id) }));
    } catch (e) {
      if (!(e instanceof ParameterNotFound)) throw e;
    }
  }
}

/** The Google OAuth client secret, read once per warm Lambda. Created by hand: `aws ssm put-parameter` (see README). */
export function ssmClientSecret(name = CLIENT_SECRET_PARAM) {
  const ssm = new SSMClient({});
  let cached: string | undefined;
  return async () => {
    if (cached) return cached;
    const r = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    cached = r.Parameter?.Value ?? '';
    if (!cached) throw new Error('Google client secret is empty');
    return cached;
  };
}

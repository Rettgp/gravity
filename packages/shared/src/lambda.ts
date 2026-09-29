import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { normalizeEmail } from './access.js';
import type { Router } from './http.js';

export const ALLOWLIST_PARAM = '/gravity/allowed-emails';

/** Reads the allowlist from SSM with a 60s cache (so removals take effect quickly). */
export function ssmAllowlist(name = process.env.ALLOWLIST_PARAM ?? ALLOWLIST_PARAM) {
  const ssm = new SSMClient({});
  let cache: { at: number; list: string[] } | undefined;
  return async () => {
    if (cache && Date.now() - cache.at < 60_000) return cache.list;
    const r = await ssm.send(new GetParameterCommand({ Name: name }));
    const list = (r.Parameter?.Value ?? '').split(',').map(normalizeEmail).filter(Boolean);
    cache = { at: Date.now(), list };
    return list;
  };
}

/** Adapts a Router to an API Gateway HTTP API (payload v2) Lambda handler. */
export function toLambda(router: Router) {
  return async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> => {
    const claims = event.requestContext.authorizer?.jwt?.claims ?? {};
    const verified = String(claims.email_verified) === 'true';
    let body: unknown;
    if (event.body) {
      try {
        body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body);
      } catch {
        return { statusCode: 400, headers: { 'content-type': 'application/json' }, body: '{"error":"Invalid JSON"}' };
      }
    }
    const res = await router({
      method: event.requestContext.http.method,
      path: event.rawPath,
      query: (event.queryStringParameters ?? {}) as Record<string, string>,
      body,
      user:
        claims.sub && claims.email && verified
          ? { sub: String(claims.sub), email: String(claims.email), name: claims.name ? String(claims.name) : undefined }
          : null,
    });
    return {
      statusCode: res.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify(res.body ?? null),
    };
  };
}

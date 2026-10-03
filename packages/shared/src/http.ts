import { ZodError, type ZodTypeAny, type z } from 'zod';
import { isAllowed } from './access.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface AuthUser {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}
export interface Ctx {
  user: AuthUser;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
}
export interface Reply {
  status?: number;
  body?: unknown;
}
export type Handler = (ctx: Ctx) => Promise<Reply | unknown>;
export interface Route {
  method: string;
  path: string;
  handler: Handler;
}
export interface Req {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  user: AuthUser | null;
}
export interface Res {
  status: number;
  body: unknown;
}

export const parse = <T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> => {
  try {
    return schema.parse(data);
  } catch (e) {
    if (e instanceof ZodError) throw new HttpError(400, e.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
    throw e;
  }
};

const compile = (path: string) => {
  const names: string[] = [];
  const src = path.replace(/:([a-zA-Z]+)/g, (_m, n: string) => {
    names.push(n);
    return '([^/]+)';
  });
  return { re: new RegExp('^' + src + '/?$'), names };
};

export interface RouterOptions {
  prefix: string;
  routes: Route[];
  allowlist: () => Promise<string[]>;
}

/** Framework-free router with the auth + allowlist gate applied to every request. */
export function createRouter({ prefix, routes, allowlist }: RouterOptions) {
  const compiled = routes.map((r) => ({ ...r, ...compile(r.path) }));
  return async (req: Req): Promise<Res> => {
    try {
      if (!req.user || !req.user.sub) throw new HttpError(401, 'Unauthorized');
      if (!isAllowed(req.user.email, await allowlist())) throw new HttpError(403, 'Not a member of this family');
      if (!req.path.startsWith(prefix)) throw new HttpError(404, 'Not found');
      const rel = req.path.slice(prefix.length) || '/';
      let methodMismatch = false;
      for (const r of compiled) {
        const m = r.re.exec(rel);
        if (!m) continue;
        if (r.method !== req.method) {
          methodMismatch = true;
          continue;
        }
        const params: Record<string, string> = {};
        r.names.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1]!)));
        const out = (await r.handler({ user: req.user, params, query: req.query, body: req.body })) as Reply | undefined;
        if (out && typeof out === 'object' && ('status' in out || 'body' in out)) return { status: out.status ?? 200, body: out.body };
        return { status: 200, body: out };
      }
      throw new HttpError(methodMismatch ? 405 : 404, methodMismatch ? 'Method not allowed' : 'Not found');
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
      console.error(e);
      return { status: 500, body: { error: 'Internal error' } };
    }
  };
}
export type Router = ReturnType<typeof createRouter>;

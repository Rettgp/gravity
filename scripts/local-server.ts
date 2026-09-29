/**
 * Local API for development: the same routers that run in Lambda, backed by a JSON file instead of DynamoDB.
 * Auth is a dev-only header (x-dev-user: <email>), so it must never be deployed. It only listens on localhost.
 */
import { createServer } from 'node:http';
import { generateDemoDays, MemoryDb, normalizeEmail } from '@gravity/shared/server';
import { buildCoreRouter } from '../services/core/src/router';
import { buildJournalRouter } from '../services/journal/src/router';

const PORT = Number(process.env.PORT ?? 8787);
const FILE = process.env.GRAVITY_LOCAL_DB ?? '.gravity-local/db.json';
const ALLOWED = (process.env.LOCAL_ALLOWED_EMAILS ?? 'mom@gravity.local,dad@gravity.local,teen@gravity.local')
  .split(',')
  .map(normalizeEmail)
  .filter(Boolean);

const db = new MemoryDb(FILE);
const allowlist = async () => ALLOWED;
const core = buildCoreRouter({ db, table: 'core', allowlist });
const journal = buildJournalRouter({ db, table: 'journal', coreTable: 'core', allowlist });

const nameOf = (email: string) => {
  const n = email.split('@')[0] ?? 'dev';
  return n.charAt(0).toUpperCase() + n.slice(1);
};

const send = (res: import('node:http').ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(status === 204 ? undefined : JSON.stringify(body ?? null));
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  let body: unknown;
  try {
    body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
  } catch {
    return send(res, 400, { error: 'Invalid JSON' });
  }

  if (url.pathname === '/api/dev/users') return send(res, 200, ALLOWED);

  const email = String(req.headers['x-dev-user'] ?? '');
  const user = email ? { sub: 'local-' + normalizeEmail(email), email: normalizeEmail(email), name: nameOf(email) } : null;
  const query = Object.fromEntries(url.searchParams);
  const r = { method: req.method ?? 'GET', path: url.pathname, query, body, user };

  if (url.pathname === '/api/dev/seed' && r.method === 'POST') {
    // Fill the caller's own profile with demo days so the calendar and insights have something to show.
    const me = user && ALLOWED.includes(user.email) ? await core({ ...r, method: 'GET', path: '/api/core/me' }) : undefined;
    if (!me || me.status !== 200) return send(res, 403, { error: 'Not allowed' });
    const pid = (me.body as { defaultProfileId: string }).defaultProfileId;
    const today = new Date().toISOString().slice(0, 10);
    for (const d of generateDemoDays(today, 45)) {
      const { date, ...input } = d;
      await journal({ ...r, method: 'PUT', path: '/api/journal/profiles/' + pid + '/days/' + date, body: { ...input, shared: false } });
    }
    return send(res, 200, { ok: true });
  }

  const out = url.pathname.startsWith('/api/core') ? await core(r) : url.pathname.startsWith('/api/journal') ? await journal(r) : { status: 404, body: { error: 'Not found' } };
  send(res, out.status, out.body);
}).listen(PORT, '127.0.0.1', () => console.log('[gravity] local API on http://127.0.0.1:' + PORT + ' (allowed: ' + ALLOWED.join(', ') + ')'));

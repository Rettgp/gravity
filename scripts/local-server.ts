/**
 * Local API for development: the same routers that run in Lambda, backed by a JSON file instead of DynamoDB.
 * Auth is a dev-only header (x-dev-user: <email>), so it must never be deployed. It only listens on localhost.
 */
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { addDays, FilePhotos, generateDemoDays, MemoryDb, normalizeEmail } from '@gravity/shared/server';
import { buildCoreRouter } from '../services/core/src/router';
import { buildJournalRouter } from '../services/journal/src/router';
import { FakeGoogle, fakeDay } from '../services/health/src/fake';
import { buildHealthRouter } from '../services/health/src/router';
import { MemoryTokens } from '../services/health/src/tokens';

const PORT = Number(process.env.PORT ?? 8787);
const FILE = process.env.GRAVITY_LOCAL_DB ?? '.gravity-local/db.json';
const ALLOWED = (process.env.LOCAL_ALLOWED_EMAILS ?? 'mom@gravity.local,dad@gravity.local,teen@gravity.local')
  .split(',')
  .map(normalizeEmail)
  .filter(Boolean);

const db = new MemoryDb(FILE);
const allowlist = async () => ALLOWED;
const core = buildCoreRouter({ db, table: 'core', allowlist });
const journal = buildJournalRouter({ db, table: 'journal', coreTable: 'core', healthTable: 'health', photos: new FilePhotos(dirname(FILE) + '/photos'), allowlist });
// No Google in local mode: the fake bounces straight back as if consent was granted, and invents believable numbers.
const health = buildHealthRouter({
  db,
  table: 'health',
  coreTable: 'core',
  allowlist,
  google: new FakeGoogle(),
  tokens: new MemoryTokens(),
  redirectOk: (uri) => /^http:\/\/localhost:\d+\/app\/health\/callback$/.test(uri),
});

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
    const demo = generateDemoDays(today, 45);
    const unwell = new Set(demo.filter((d) => d.unwell).map((d) => d.date));
    for (const d of demo) {
      const { date, ...input } = d;
      await journal({ ...r, method: 'PUT', path: '/api/journal/profiles/' + pid + '/days/' + date, body: { ...input, shared: false } });
      // Body numbers that behave like a real body: worse on unwell days, a little worse the day before. Today looks
      // off too, so the early heads-up has something to show.
      const m = fakeDay(date);
      const before = unwell.has(addDays(date, 1));
      const off = unwell.has(date) ? 1 : before ? 0.5 : date >= addDays(today, -1) ? 3.5 : 0;
      await db.put('health', {
        pk: 'PROFILE#' + pid,
        sk: 'DAY#' + date,
        ...m,
        date,
        restingHr: Math.round((m.restingHr ?? 64) + 6 * off),
        hrv: Math.max(8, Math.round(((m.hrv ?? 40) - 10 * off) * 10) / 10),
        sleepMinutes: Math.round((m.sleepMinutes ?? 420) - 50 * off),
        skinTempC: Math.round(((m.skinTempC ?? 32) + 0.3 * off) * 100) / 100,
        syncedAt: new Date().toISOString(),
      });
    }
    // A few caption-only glimmers so the dashboard card and calendar sparkles have something to show.
    const moments = ['Warm sun on the porch with coffee', 'The kids built a blanket fort', 'Dinner was done before 7 for once'];
    for (const [i, caption] of moments.entries()) {
      await journal({ ...r, method: 'POST', path: '/api/journal/profiles/' + pid + '/glimmers', body: { date: addDays(today, -i * 2), caption } });
    }
    return send(res, 200, { ok: true });
  }

  const out = url.pathname.startsWith('/api/core') ? await core(r) : url.pathname.startsWith('/api/journal') ? await journal(r) : url.pathname.startsWith('/api/health') ? await health(r) : { status: 404, body: { error: 'Not found' } };
  send(res, out.status, out.body);
}).listen(PORT, '127.0.0.1', () => console.log('[gravity] local API on http://127.0.0.1:' + PORT + ' (allowed: ' + ALLOWED.join(', ') + ')'));

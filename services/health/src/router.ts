import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  HttpError,
  addDays,
  canManage,
  createRouter,
  dateStr,
  parse,
  isAllowed,
  monthSteps,
  normalizeEmail,
  rankSteps,
  type Db,
  type HealthDay,
  type StepsLeaderboard,
  type Profile,
  type Route,
} from '@gravity/shared/server';
import type { GoogleHealth } from './google.js';
import { HISTORY_DAYS, dayKey, indexKey, linkKey, syncAll, syncProfile, toLink, type LinkItem } from './sync.js';
import type { TokenStore } from './tokens.js';

export const HEALTH_PREFIX = '/api/health';
/** A started connection must be finished within this long. */
const STATE_TTL_MS = 15 * 60_000;
const MAX_DAYS = 400;

export interface HealthDeps {
  db: Db;
  table: string;
  /** Read-only access to the core table, used to resolve profile ownership. */
  coreTable: string;
  allowlist: () => Promise<string[]>;
  google: GoogleHealth;
  tokens: TokenStore;
  /** Only these return addresses may be used for the Google sign-in (Google enforces the same list on its side). */
  redirectOk: (uri: string) => boolean;
  now?: () => Date;
}

const toDay = (it: Record<string, unknown>): HealthDay => {
  const { pk: _pk, sk: _sk, syncedAt: _s, ...rest } = it;
  return rest as unknown as HealthDay;
};

export function buildHealthRouter(deps: HealthDeps) {
  const { db, table, coreTable, allowlist, google, tokens, redirectOk } = deps;
  const now = deps.now ?? (() => new Date());
  const sync = { db, table, google, tokens, now };

  const profile = async (id: string) => {
    const it = await db.get(coreTable, `PROFILE#${id}`, 'META');
    if (!it) throw new HttpError(404, 'Profile not found');
    return it as unknown as Profile;
  };
  /** Health data is never shared with the family: only the people who manage a profile can touch it. */
  const manage = async (id: string, sub: string) => {
    const p = await profile(id);
    if (!canManage(p, sub)) throw new HttpError(404, 'Profile not found');
    return p;
  };
  const loadLink = async (pid: string) => {
    const k = linkKey(pid);
    return (await db.get(table, k.pk, k.sk)) as LinkItem | undefined;
  };

  const routes: Route[] = [
    {
      method: 'GET',
      path: '/profiles/:pid/link',
      handler: async ({ user, params }) => {
        const p = await manage(params.pid!, user.sub);
        return toLink(google.configured, await loadLink(p.id));
      },
    },
    {
      // Step 1 of connecting: hand back Google's consent URL. `state` ties the return trip to this person.
      method: 'POST',
      path: '/profiles/:pid/link/start',
      handler: async ({ user, params, body }) => {
        const p = await manage(params.pid!, user.sub);
        if (!google.configured) throw new HttpError(503, 'Google Health is not set up on this server yet');
        const problem = await google.ready();
        if (problem) throw new HttpError(503, problem);
        const { redirectUri } = parse(z.object({ redirectUri: z.string().url() }), body);
        if (!redirectOk(redirectUri)) throw new HttpError(400, 'That return address is not allowed');
        const state = randomUUID();
        await db.put(table, { pk: `OAUTHSTATE#${state}`, sk: 'META', profileId: p.id, sub: user.sub, redirectUri, createdAt: now().toISOString() });
        return { url: google.authUrl(redirectUri, state) };
      },
    },
    {
      // Step 2: Google sent the person back with a code. Swap it for a long-lived permission and store that safely.
      method: 'POST',
      path: '/link/callback',
      handler: async ({ user, body }) => {
        const { code, state } = parse(z.object({ code: z.string().min(1).max(2000), state: z.string().min(1).max(100) }), body);
        const st = await db.get(table, `OAUTHSTATE#${state}`, 'META');
        // One use only, and only by the person who started it.
        if (st) await db.delete(table, `OAUTHSTATE#${state}`, 'META');
        if (!st || st.sub !== user.sub || now().getTime() - Date.parse(String(st.createdAt)) > STATE_TTL_MS) {
          throw new HttpError(400, 'This connection attempt expired. Please start again.');
        }
        const p = await manage(String(st.profileId), user.sub);
        let refreshToken: string;
        try {
          ({ refreshToken } = await google.exchange(code, String(st.redirectUri)));
        } catch (e) {
          console.error('google code exchange failed', e);
          throw new HttpError(400, 'Google did not accept the sign-in. Please try again.');
        }
        await tokens.put(p.id, refreshToken);
        const today = now().toISOString().slice(0, 10);
        const link: LinkItem = {
          ...linkKey(p.id),
          profileId: p.id,
          ownerSub: user.sub,
          ownerEmail: user.email,
          status: 'connected',
          connectedAt: now().toISOString(),
          // The recent window is covered on every sync; history is imported backwards from just before it.
          backfillCursor: addDays(today, -3),
          backfillDone: false,
        };
        await db.put(table, link);
        await db.put(table, { ...indexKey(p.id), profileId: p.id });
        return { profileId: p.id, ...toLink(google.configured, link) };
      },
    },
    {
      // Run one sync step. The web app calls this in a loop while the first year of history is importing.
      method: 'POST',
      path: '/profiles/:pid/sync',
      handler: async ({ user, params }) => {
        const p = await manage(params.pid!, user.sub);
        if (!(await loadLink(p.id))) throw new HttpError(409, 'Google Health is not connected');
        try {
          return toLink(google.configured, await syncProfile(sync, p.id));
        } catch (e) {
          console.error('health sync failed', e);
          throw new HttpError(502, 'Could not reach Google Health. Try again in a bit.');
        }
      },
    },
    {
      method: 'GET',
      path: '/profiles/:pid/days',
      handler: async ({ user, params, query }) => {
        const p = await manage(params.pid!, user.sub);
        const to = query.to ? parse(dateStr, query.to) : now().toISOString().slice(0, 10);
        let from = query.from ? parse(dateStr, query.from) : addDays(to, -89);
        if (from < addDays(to, -(MAX_DAYS - 1))) from = addDays(to, -(MAX_DAYS - 1));
        const items = await db.query(table, `PROFILE#${p.id}`, 'DAY#');
        return items.map(toDay).filter((d) => d.date >= from && d.date <= to);
      },
    },
    {
      // The family steps challenge. This is the one place health data is shared, and it is only a monthly step total
      // per person, for people who are connected and still on the allowlist (the allowlist is the family).
      method: 'GET',
      path: '/steps/leaderboard',
      handler: async ({ query }): Promise<StepsLeaderboard> => {
        const month = query.month ? parse(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), query.month) : now().toISOString().slice(0, 7);
        const list = await allowlist();
        const people = [];
        const connected = new Set<string>();
        for (const idx of await db.query(table, 'LINKS')) {
          const pid = String(idx.profileId);
          const link = await loadLink(pid);
          if (!link || !isAllowed(link.ownerEmail, list)) continue;
          const prof = (await db.get(coreTable, `PROFILE#${pid}`, 'META')) as unknown as Profile | undefined;
          if (!prof) continue;
          connected.add(normalizeEmail(link.ownerEmail));
          const days = (await db.query(table, `PROFILE#${pid}`, 'DAY#')).map(toDay);
          people.push({ profileId: pid, name: prof.name, color: prof.color, ...(prof.picture ? { picture: prof.picture } : {}), steps: monthSteps(days, month) });
        }
        const waiting = list.filter((e) => !connected.has(normalizeEmail(e))).map((e) => normalizeEmail(e).split('@')[0]!);
        return { month, entries: rankSteps(people), waiting };
      },
    },
    {
      // Disconnect: revoke at Google, forget the permission, and delete every imported day.
      method: 'DELETE',
      path: '/profiles/:pid/link',
      handler: async ({ user, params }) => {
        const p = await manage(params.pid!, user.sub);
        const refresh = await tokens.get(p.id);
        if (refresh) await google.revoke(refresh).catch((e) => console.error('google revoke failed', e));
        await tokens.delete(p.id);
        const lk = linkKey(p.id);
        await db.delete(table, lk.pk, lk.sk);
        const ix = indexKey(p.id);
        await db.delete(table, ix.pk, ix.sk);
        for (const it of await db.query(table, `PROFILE#${p.id}`, 'DAY#')) await db.delete(table, it.pk, it.sk);
        return { status: 204 };
      },
    },
  ];

  const router = createRouter({ prefix: HEALTH_PREFIX, routes, allowlist });
  return Object.assign(router, {
    /** Scheduled entry point (EventBridge), not reachable over HTTP. */
    syncAll: () => syncAll(sync, allowlist),
  });
}

export { HISTORY_DAYS, dayKey };

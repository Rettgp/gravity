import { addDays, isAllowed, type DayMap, type Db, type HealthLink } from '@gravity/shared/server';
import { ReauthError, type GoogleHealth } from './google.js';
import type { TokenStore } from './tokens.js';

/** How far back the first import goes. */
export const HISTORY_DAYS = 365;
/** Every sync re-reads this many recent days: watches upload late, and re-writing a day is harmless. */
export const RECENT_DAYS = 3;
/** History is imported this many days per request, so each call stays well inside the API time limit. */
export const CHUNK_DAYS = 90;

export interface SyncDeps {
  db: Db;
  table: string;
  google: GoogleHealth;
  tokens: TokenStore;
  now: () => Date;
}

export type LinkItem = {
  pk: string;
  sk: string;
  profileId: string;
  ownerSub: string;
  ownerEmail: string;
  status: 'connected' | 'reauth';
  connectedAt: string;
  lastSyncAt?: string;
  lastError?: string;
  /** Oldest day imported so far. */
  backfillCursor: string;
  backfillDone: boolean;
};

export const dayKey = (pid: string, date: string) => ({ pk: `PROFILE#${pid}`, sk: `DAY#${date}` });
export const linkKey = (pid: string) => ({ pk: `PROFILE#${pid}`, sk: 'LINK#google' });
export const indexKey = (pid: string) => ({ pk: 'LINKS', sk: `google#${pid}` });

export const toLink = (configured: boolean, item?: LinkItem): HealthLink => ({
  configured,
  connected: !!item && item.status === 'connected',
  needsReconnect: item?.status === 'reauth',
  connectedAt: item?.connectedAt,
  lastSyncAt: item?.lastSyncAt,
  lastError: item?.lastError,
  backfillDone: item?.backfillDone ?? false,
  historyFrom: item?.backfillCursor,
});

const same = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

async function store(d: SyncDeps, pid: string, days: DayMap) {
  const syncedAt = d.now().toISOString();
  for (const [date, metrics] of days) {
    const key = dayKey(pid, date);
    const existing = await d.db.get(d.table, key.pk, key.sk);
    const { pk: _pk, sk: _sk, date: _date, syncedAt: _syncedAt, ...old } = (existing ?? {}) as Record<string, unknown>;
    const merged = { ...old, ...metrics };
    if (existing && same(old, merged)) continue;
    await d.db.put(d.table, { ...key, ...merged, date, syncedAt });
  }
}

/**
 * One sync step for one person: refresh the last few days, then import one chunk of older history if the first
 * import is not finished yet. Safe to call repeatedly (the web app loops on it while history loads).
 */
export async function syncProfile(d: SyncDeps, pid: string): Promise<LinkItem> {
  const key = linkKey(pid);
  const link = (await d.db.get(d.table, key.pk, key.sk)) as LinkItem | undefined;
  if (!link) throw new Error('Not connected');
  if (link.status === 'reauth') return link;
  const save = async (patch: Partial<LinkItem>) => {
    const next = { ...link, ...patch } as LinkItem;
    if (patch.lastError === undefined && 'lastError' in patch) delete next.lastError;
    await d.db.put(d.table, next);
    return next;
  };

  const refresh = await d.tokens.get(pid);
  if (!refresh) return save({ status: 'reauth', lastError: 'Saved Google permission is missing' });
  let access: string;
  try {
    access = await d.google.accessToken(refresh);
  } catch (e) {
    if (e instanceof ReauthError) return save({ status: 'reauth', lastError: 'Google access expired or was removed' });
    throw e;
  }

  try {
    const today = d.now().toISOString().slice(0, 10);
    const errors: string[] = [];
    const recent = await d.google.fetchDays(access, addDays(today, -RECENT_DAYS), addDays(today, 1));
    await store(d, pid, recent.days);
    errors.push(...recent.errors);

    let { backfillCursor: cursor, backfillDone: done } = link;
    if (!done) {
      const horizon = addDays(today, -HISTORY_DAYS);
      const from = addDays(cursor, -CHUNK_DAYS) > horizon ? addDays(cursor, -CHUNK_DAYS) : horizon;
      if (from < cursor) {
        const r = await d.google.fetchDays(access, from, cursor);
        // If every data type failed, do not advance: the same range is retried next time instead of silently skipped.
        if (r.errors.length >= r.attempted) throw new Error(r.errors[0] ?? 'Google Health is unavailable');
        await store(d, pid, r.days);
        errors.push(...r.errors);
        cursor = from;
      }
      done = cursor <= horizon;
    }
    return await save({
      lastSyncAt: d.now().toISOString(),
      lastError: errors.length ? errors.join('; ').slice(0, 300) : undefined,
      backfillCursor: cursor,
      backfillDone: done,
    });
  } catch (e) {
    if (e instanceof ReauthError) return save({ status: 'reauth', lastError: 'Google access expired or was removed' });
    await save({ lastError: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    throw e;
  }
}

/** Scheduled run: every connected person, skipping anyone who is no longer on the family allowlist. */
export async function syncAll(d: SyncDeps, allowlist: () => Promise<string[]>) {
  const out = { synced: 0, skipped: 0, failed: 0 };
  const list = await allowlist();
  for (const idx of await d.db.query(d.table, 'LINKS')) {
    const pid = String(idx.profileId);
    const key = linkKey(pid);
    const link = (await d.db.get(d.table, key.pk, key.sk)) as LinkItem | undefined;
    if (!link || link.status !== 'connected' || !isAllowed(link.ownerEmail, list)) {
      out.skipped += 1;
      continue;
    }
    try {
      await syncProfile(d, pid);
      out.synced += 1;
    } catch (e) {
      console.error('health sync failed for', pid, e);
      out.failed += 1;
    }
  }
  return out;
}

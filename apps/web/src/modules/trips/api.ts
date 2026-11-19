import { useCallback, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { dayKey, type TripMeta } from '@gravity/shared';
import { ApiError, useFetcher, type Fetcher } from '../../lib/api';
import { mergeSections, retryDelay } from './logic';

export interface SectionState<T = unknown> {
  rev: number;
  data: T;
}
export interface TripDoc {
  meta: TripMeta;
  sections: Record<string, SectionState>;
}

export const tripsKey = ['trips'] as const;
const tripKey = (id: string) => ['trip', id] as const;

// ---- Notices (small, non-blocking) --------------------------------------------------------------------------------
let notice: { kind: 'info' | 'error'; text: string } | null = null;
const listeners = new Set<() => void>();
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
export function say(kind: 'info' | 'error', text: string) {
  notice = { kind, text };
  listeners.forEach((l) => l());
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => say.clear(), 6000);
}
say.clear = () => {
  notice = null;
  listeners.forEach((l) => l());
};
export const useNotice = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => notice,
  );

// ---- Queries ------------------------------------------------------------------------------------------------------
export function useTrips() {
  const f = useFetcher();
  return useQuery({ queryKey: tripsKey, queryFn: () => f<TripMeta[]>('/api/trips') });
}

/** Sections with an edit not yet confirmed by the server; a refetch must not overwrite them. */
const writers = new Map<string, Writer>();
interface Writer {
  timer?: ReturnType<typeof setTimeout>;
  dirty: boolean;
  inflight: boolean;
  saved?: SectionState;
  fails: number;
  retry?: ReturnType<typeof setTimeout>;
  run?: () => void;
}
const busy = (id: string, key: string) => {
  const w = writers.get(id + '/' + key);
  return !!w && (w.dirty || w.inflight || !!w.timer);
};
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if ([...writers.keys()].some((k) => busy(...(k.split('/') as [string, string])))) e.preventDefault();
  });
  window.addEventListener('online', () => writers.forEach((w) => w.dirty && w.fails && w.run?.()));
}

export function useTrip(id: string) {
  const f = useFetcher();
  const qc = useQueryClient();
  return useQuery({
    queryKey: tripKey(id),
    queryFn: async () => {
      const fresh = await f<TripDoc>('/api/trips/' + id);
      const old = qc.getQueryData<TripDoc>(tripKey(id));
      return { ...fresh, sections: mergeSections(old?.sections, fresh.sections, (k) => busy(id, k)) };
    },
    refetchInterval: () => (document.visibilityState === 'visible' ? 20_000 : false),
  });
}

// ---- Section writes -----------------------------------------------------------------------------------------------
async function flush(f: Fetcher, qc: QueryClient, id: string, key: string) {
  const w = writers.get(id + '/' + key)!;
  clearTimeout(w.timer);
  clearTimeout(w.retry);
  w.timer = w.retry = undefined;
  w.run = () => void flush(f, qc, id, key);
  if (w.inflight) return; // the running loop picks up the newer data when it finishes
  w.inflight = true;
  const setSection = (s: SectionState) => qc.setQueryData<TripDoc>(tripKey(id), (d) => d && { ...d, sections: { ...d.sections, [key]: s } });
  try {
    while (w.dirty) {
      w.dirty = false;
      const cur = qc.getQueryData<TripDoc>(tripKey(id))?.sections[key];
      if (!cur) break;
      try {
        const { rev } = await f<{ rev: number }>(`/api/trips/${id}/sections/${key}`, { method: 'PUT', body: { rev: cur.rev, data: cur.data } });
        w.saved = { rev, data: cur.data };
        if (w.fails) say.clear();
        w.fails = 0;
        // Keep whatever was typed meanwhile; only the revision moves.
        const now = qc.getQueryData<TripDoc>(tripKey(id))?.sections[key];
        if (now) setSection({ rev, data: now.data });
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          try {
            // The fetcher drops the body of a 409, so take the server's copy with a plain refetch.
            const fresh = (await f<TripDoc>('/api/trips/' + id)).sections[key];
            w.dirty = false;
            if (fresh) {
              w.saved = fresh;
              setSection(fresh);
            }
            say('info', 'Updated on another device');
            break;
          } catch {
            /* refetch failed too: treated as any other failure below */
          }
        }
        // Offline or 5xx: keep what was typed, stay dirty, retry with backoff (and on `online`).
        w.dirty = true;
        if (!w.fails++) say('error', 'Not saved yet; will retry');
        w.retry = setTimeout(() => w.run?.(), retryDelay(w.fails));
        break;
      }
    }
  } finally {
    w.inflight = false;
  }
}

/** One section of a trip. `edit` changes it locally at once; the save is coalesced, one request in flight per section. */
export function useSection<T>(id: string, key: string) {
  const f = useFetcher();
  const qc = useQueryClient();
  const trip = useTrip(id);
  const s = trip.data?.sections[key] as SectionState<T> | undefined;
  const wkey = id + '/' + key;
  const writer = () => {
    let w = writers.get(wkey);
    if (!w) writers.set(wkey, (w = { dirty: false, inflight: false, fails: 0 }));
    return w;
  };
  /** how 'now' saves immediately (checkboxes, structure); 'text' waits for a 600 ms pause or commit(). */
  const edit = useCallback(
    (fn: (draft: T) => void, how: 'now' | 'text' = 'now') => {
      const cur = qc.getQueryData<TripDoc>(tripKey(id))?.sections[key];
      if (!cur) return;
      const data = structuredClone(cur.data) as T;
      fn(data);
      const w = writer();
      w.saved ??= cur;
      w.dirty = true;
      qc.setQueryData<TripDoc>(tripKey(id), (d) => d && { ...d, sections: { ...d.sections, [key]: { rev: cur.rev, data } } });
      clearTimeout(w.timer);
      if (how === 'now') void flush(f, qc, id, key);
      else w.timer = setTimeout(() => void flush(f, qc, id, key), 600);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f, qc, id, key],
  );
  const commit = useCallback(() => {
    const w = writers.get(wkey);
    if (w?.dirty) void flush(f, qc, id, key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, qc, id, key]);
  return { data: s?.data, edit, commit, loading: trip.isLoading, ready: !!s };
}

export const useDay = (id: string, date: string) => useSection<import('@gravity/shared').DaySection>(id, dayKey(date));

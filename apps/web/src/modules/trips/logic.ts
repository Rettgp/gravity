import type { DaySection, Row, TripMeta } from '@gravity/shared';

// ---- Rich text ------------------------------------------------------------------------------------------------
export type RichToken = { t: 'text'; v: string } | { t: 'bold'; v: string } | { t: 'link'; label: string; href: string };

/** Only these schemes are ever rendered as links; anything else shows as its label. */
export const safeHref = (href: string) => /^(https:\/\/|tel:|mailto:)/.test(href);

/** Splits `**bold**` and `[label](url)` into tokens. Never produces HTML. */
export function tokenizeRich(s: string): RichToken[] {
  const out: RichToken[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]*)\)/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: 'bold', v: m[1] });
    else if (safeHref(m[3]!)) out.push({ t: 'link', label: m[2]!, href: m[3]! });
    else out.push({ t: 'text', v: m[2]! });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}

// ---- Dates ----------------------------------------------------------------------------------------------------
const utcDay = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
/** Whole calendar days from a to b (YYYY-MM-DD), negative when b is earlier. Safe across months and years. */
export const daysBetween = (a: string, b: string) => Math.round((utcDay(b) - utcDay(a)) / 86_400_000);
export const shortDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const longDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
export const rangeLabel = (m: Pick<TripMeta, 'startDate' | 'endDate'>) =>
  m.startDate === m.endDate ? shortDate(m.startDate) : shortDate(m.startDate) + ' to ' + shortDate(m.endDate);
export const tripLength = (m: Pick<TripMeta, 'startDate' | 'endDate'>) => daysBetween(m.startDate, m.endDate) + 1;

// ---- Trip grouping --------------------------------------------------------------------------------------------
export function groupTrips(trips: TripMeta[], today: string) {
  const now = trips.filter((t) => t.startDate <= today && today <= t.endDate);
  const upcoming = trips.filter((t) => t.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = trips.filter((t) => t.endDate < today).sort((a, b) => b.startDate.localeCompare(a.startDate));
  return { now, upcoming, past };
}

/** The line on a trip card: a countdown, "Day X of Y" or "Completed". */
export function tripWhen(m: TripMeta, today: string) {
  if (today > m.endDate) return 'Completed';
  if (today >= m.startDate) return `Day ${daysBetween(m.startDate, today) + 1} of ${tripLength(m)}`;
  const d = daysBetween(today, m.startDate);
  return d === 1 ? 'Tomorrow' : `In ${d} days`;
}

// ---- What's next ----------------------------------------------------------------------------------------------
export interface TimedEvent {
  date: string;
  title: string;
  time: string;
  start: number;
  end: number;
}
export type Next =
  | { kind: 'before'; days: number; todo: Row[] }
  | { kind: 'during'; date: string; current?: TimedEvent; next?: TimedEvent }
  | { kind: 'after' };

/** shortcut: times are read in the device's timezone, not meta.tz; revisit if the family travels across zones with the app open. */
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00`).getTime();
const parseStamp = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? new Date(s + ':00').getTime() : undefined);

export function timedEvents(days: Record<string, DaySection | undefined>): TimedEvent[] {
  const out: TimedEvent[] = [];
  for (const date of Object.keys(days).sort()) {
    for (const e of days[date]?.events ?? []) {
      if (!e.at) continue;
      const start = at(date, e.at);
      out.push({ date, title: e.title, time: e.time, start, end: e.until ? at(date, e.until) : start });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function whatsNext(meta: TripMeta, days: Record<string, DaySection | undefined>, tbd: Row[], now: Date): Next {
  const t = now.getTime();
  const begin = parseStamp(meta.checkIn) ?? at(meta.startDate, '00:00');
  const finish = parseStamp(meta.checkOut) ?? at(meta.endDate, '23:59');
  if (t < begin) {
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const d = Math.max(0, daysBetween(today, meta.startDate));
    return { kind: 'before', days: d, todo: d <= 7 ? tbd : [] };
  }
  if (t > finish) return { kind: 'after' };
  const evs = timedEvents(days);
  const current = evs.find((e) => t >= e.start && t <= e.end);
  const next = evs.find((e) => e.start > t);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const date = (current ?? next)?.date ?? (today < meta.startDate ? meta.startDate : today > meta.endDate ? meta.endDate : today);
  return { kind: 'during', date, current, next: current ? undefined : next };
}

// ---- Money ----------------------------------------------------------------------------------------------------
export const parseAmount = (s: string) => {
  const n = parseFloat(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
export const formatMoney = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
export const newId = () => Math.random().toString(36).slice(2, 10);

// ---- Section sync -----------------------------------------------------------------------------------------------
/** A refetch result merged over the cache: an unsaved section, or one whose cached rev is newer (a save landed while the GET was in flight), keeps the cached copy. */
export function mergeSections<S extends { rev: number }>(cached: Record<string, S> | undefined, fresh: Record<string, S>, busy: (key: string) => boolean): Record<string, S> {
  const out = { ...fresh };
  for (const [k, c] of Object.entries(cached ?? {})) if (k in fresh && (busy(k) || fresh[k]!.rev < c.rev)) out[k] = c;
  return out;
}

/** Wait before retry number `fails` (1-based) of a failed save: 2 s, 5 s, 15 s, then every 30 s. */
export const retryDelay = (fails: number) => [2000, 5000, 15000][fails - 1] ?? 30000;

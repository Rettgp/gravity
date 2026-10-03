import { addDays } from './dates.js';

/** One person's health numbers for one calendar day. Every field is optional: days and devices have gaps. */
export interface HealthMetrics {
  steps?: number;
  /** Resting heart rate, bpm. */
  restingHr?: number;
  /** Heart rate variability (RMSSD during deep sleep), ms. */
  hrv?: number;
  /** Average overnight blood oxygen, %. */
  spo2?: number;
  spo2Low?: number;
  /** Nightly wrist skin temperature, degrees C. */
  skinTempC?: number;
  /** Nightly skin temperature relative to Fitbit's own baseline, degrees C (needs ~3 nights of wear). */
  skinTempDelta?: number;
  /** Breaths per minute during sleep. */
  breathing?: number;
  /** Minutes actually asleep (naps excluded). */
  sleepMinutes?: number;
  sleepDeepMin?: number;
  sleepLightMin?: number;
  sleepRemMin?: number;
  sleepAwakeMin?: number;
  /** Local clock time (HH:MM) the main sleep started and ended. */
  bedtime?: string;
  wakeTime?: string;
}
export type HealthMetricKey = keyof HealthMetrics;
export type HealthDay = HealthMetrics & { date: string };

export interface HealthLink {
  /** False when the server has no Google client configured (nothing can be connected). */
  configured: boolean;
  connected: boolean;
  /** Google stopped honouring the saved permission: the person must connect again. */
  needsReconnect: boolean;
  connectedAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  /** True once the first year of history has been imported. */
  backfillDone: boolean;
  /** Oldest date imported so far; drives the progress bar while history loads. */
  historyFrom?: string;
}

// ---- Parsing the Google Health API ----------------------------------------------------------------------------
// The API returns int64 values as strings ("73") and missing values as the string "NaN". Days with no data are simply
// absent. Everything below is pure so it can be tested against recorded responses.

export type DayMap = Map<string, HealthMetrics>;

/** A finite number from a number or numeric string; undefined for "NaN", null, empty, or junk. */
export function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** {year, month, day} -> YYYY-MM-DD */
export function civilDate(d: unknown): string | undefined {
  const o = d as { year?: unknown; month?: unknown; day?: unknown } | undefined;
  const y = num(o?.year);
  const m = num(o?.month);
  const day = num(o?.day);
  if (y === undefined || m === undefined || day === undefined) return undefined;
  return `${y}-${pad(m)}-${pad(day)}`;
}

const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;

function put(map: DayMap, date: string | undefined, patch: HealthMetrics) {
  if (!date) return;
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as HealthMetrics;
  if (Object.keys(clean).length === 0) return;
  map.set(date, { ...map.get(date), ...clean });
}

type Points = { dataPoints?: Record<string, unknown>[] } | undefined;

export function parseStepsRollup(json: unknown): DayMap {
  const out: DayMap = new Map();
  const roll = (json as { rollupDataPoints?: Record<string, any>[] } | undefined)?.rollupDataPoints ?? [];
  for (const p of roll) put(out, civilDate(p.civilStartTime?.date), { steps: num(p.steps?.countSum) });
  return out;
}

function parseDaily(json: unknown, key: string, read: (v: Record<string, any>) => HealthMetrics): DayMap {
  const out: DayMap = new Map();
  for (const p of (json as Points)?.dataPoints ?? []) {
    const v = p[key] as Record<string, any> | undefined;
    if (v) put(out, civilDate(v.date), read(v));
  }
  return out;
}

export const parseHrv = (json: unknown) =>
  parseDaily(json, 'dailyHeartRateVariability', (v) => ({ hrv: num(v.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds) }));
export const parseRestingHr = (json: unknown) => parseDaily(json, 'dailyRestingHeartRate', (v) => ({ restingHr: num(v.beatsPerMinute) }));
export const parseSpo2 = (json: unknown) =>
  parseDaily(json, 'dailyOxygenSaturation', (v) => ({ spo2: num(v.averagePercentage), spo2Low: num(v.lowerBoundPercentage) }));
export const parseBreathing = (json: unknown) => parseDaily(json, 'dailyRespiratoryRate', (v) => ({ breathing: num(v.breathsPerMinute) }));
export const parseSkinTemp = (json: unknown) =>
  parseDaily(json, 'dailySleepTemperatureDerivations', (v) => {
    const nightly = num(v.nightlyTemperatureCelsius);
    const baseline = num(v.baselineTemperatureCelsius);
    return {
      skinTempC: nightly === undefined ? undefined : round(nightly, 2),
      skinTempDelta: nightly !== undefined && baseline !== undefined ? round(nightly - baseline, 2) : undefined,
    };
  });

interface SleepSession {
  date: string;
  startMs: number;
  endMs: number;
  asleep: number;
  awake: number;
  deep: number;
  light: number;
  rem: number;
  staged: boolean;
  bedtime: string;
  wakeTime: string;
  periodMinutes: number;
}

const offsetMs = (s: unknown) => (num(String(s ?? '').replace(/s$/, '')) ?? 0) * 1000;
const localIso = (utcMs: number, offset: number) => new Date(utcMs + offset).toISOString();

function toSession(p: Record<string, any>): SleepSession | undefined {
  const s = p.sleep as Record<string, any> | undefined;
  const start = Date.parse(s?.interval?.startTime ?? '');
  const end = Date.parse(s?.interval?.endTime ?? '');
  if (!s || Number.isNaN(start) || Number.isNaN(end)) return undefined;
  // A nap Google flagged as such (and not also as a main sleep) is not "last night".
  if (s.metadata?.nap === true && s.metadata?.mainSleep !== true) return undefined;
  const endLocal = localIso(end, offsetMs(s.interval?.endUtcOffset));
  const startLocal = localIso(start, offsetMs(s.interval?.startUtcOffset));
  const stage = (type: string) => {
    const row = ((s.summary?.stagesSummary ?? []) as Record<string, unknown>[]).find((r) => r.type === type);
    return num(row?.minutes) ?? 0;
  };
  const staged = s.type === 'STAGES';
  return {
    // Sleep belongs to the day you woke up.
    date: endLocal.slice(0, 10),
    startMs: start,
    endMs: end,
    asleep: num(s.summary?.minutesAsleep) ?? 0,
    awake: num(s.summary?.minutesAwake) ?? 0,
    deep: staged ? stage('DEEP') : 0,
    light: staged ? stage('LIGHT') : 0,
    rem: staged ? stage('REM') : 0,
    staged,
    bedtime: startLocal.slice(11, 16),
    wakeTime: endLocal.slice(11, 16),
    periodMinutes: num(s.summary?.minutesInSleepPeriod) ?? Math.round((end - start) / 60000),
  };
}

/** The local calendar day a sleep record belongs to (used to decide when paging can stop early). */
export const sleepDate = (p: Record<string, unknown>) => toSession(p)?.date;

/**
 * Sleep sessions -> one entry per wake-up day. Overlapping sessions (the same night reported by two sources) count
 * once: the one with sleep stages, then the longer one, wins.
 */
export function parseSleep(json: unknown): DayMap {
  const sessions = ((json as Points)?.dataPoints ?? []).map(toSession).filter((s): s is SleepSession => !!s);
  const score = (s: SleepSession) => (s.staged ? 100_000 : 0) + s.asleep;
  const kept: SleepSession[] = [];
  for (const s of [...sessions].sort((a, b) => score(b) - score(a))) {
    if (!kept.some((k) => s.startMs < k.endMs && k.startMs < s.endMs)) kept.push(s);
  }
  const byDate = new Map<string, SleepSession[]>();
  for (const s of kept) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const out: DayMap = new Map();
  for (const [date, list] of byDate) {
    const sum = (f: (s: SleepSession) => number) => list.reduce((a, s) => a + f(s), 0);
    const main = [...list].sort((a, b) => b.periodMinutes - a.periodMinutes)[0]!;
    const staged = sum((s) => (s.staged ? 1 : 0)) > 0;
    put(out, date, {
      sleepMinutes: sum((s) => s.asleep),
      sleepAwakeMin: sum((s) => s.awake),
      sleepDeepMin: staged ? sum((s) => s.deep) : undefined,
      sleepLightMin: staged ? sum((s) => s.light) : undefined,
      sleepRemMin: staged ? sum((s) => s.rem) : undefined,
      bedtime: main.bedtime,
      wakeTime: main.wakeTime,
    });
  }
  return out;
}

/** Merge `from` into `into`, newer values winning per field. */
export function mergeDays(into: DayMap, from: DayMap): DayMap {
  for (const [date, m] of from) into.set(date, { ...into.get(date), ...m });
  return into;
}

/** Keep only dates in [from, to). */
export function withinRange(days: DayMap, from: string, to: string): DayMap {
  return new Map([...days].filter(([d]) => d >= from && d < to));
}

// ---- Comparing to your own normal -----------------------------------------------------------------------------------

export interface Baseline {
  /** Mean of the most recent `recent` days that have data. */
  recent: number;
  /** Mean of the earlier days used as "your usual". */
  usual: number;
  /** recent - usual */
  diff: number;
}

/**
 * Compare the last week with the weeks before it. `series` is ordered oldest -> newest, one entry per calendar day
 * (undefined = no data). Needs at least 3 recent and 7 earlier points, otherwise there is nothing honest to say.
 */
export function compareToUsual(series: (number | undefined)[], recentDays = 7, usualDays = 28): Baseline | undefined {
  const have = (xs: (number | undefined)[]) => xs.filter((x): x is number => x !== undefined);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const recent = have(series.slice(-recentDays));
  const usual = have(series.slice(-(recentDays + usualDays), -recentDays));
  if (recent.length < 3 || usual.length < 7) return undefined;
  const r = mean(recent);
  const u = mean(usual);
  return { recent: r, usual: u, diff: r - u };
}

/** Dense day list [from, to] inclusive -> one value per day for a metric (undefined where missing). */
export function seriesFor(days: HealthDay[], key: HealthMetricKey, from: string, to: string): (number | undefined)[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: (number | undefined)[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const v = byDate.get(d)?.[key];
    out.push(typeof v === 'number' ? v : undefined);
  }
  return out;
}

// ---- Family steps challenge ------------------------------------------------------------------------------------
// Health data is private to its owner, with one deliberate exception: each person's monthly step total is shown to the
// rest of the (allowlisted) family on the podium. Nothing else about a person's health leaves their profile.

export interface StepsEntry {
  profileId: string;
  name: string;
  color: string;
  picture?: string;
  steps: number;
  /** 1 for the winner. People with the same total share a rank. */
  rank: number;
}
export interface StepsLeaderboard {
  /** YYYY-MM */
  month: string;
  entries: StepsEntry[];
  /** Family members who have not connected Google Health yet, so they are not on the podium. */
  waiting: string[];
}

/** Sum the steps for one month (YYYY-MM) from a person's stored days. */
export function monthSteps(days: { date: string; steps?: number }[], month: string): number {
  let total = 0;
  for (const d of days) if (d.date.startsWith(month + '-') && typeof d.steps === 'number') total += d.steps;
  return Math.round(total);
}

/** Highest first; ties keep the same rank (1, 1, 3) and are ordered by name so the list never jumps around. */
export function rankSteps(people: { profileId: string; name: string; color: string; picture?: string; steps: number }[]): StepsEntry[] {
  const sorted = [...people].sort((a, b) => b.steps - a.steps || a.name.localeCompare(b.name));
  const out: StepsEntry[] = [];
  sorted.forEach((p, i) => out.push({ ...p, rank: i > 0 && out[i - 1]!.steps === p.steps ? out[i - 1]!.rank : i + 1 }));
  return out;
}

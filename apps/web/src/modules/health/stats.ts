import { addDays, toUtc, type HealthDay, type HealthMetricKey } from '@gravity/shared';

export interface Point {
  date: string;
  value: number;
}

/** A metric's values for [from, to], oldest first, skipping days with no number. */
export function pointsOf(days: HealthDay[], key: HealthMetricKey, from: string, to: string): Point[] {
  return days
    .filter((d) => d.date >= from && d.date <= to && typeof d[key] === 'number')
    .map((d) => ({ date: d.date, value: d[key] as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
export const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** Days from `from` to `to`, inclusive. */
export const daySpan = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / 86_400_000) + 1;

export interface Usual {
  mean: number;
  sd: number;
  n: number;
}

/** What "normal" looks like right now: the 28 days before the most recent 7. Needs at least a week of data. */
export function usualOf(points: Point[], to: string): Usual | undefined {
  const from = addDays(to, -34);
  const end = addDays(to, -7);
  const xs = points.filter((p) => p.date >= from && p.date <= end).map((p) => p.value);
  return xs.length < 7 ? undefined : { mean: mean(xs), sd: sd(xs), n: xs.length };
}

/** Average of the points in [from, to]; undefined unless there are at least `min` of them. */
export function avgOver(points: Point[], from: string, to: string, min: number): number | undefined {
  const xs = points.filter((p) => p.date >= from && p.date <= to).map((p) => p.value);
  return xs.length >= min ? mean(xs) : undefined;
}

export interface Summary {
  latest?: Point;
  avg7?: number;
  avg30?: number;
  min?: Point;
  max?: Point;
  usual?: Usual;
  /** avg7 minus the usual mean. */
  diff?: number;
  /** Days with a number in the chosen range, out of `span`. */
  count: number;
  span: number;
}

/** `all` = everything loaded (for the baseline), `range` = just the visible window (for min/max/count). */
export function summarize(all: Point[], range: Point[], to: string, span: number): Summary {
  const usual = usualOf(all, to);
  const avg7 = avgOver(all, addDays(to, -6), to, 3);
  const latest = all.length ? all[all.length - 1] : undefined;
  let min: Point | undefined;
  let max: Point | undefined;
  for (const p of range) {
    if (!min || p.value < min.value) min = p;
    if (!max || p.value > max.value) max = p;
  }
  return {
    latest,
    avg7,
    avg30: avgOver(all, addDays(to, -29), to, 7),
    min,
    max,
    usual,
    diff: usual && avg7 !== undefined ? avg7 - usual.mean : undefined,
    count: range.length,
    span,
  };
}

export interface UnwellSplit {
  unwellDays: number;
  unwellMean: number;
  otherDays: number;
  otherMean: number;
}

/** How this number looked on days logged as unwell vs the rest. Only when both sides have at least 3 days. */
export function unwellSplit(points: Point[], unwell: Set<string>): UnwellSplit | undefined {
  const u = points.filter((p) => unwell.has(p.date)).map((p) => p.value);
  const o = points.filter((p) => !unwell.has(p.date)).map((p) => p.value);
  return u.length >= 3 && o.length >= 3 ? { unwellDays: u.length, unwellMean: mean(u), otherDays: o.length, otherMean: mean(o) } : undefined;
}

/** Gridline spacings that make sense for hours: never 2.5h or 1.5h. */
export const HOUR_STEPS = [1, 2, 3, 4, 6, 12, 24];

/** Round-number gridlines. Returns ticks plus the domain widened to whole ticks. `steps` overrides the 1-2-2.5-5 pattern. */
export function niceTicks(lo: number, hi: number, target = 5, steps?: number[]): { ticks: number[]; min: number; max: number } {
  if (!(hi > lo)) {
    lo -= 1;
    hi += 1;
  }
  const raw = (hi - lo) / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = steps ? (steps.find((s) => s >= raw) ?? steps[steps.length - 1]!) : (([1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow) as number);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step / 1000; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return { ticks, min, max };
}

/** Months (YYYY-MM) touched by [from, to]. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key >= end) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

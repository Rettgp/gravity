import { addDays } from './dates.js';
import type { HealthDay, HealthMetricKey } from './health.js';
import { foodsOf } from './insights.js';
import type { Day } from './schemas.js';

/** How each tracked number is shown and what "worse" means. Shared so the API text and the UI agree. */
export const METRIC_INFO: Partial<Record<HealthMetricKey, { label: string; unit: string; digits: number; worse: 'higher' | 'lower' | 'either' }>> = {
  restingHr: { label: 'Resting heart rate', unit: 'bpm', digits: 0, worse: 'higher' },
  hrv: { label: 'Heart rate variability', unit: 'ms', digits: 0, worse: 'lower' },
  sleepMinutes: { label: 'Sleep', unit: 'min', digits: 0, worse: 'lower' },
  skinTempC: { label: 'Skin temperature', unit: '°C', digits: 1, worse: 'higher' },
  breathing: { label: 'Breathing rate', unit: '/min', digits: 1, worse: 'higher' },
  spo2: { label: 'Blood oxygen', unit: '%', digits: 1, worse: 'lower' },
  steps: { label: 'Steps', unit: '', digits: 0, worse: 'lower' },
};
const KEYS = Object.keys(METRIC_INFO) as HealthMetricKey[];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

export interface BodySignal {
  key: HealthMetricKey;
  /** Unwell days that have a value for this metric. */
  unwellDays: number;
  wellDays: number;
  unwellMean: number;
  wellMean: number;
  diff: number;
  /** diff measured in "how much you normally vary day to day" (standard deviations of well days). */
  effect: number;
  /** On how many of the unwell days the value sat on the same side of the well average as the overall difference. */
  consistent: number;
  /** The day before an unwell day (only days where the day before was not itself unwell). */
  dayBefore?: { days: number; mean: number; diff: number; effect: number };
}

export interface FoodBodyEffect {
  food: string;
  key: HealthMetricKey;
  /** Days this food was eaten AND the next morning's number exists. */
  exposedDays: number;
  mean: number;
  baseline: number;
  diff: number;
  effect: number;
}

export interface BodySignals {
  /** Health days available / unwell days with any body data: lets the UI say how far along it is. */
  coverage: { healthDays: number; unwellDaysWithData: number };
  signals: BodySignal[];
  foods: FoodBodyEffect[];
}

export interface BodyOptions {
  /** Fewest unwell days with data before a signal is reported. */
  minUnwell?: number;
  minWell?: number;
  /** Smallest difference (in day-to-day standard deviations) worth mentioning. */
  minEffect?: number;
  /** Share of unwell days that must sit on the same side of normal as the average difference (0-1). */
  minConsistent?: number;
  minFoodDays?: number;
  minFoodEffect?: number;
}

const FOOD_KEYS: HealthMetricKey[] = ['hrv', 'sleepMinutes', 'restingHr'];

/**
 * Do unwell days (or the day before them) look different in the body numbers? Explainable statistics, no ML:
 * compare against the person's own well days, and only report a difference when there are enough unwell days and the
 * gap is bigger than their usual day-to-day wobble. Also asks which foods precede a worse next morning.
 */
export function computeBodySignals(journal: Day[], health: HealthDay[], opts: BodyOptions = {}): BodySignals {
  const { minUnwell = 4, minWell = 7, minEffect = 0.5, minConsistent = 0.65, minFoodDays = 5, minFoodEffect = 0.7 } = opts;
  const hByDate = new Map(health.map((h) => [h.date, h]));
  const jByDate = new Map(journal.map((d) => [d.date, d]));
  const logged = journal.filter((d) => d.unwell || d.symptoms.length > 0 || foodsOf(d).length > 0);
  const unwell = logged.filter((d) => d.unwell);
  const well = logged.filter((d) => !d.unwell);
  const val = (date: string, key: HealthMetricKey) => {
    const v = hByDate.get(date)?.[key];
    return typeof v === 'number' ? v : undefined;
  };
  const have = (xs: (number | undefined)[]) => xs.filter((x): x is number => x !== undefined);

  const signals: BodySignal[] = [];
  for (const key of KEYS) {
    const u = have(unwell.map((d) => val(d.date, key)));
    const w = have(well.map((d) => val(d.date, key)));
    if (u.length < minUnwell || w.length < minWell) continue;
    const spread = sd(w);
    if (spread < 1e-9) continue;
    const wellMean = mean(w);
    const diff = mean(u) - wellMean;
    const effect = diff / spread;
    if (Math.abs(effect) < minEffect) continue;
    const consistent = u.filter((x) => (x - wellMean) * diff > 0).length;
    // An average can be dragged by a few extreme days; only report it if most unwell days really point that way.
    if (consistent / u.length < minConsistent) continue;
    const before = have(unwell.filter((d) => !jByDate.get(addDays(d.date, -1))?.unwell).map((d) => val(addDays(d.date, -1), key)));
    const s: BodySignal = {
      key,
      unwellDays: u.length,
      wellDays: w.length,
      unwellMean: round(mean(u)),
      wellMean: round(wellMean),
      diff: round(diff),
      effect: round(effect),
      consistent,
    };
    if (before.length >= 3) {
      const bd = mean(before) - wellMean;
      s.dayBefore = { days: before.length, mean: round(mean(before)), diff: round(bd), effect: round(bd / spread) };
    }
    signals.push(s);
  }
  signals.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));

  // Foods -> the next morning's numbers. Sleep, HRV and resting HR dated D+1 describe the night after eating on D.
  const foods: FoodBodyEffect[] = [];
  const eatenOn = new Map<string, Set<string>>();
  for (const d of journal) for (const f of foodsOf(d)) eatenOn.set(f, (eatenOn.get(f) ?? new Set()).add(d.date));
  // Illness explains its own bad numbers (and "Possible triggers" already covers foods before unwell days), so this
  // section only looks at days clear of any illness.
  // The day before an unwell day is skipped too: numbers often shift a day ahead of feeling ill (see the heads-up).
  const unwellDates = new Set(unwell.flatMap((d) => [d.date, addDays(d.date, -1)]));
  const wellHealth = health.filter((h) => !unwellDates.has(h.date));
  for (const key of FOOD_KEYS) {
    const all = have(wellHealth.map((h) => h[key] as number | undefined));
    if (all.length < 14) continue;
    const spread = sd(all);
    if (spread < 1e-9) continue;
    const info = METRIC_INFO[key]!;
    for (const [food, dates] of eatenOn) {
      const exposed = have([...dates].filter((d) => !unwellDates.has(addDays(d, 1))).map((d) => val(addDays(d, 1), key)));
      if (exposed.length < minFoodDays) continue;
      const others = have(wellHealth.filter((h) => !dates.has(addDays(h.date, -1))).map((h) => h[key] as number | undefined));
      if (others.length < 7) continue;
      const diff = mean(exposed) - mean(others);
      const effect = diff / spread;
      // Only the direction that is actually worse for you.
      const bad = info.worse === 'higher' ? effect : -effect;
      if (bad < minFoodEffect) continue;
      foods.push({ food, key, exposedDays: exposed.length, mean: round(mean(exposed)), baseline: round(mean(others)), diff: round(diff), effect: round(effect) });
    }
  }
  foods.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));

  const unwellWithData = unwell.filter((d) => KEYS.some((k) => val(d.date, k) !== undefined)).length;
  return { coverage: { healthDays: health.length, unwellDaysWithData: unwellWithData }, signals, foods: foods.slice(0, 6) };
}

export interface HeadsUpSignal {
  key: HealthMetricKey;
  value: number;
  usual: number;
  diff: number;
  date: string;
}

/** Smallest change (in the metric's own units) that counts as "off", on top of being outside normal wobble. */
const HEADSUP: { key: HealthMetricKey; dir: 1 | -1; floor: (usual: number) => number }[] = [
  { key: 'restingHr', dir: 1, floor: () => 3 },
  { key: 'hrv', dir: -1, floor: (u) => u * 0.15 },
  { key: 'skinTempC', dir: 1, floor: () => 0.3 },
  { key: 'breathing', dir: 1, floor: () => 1 },
];

/**
 * Wearables studies find resting heart rate creeping up while HRV, and often skin temperature and breathing rate, shift
 * in the day or two before people feel ill. If at least two of those are outside your own normal, say so gently.
 * Uses each metric's newest value from the last two days against the 28 days before it.
 */
export function computeHeadsUp(health: HealthDay[], today: string): HeadsUpSignal[] {
  const flagged: HeadsUpSignal[] = [];
  for (const { key, dir, floor } of HEADSUP) {
    const recent = health.filter((h) => h.date <= today && h.date >= addDays(today, -1) && typeof h[key] === 'number').sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!recent) continue;
    const base = have2(health.filter((h) => h.date < recent.date && h.date >= addDays(recent.date, -28)).map((h) => h[key] as number | undefined));
    if (base.length < 10) continue;
    const usual = mean(base);
    const spread = sd(base);
    const diff = (recent[key] as number) - usual;
    if (diff * dir > 0 && diff * dir >= floor(usual) && diff * dir >= 1.5 * spread) {
      flagged.push({ key, value: recent[key] as number, usual: round(usual), diff: round(diff), date: recent.date });
    }
  }
  return flagged.length >= 2 ? flagged : [];
}
const have2 = (xs: (number | undefined)[]) => xs.filter((x): x is number => x !== undefined);

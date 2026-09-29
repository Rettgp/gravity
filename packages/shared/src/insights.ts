import { addDays } from './dates.js';
import type { Day, Insights } from './schemas.js';
import { MEAL_KEYS } from './schemas.js';

export const normalizeFood = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function foodsOf(day: Day): string[] {
  const set = new Set<string>();
  for (const k of MEAL_KEYS) for (const f of day.meals[k]) set.add(normalizeFood(f.text));
  return [...set];
}

export interface InsightOptions {
  minCount?: number;
  minLift?: number;
}

/**
 * For every logged day D, a food is "exposed" if it was eaten on D or D-1 (~0-48h before).
 * lift = P(unwell | exposed) / P(unwell). Explainable, no ML.
 */
export function computeInsights(days: Day[], opts: InsightOptions = {}): Insights {
  const { minCount = 2, minLift = 1.5 } = opts;
  const byDate = new Map(days.map((d) => [d.date, d]));
  const logged = days.filter((d) => d.unwell || foodsOf(d).length > 0 || d.symptoms.length > 0);
  const unwellDays = logged.filter((d) => d.unwell);
  const base = logged.length ? unwellDays.length / logged.length : 0;

  const exposed = new Map<string, { total: number; unwell: string[] }>();
  for (const d of logged) {
    const prev = byDate.get(addDays(d.date, -1));
    const foods = new Set([...foodsOf(d), ...(prev ? foodsOf(prev) : [])]);
    for (const f of foods) {
      const e = exposed.get(f) ?? { total: 0, unwell: [] };
      e.total += 1;
      if (d.unwell) e.unwell.push(d.date);
      exposed.set(f, e);
    }
  }

  const suspects = [...exposed.entries()]
    .map(([food, e]) => ({
      food,
      exposedDays: e.total,
      unwellDays: e.unwell.length,
      lift: base > 0 ? e.unwell.length / e.total / base : 0,
      dates: e.unwell.sort(),
    }))
    .filter((s) => s.unwellDays >= minCount && s.lift >= minLift)
    .sort((a, b) => b.lift - a.lift || b.unwellDays - a.unwellDays)
    .map((s) => ({ ...s, lift: Math.round(s.lift * 100) / 100 }));

  const counts = new Map<string, number>();
  for (const d of logged) for (const s of d.symptoms) counts.set(s.name.toLowerCase(), (counts.get(s.name.toLowerCase()) ?? 0) + 1);
  const symptoms = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  return { loggedDays: logged.length, unwellDays: unwellDays.length, suspects, symptoms };
}

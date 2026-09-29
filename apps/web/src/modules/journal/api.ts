import { createContext, useContext, useMemo } from 'react';
import {
  computeInsights,
  emptyDay,
  foodsOf,
  generateDemoDays,
  normalizeFood,
  type Day,
  type DayInput,
  type DaySummary,
  type Insights,
  type SharedDaySummary,
} from '@gravity/shared';
import { useFetcher } from '../../lib/api';

export interface FoodCount {
  food: string;
  count: number;
}

/** The Journal UI only talks to this interface, so it can run against the real API or seeded demo data. */
export interface JournalApi {
  listMonth(pid: string, month: string): Promise<DaySummary[]>;
  getDay(pid: string, date: string): Promise<Day>;
  saveDay(pid: string, date: string, input: DayInput): Promise<Day>;
  foods(pid: string): Promise<FoodCount[]>;
  insights(pid: string): Promise<Insights>;
  shared(month: string): Promise<SharedDaySummary[]>;
}

export const JournalApiContext = createContext<JournalApi | null>(null);
export const useJournalApi = () => {
  const v = useContext(JournalApiContext);
  if (!v) throw new Error('useJournalApi outside provider');
  return v;
};

export function useHttpJournalApi(): JournalApi {
  const f = useFetcher();
  return useMemo<JournalApi>(
    () => ({
      listMonth: (pid, month) => f('/api/journal/profiles/' + pid + '/days?month=' + month),
      getDay: (pid, date) => f('/api/journal/profiles/' + pid + '/days/' + date),
      saveDay: (pid, date, input) => f('/api/journal/profiles/' + pid + '/days/' + date, { method: 'PUT', body: input }),
      foods: (pid) => f('/api/journal/profiles/' + pid + '/foods'),
      insights: (pid) => f('/api/journal/profiles/' + pid + '/insights'),
      shared: (month) => f('/api/journal/shared?month=' + month),
    }),
    [f],
  );
}

const summarize = (d: Day): DaySummary => ({
  date: d.date,
  unwell: d.unwell,
  mealCount: d.meals.breakfast.length + d.meals.lunch.length + d.meals.dinner.length + d.meals.snacks.length,
  symptomCount: d.symptoms.length,
  shared: d.shared,
});

/** In-memory journal seeded with believable fake data. Powers the landing-page display frame. */
export function createDemoApi(today: string): JournalApi {
  const days = new Map(generateDemoDays(today, 75).map((d) => [d.date, d]));
  return {
    async listMonth(_pid, month) {
      return [...days.values()].filter((d) => d.date.startsWith(month)).map(summarize);
    },
    async getDay(_pid, date) {
      return days.get(date) ?? emptyDay(date);
    },
    async saveDay(_pid, date, input) {
      const { expectedUpdatedAt: _e, ...rest } = input;
      const d: Day = { ...rest, date, updatedAt: new Date().toISOString() };
      days.set(date, d);
      return d;
    },
    async foods() {
      const counts = new Map<string, number>();
      for (const d of days.values()) for (const f of foodsOf(d)) counts.set(f, (counts.get(f) ?? 0) + 1);
      return [...counts].map(([food, count]) => ({ food: normalizeFood(food), count })).sort((a, b) => b.count - a.count).slice(0, 40);
    },
    async insights() {
      return computeInsights([...days.values()]);
    },
    async shared() {
      return [];
    },
  };
}

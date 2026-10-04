import { createContext, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  computeInsights,
  emptyDay,
  foodsOf,
  generateDemoDays,
  MEAL_KEYS,
  normalizeFood,
  type BodySignals,
  type Day,
  type Glimmer,
  type Medication,
  type GlimmerInput,
  type DayInput,
  type DaySummary,
  type HealthDay,
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
  /** Forget a food on every day (fixes typos that live on in suggestions). */
  removeFood(pid: string, food: string): Promise<{ daysChanged: number }>;
  insights(pid: string): Promise<Insights>;
  /** That day's body numbers (sleep, heart rate...), or null. Private to the profile's managers. */
  body(pid: string, date: string): Promise<HealthDay | null>;
  /** How unwell days (and the day before) and foods relate to the body numbers. */
  bodySignals(pid: string): Promise<BodySignals>;
  shared(month: string): Promise<SharedDaySummary[]>;
  /** Glimmers are always family-visible: anyone can list a profile's month. */
  listGlimmers(pid: string, month: string): Promise<Glimmer[]>;
  addGlimmer(pid: string, input: GlimmerInput): Promise<Glimmer>;
  deleteGlimmer(pid: string, date: string, id: string): Promise<void>;
  glimmerFeed(): Promise<Glimmer[]>;
  glimmerImage(id: string, size: 'thumb' | 'full'): Promise<string>;
  /** The family medicine cabinet (names only), shared by everyone. */
  cabinet(): Promise<Medication[]>;
  addMed(name: string): Promise<Medication>;
  deleteMed(id: string): Promise<void>;
}

/** Glimmer images never change, so they are cached forever once fetched. */
export function useGlimmerImage(id: string, size: 'thumb' | 'full', enabled = true) {
  const api = useJournalApi();
  return useQuery({ queryKey: ['glimmers', 'image', id, size], queryFn: () => api.glimmerImage(id, size), enabled, staleTime: Infinity, gcTime: 30 * 60_000 });
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
      removeFood: (pid, food) => f('/api/journal/profiles/' + pid + '/foods/remove', { method: 'POST', body: { food } }),
      insights: (pid) => f('/api/journal/profiles/' + pid + '/insights'),
      body: (pid, date) => f('/api/journal/profiles/' + pid + '/body/' + date),
      bodySignals: (pid) => f('/api/journal/profiles/' + pid + '/body-signals'),
      shared: (month) => f('/api/journal/shared?month=' + month),
      listGlimmers: (pid, month) => f('/api/journal/profiles/' + pid + '/glimmers?month=' + month),
      addGlimmer: (pid, input) => f('/api/journal/profiles/' + pid + '/glimmers', { method: 'POST', body: input }),
      deleteGlimmer: async (pid, date, id) => {
        await f('/api/journal/profiles/' + pid + '/glimmers/' + date + '/' + id, { method: 'DELETE' });
      },
      glimmerFeed: () => f('/api/journal/glimmers/feed'),
      glimmerImage: async (id, size) => (await f<{ dataUrl: string }>('/api/journal/glimmers/' + id + '/image?size=' + size)).dataUrl,
      cabinet: () => f('/api/journal/cabinet'),
      addMed: (name) => f('/api/journal/cabinet', { method: 'POST', body: { name } }),
      deleteMed: async (id) => {
        await f('/api/journal/cabinet/' + id, { method: 'DELETE' });
      },
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
  const glimmers: Glimmer[] = [
    { id: 'demo-1', profileId: 'demo', date: addDays(today, -1), caption: 'Warm sun on the porch with coffee', hasImage: false, createdAt: addDays(today, -1) + 'T18:00:00Z' },
    { id: 'demo-2', profileId: 'demo', date: addDays(today, -4), caption: 'The kids built a blanket fort', hasImage: false, createdAt: addDays(today, -4) + 'T18:00:00Z' },
  ];
  const cabinet: Medication[] = ['Ibuprofen', 'Tylenol', 'Allergy tablet'].map((name, i) => ({ id: 'demo-med-' + i, name, createdAt: today + 'T08:00:00Z' }));
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
    async removeFood(_pid, food) {
      const target = normalizeFood(food);
      let daysChanged = 0;
      for (const d of days.values()) {
        let changed = false;
        for (const k of MEAL_KEYS) {
          const kept = d.meals[k].filter((x) => normalizeFood(x.text) !== target);
          if (kept.length !== d.meals[k].length) {
            d.meals[k] = kept;
            changed = true;
          }
        }
        if (changed) daysChanged += 1;
      }
      return { daysChanged };
    },
    async insights() {
      return computeInsights([...days.values()]);
    },
    async body() {
      return null;
    },
    async bodySignals() {
      return { coverage: { healthDays: 0, unwellDaysWithData: 0 }, signals: [], foods: [] };
    },
    async shared() {
      return [];
    },
    async listGlimmers(_pid, month) {
      return glimmers.filter((g) => g.date.startsWith(month));
    },
    async addGlimmer(pid, input) {
      const g: Glimmer = { id: 'demo-' + Math.random().toString(36).slice(2), profileId: pid, date: input.date, caption: input.caption, hasImage: !!input.image, createdAt: new Date().toISOString() };
      glimmers.push(g);
      return g;
    },
    async deleteGlimmer(_pid, _date, id) {
      const i = glimmers.findIndex((g) => g.id === id);
      if (i >= 0) glimmers.splice(i, 1);
    },
    async glimmerFeed() {
      return [...glimmers].reverse();
    },
    async glimmerImage() {
      throw new Error('No image in the demo');
    },
    async cabinet() {
      return [...cabinet].sort((a, b) => a.name.localeCompare(b.name));
    },
    async addMed(name) {
      const m: Medication = { id: 'demo-med-' + Math.random().toString(36).slice(2), name, createdAt: new Date().toISOString() };
      cabinet.push(m);
      return m;
    },
    async deleteMed(id) {
      const i = cabinet.findIndex((m) => m.id === id);
      if (i >= 0) cabinet.splice(i, 1);
    },
  };
}

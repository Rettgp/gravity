import { MemoryDb, MemoryPhotos, type Req, type DayInput } from '@gravity/shared/server';
import { buildCoreRouter } from '../services/core/src/router';
import { buildJournalRouter } from '../services/journal/src/router';
import { buildMealsRouter } from '../services/meals/src/router';
import { PriceError } from '../services/planner/src/prices';
import { buildPlannerRouter } from '../services/planner/src/router';
import { buildTripsRouter } from '../services/trips/src/router';
import { FakeGoogle } from '../services/health/src/fake';
import { buildHealthRouter } from '../services/health/src/router';
import { MemoryTokens } from '../services/health/src/tokens';

export const FAMILY = ['mom@example.com', 'dad@example.com', 'teen@example.com'];
export const users = {
  mom: { sub: 'sub-mom', email: 'mom@example.com', name: 'Mom Jones' },
  dad: { sub: 'sub-dad', email: 'dad@example.com', name: 'Dad Jones' },
  teen: { sub: 'sub-teen', email: 'teen@example.com', name: 'Teen Jones' },
  stranger: { sub: 'sub-x', email: 'stranger@gmail.com', name: 'Eve' },
};
export type Who = keyof typeof users;

export function makeApp(allowed: string[] = FAMILY) {
  const db = new MemoryDb();
  const allowlist = async () => allowed;
  const core = buildCoreRouter({ db, table: 'core', allowlist, now: () => new Date('2026-09-28T12:00:00Z') });
  const journal = buildJournalRouter({ db, table: 'journal', coreTable: 'core', healthTable: 'health', photos: new MemoryPhotos(), allowlist, now: () => new Date('2026-09-28T12:00:00Z') });
  const meals = buildMealsRouter({ db, table: 'meals', allowlist, now: () => new Date('2026-09-28T12:00:00Z') });
  // No network in tests: product pages come from this map (url -> html), and price-drop emails are captured.
  const pages = new Map<string, string>();
  const emails: { to: string; subject: string; body: string }[] = [];
  const planner = buildPlannerRouter({
    db,
    table: 'planner',
    allowlist,
    now: () => new Date('2026-09-28T12:00:00Z'),
    fetchPage: async (url) => {
      const html = pages.get(url);
      if (html === undefined) throw new PriceError("Couldn't load that page");
      return { html, finalUrl: url };
    },
    sendEmail: async (m) => void emails.push(m),
  });
  const trips = buildTripsRouter({ db, table: 'trips', allowlist, now: () => new Date('2026-09-28T12:00:00Z') });
  const google = new FakeGoogle();
  const tokens = new MemoryTokens();
  let clock = new Date('2026-09-28T12:00:00Z');
  const health = buildHealthRouter({
    db,
    table: 'health',
    coreTable: 'core',
    allowlist,
    google,
    tokens,
    redirectOk: (u) => u === 'https://gravity.test/app/health/callback',
    now: () => clock,
  });
  const call = (router: typeof core, who: Who | null, method: string, path: string, body?: unknown, query: Record<string, string> = {}) =>
    router({ method, path, body, query, user: who ? users[who] : null } satisfies Req);
  return {
    db,
    core: (who: Who | null, m: string, p: string, b?: unknown, q?: Record<string, string>) => call(core, who, m, '/api/core' + p, b, q),
    /** Call the core service as an arbitrary signed-in user (e.g. one carrying a Google profile picture). */
    coreAs: (user: Req['user'], m: string, p: string, b?: unknown, q: Record<string, string> = {}) => core({ method: m, path: '/api/core' + p, body: b, query: q, user }),
    health: (who: Who | null, m: string, p: string, b?: unknown, q?: Record<string, string>) => call(health as never, who, m, '/api/health' + p, b, q),
    syncAll: () => health.syncAll(),
    google,
    tokens,
    setNow: (iso: string) => void (clock = new Date(iso)),
    meals: (who: Who | null, m: string, p: string, b?: unknown, q?: Record<string, string>) => call(meals, who, m, '/api/meals' + p, b, q),
    planner: (who: Who | null, m: string, p: string, b?: unknown, q?: Record<string, string>) => call(planner, who, m, '/api/planner' + p, b, q),
    pages,
    emails,
    checkPrices: () => planner.checkPrices(),
    trips: (who: Who | null, m: string, p: string, b?: unknown, q?: Record<string, string>) => call(trips, who, m, '/api/trips' + p, b, q),
    journal: (who: Who | null, m: string, p: string, b?: unknown, q?: Record<string, string>) => call(journal, who, m, '/api/journal' + p, b, q),
  };
}

export const day = (over: Partial<DayInput> = {}): DayInput => ({
  meals: { breakfast: [], lunch: [], dinner: [], snacks: [] },
  unwell: false,
  symptoms: [],
  meds: [],
  shared: false,
  ...over,
});

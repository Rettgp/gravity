import {
  HttpError,
  canManage,
  canReadDay,
  computeInsights,
  createRouter,
  dateStr,
  dayInput,
  emptyDay,
  foodsOf,
  monthStr,
  normalizeFood,
  parse,
  addDays,
  type Day,
  type DaySummary,
  type Db,
  type Profile,
  type Route,
  type SharedDaySummary,
} from '@gravity/shared/server';

export const JOURNAL_PREFIX = '/api/journal';

export interface JournalDeps {
  db: Db;
  table: string;
  /** Read-only access to the core table, used to resolve profile ownership. */
  coreTable: string;
  allowlist: () => Promise<string[]>;
  now?: () => Date;
}

const mealCount = (d: Day) => d.meals.breakfast.length + d.meals.lunch.length + d.meals.dinner.length + d.meals.snacks.length;
const summarize = (d: Day): DaySummary => ({
  date: d.date,
  unwell: d.unwell,
  mealCount: mealCount(d),
  symptomCount: d.symptoms.length,
  shared: d.shared,
});
const toDay = (it: Record<string, unknown>): Day => {
  const { pk: _pk, sk: _sk, ...rest } = it;
  return rest as unknown as Day;
};

export function buildJournalRouter({ db, table, coreTable, allowlist, now = () => new Date() }: JournalDeps) {
  const profile = async (id: string) => {
    const it = await db.get(coreTable, `PROFILE#${id}`, 'META');
    if (!it) throw new HttpError(404, 'Profile not found');
    return it as unknown as Profile;
  };
  const manage = async (id: string, sub: string) => {
    const p = await profile(id);
    if (!canManage(p, sub)) throw new HttpError(404, 'Profile not found');
    return p;
  };
  const allDays = async (pid: string) => (await db.query(table, `PROFILE#${pid}`, 'DAY#')).map(toDay);
  const today = () => now().toISOString().slice(0, 10);

  const routes: Route[] = [
    {
      method: 'GET',
      path: '/profiles/:pid/days',
      handler: async ({ user, params, query }) => {
        const month = parse(monthStr, query.month);
        const p = await profile(params.pid!);
        const mine = canManage(p, user.sub);
        const days = (await db.query(table, `PROFILE#${p.id}`, `DAY#${month}`)).map(toDay);
        return days.filter((d) => mine || d.shared).map(summarize);
      },
    },
    {
      method: 'GET',
      path: '/profiles/:pid/days/:date',
      handler: async ({ user, params }) => {
        const date = parse(dateStr, params.date);
        const p = await profile(params.pid!);
        const it = await db.get(table, `PROFILE#${p.id}`, `DAY#${date}`);
        if (!canReadDay(p, user.sub, !!it && it.shared === true)) throw new HttpError(404, 'Profile not found');
        return it ? toDay(it) : emptyDay(date, p.shareByDefault);
      },
    },
    {
      method: 'PUT',
      path: '/profiles/:pid/days/:date',
      handler: async ({ user, params, body }) => {
        const date = parse(dateStr, params.date);
        const p = await manage(params.pid!, user.sub);
        const { expectedUpdatedAt, ...input } = parse(dayInput, body);
        const existing = await db.get(table, `PROFILE#${p.id}`, `DAY#${date}`);
        if (expectedUpdatedAt && existing && existing.updatedAt !== expectedUpdatedAt) {
          throw new HttpError(409, 'This day was changed elsewhere. Reload to see the latest.');
        }
        const day: Day = { ...input, date, updatedAt: now().toISOString(), updatedBy: user.sub };
        await db.put(table, { pk: `PROFILE#${p.id}`, sk: `DAY#${date}`, ...day });
        const idx = { pk: `SHARED#${date.slice(0, 7)}`, sk: `${date}#${p.id}` };
        if (day.shared) {
          await db.put(table, { ...idx, profileId: p.id, date, unwell: day.unwell, symptomCount: day.symptoms.length });
        } else {
          await db.delete(table, idx.pk, idx.sk);
        }
        return day;
      },
    },
    {
      method: 'DELETE',
      path: '/profiles/:pid/days/:date',
      handler: async ({ user, params }) => {
        const date = parse(dateStr, params.date);
        const p = await manage(params.pid!, user.sub);
        await db.delete(table, `PROFILE#${p.id}`, `DAY#${date}`);
        await db.delete(table, `SHARED#${date.slice(0, 7)}`, `${date}#${p.id}`);
        return { status: 204 };
      },
    },
    {
      method: 'GET',
      path: '/profiles/:pid/foods',
      handler: async ({ user, params }) => {
        const p = await manage(params.pid!, user.sub);
        const counts = new Map<string, number>();
        for (const d of await allDays(p.id)) for (const f of foodsOf(d)) counts.set(f, (counts.get(f) ?? 0) + 1);
        return [...counts.entries()]
          .map(([food, count]) => ({ food: normalizeFood(food), count }))
          .sort((a, b) => b.count - a.count || a.food.localeCompare(b.food))
          .slice(0, 100);
      },
    },
    {
      method: 'GET',
      path: '/profiles/:pid/insights',
      handler: async ({ user, params, query }) => {
        const p = await manage(params.pid!, user.sub);
        const to = query.to ? parse(dateStr, query.to) : today();
        const from = query.from ? parse(dateStr, query.from) : addDays(to, -90);
        const days = (await allDays(p.id)).filter((d) => d.date >= from && d.date <= to);
        return computeInsights(days);
      },
    },
    {
      method: 'GET',
      path: '/shared',
      handler: async ({ query }) => {
        const month = parse(monthStr, query.month);
        const items = await db.query(table, `SHARED#${month}`);
        return items.map(({ profileId, date, unwell, symptomCount }) => ({ profileId, date, unwell, symptomCount }) as SharedDaySummary);
      },
    },
  ];

  return createRouter({ prefix: JOURNAL_PREFIX, routes, allowlist });
}

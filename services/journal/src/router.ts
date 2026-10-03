import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  HttpError,
  canManage,
  canReadDay,
  computeBodySignals,
  computeInsights,
  createRouter,
  dateStr,
  dayInput,
  emptyDay,
  foodsOf,
  glimmerInput,
  MAX_GLIMMERS_PER_DAY,
  monthStr,
  MEAL_KEYS,
  normalizeFood,
  parseDataUrl,
  toDataUrl,
  parse,
  addDays,
  type Day,
  type DaySummary,
  type Db,
  type PhotoStore,
  type Glimmer,
  type HealthDay,
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
  /** Read-only access to the health table, for the body strip and body signals. Absent = health is not wired up. */
  healthTable?: string;
  /** Private photo storage (S3 in AWS). Absent = photos are not wired up and glimmers are caption-only. */
  photos?: PhotoStore;
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

const toGlimmer = (it: Record<string, unknown>): Glimmer => ({
  id: String(it.id),
  profileId: String(it.profileId),
  date: String(it.date),
  ...(it.caption ? { caption: String(it.caption) } : {}),
  hasImage: it.hasImage === true,
  createdAt: String(it.createdAt),
});
const photoKey = (id: string, size: 'thumb' | 'full') => `glimmers/${id}/${size}.img`;
const prevMonth = (m: string) => {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5));
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
};

export function buildJournalRouter({ db, table, coreTable, healthTable, photos, allowlist, now = () => new Date() }: JournalDeps) {
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
  /** Foods the person removed from their history. They stay out of suggestions until logged again on purpose. */
  const hiddenFoods = async (pid: string) => new Set((await db.query(table, `PROFILE#${pid}`, 'HIDDENFOOD#')).map((i) => String(i.food)));

  const healthDays = async (pid: string): Promise<HealthDay[]> =>
    healthTable
      ? (await db.query(healthTable, `PROFILE#${pid}`, 'DAY#')).map(({ pk: _pk, sk: _sk, syncedAt: _s, ...rest }) => rest as unknown as HealthDay)
      : [];

  const routes: Route[] = [
    {
      // Health data is private to the people who manage a profile: shared journal days never carry it.
      method: 'GET',
      path: '/profiles/:pid/body/:date',
      handler: async ({ user, params }) => {
        const date = parse(dateStr, params.date);
        const p = await manage(params.pid!, user.sub);
        if (!healthTable) return null;
        const it = await db.get(healthTable, `PROFILE#${p.id}`, `DAY#${date}`);
        if (!it) return null;
        const { pk: _pk, sk: _sk, syncedAt: _s, ...rest } = it;
        return rest as unknown as HealthDay;
      },
    },
    {
      method: 'GET',
      path: '/profiles/:pid/body-signals',
      handler: async ({ user, params, query }) => {
        const p = await manage(params.pid!, user.sub);
        const to = query.to ? parse(dateStr, query.to) : today();
        const from = query.from ? parse(dateStr, query.from) : addDays(to, -180);
        const inRange = <T extends { date: string }>(xs: T[]) => xs.filter((d) => d.date >= from && d.date <= to);
        return computeBodySignals(inRange(await allDays(p.id)), inRange(await healthDays(p.id)));
      },
    },
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
        const day = it ? toDay(it) : emptyDay(date, p.shareByDefault);
        // Family sees that a day was unwell and the symptoms, never meals or notes.
        if (!canManage(p, user.sub)) return { ...day, meals: emptyDay(date).meals, notes: undefined };
        return day;
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
        // Logging a food again on purpose brings it back into suggestions.
        const logged = foodsOf(day);
        if (logged.length) for (const food of await hiddenFoods(p.id)) if (logged.includes(food)) await db.delete(table, `PROFILE#${p.id}`, `HIDDENFOOD#${food}`);
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
        const hidden = await hiddenFoods(p.id);
        for (const d of await allDays(p.id)) for (const f of foodsOf(d)) if (!hidden.has(f)) counts.set(f, (counts.get(f) ?? 0) + 1);
        return [...counts.entries()]
          .map(([food, count]) => ({ food: normalizeFood(food), count }))
          .sort((a, b) => b.count - a.count || a.food.localeCompare(b.food))
          .slice(0, 100);
      },
    },
    {
      // Forget a food everywhere (typos!): strips it from every day of the profile and reports how many days changed.
      method: 'POST',
      path: '/profiles/:pid/foods/remove',
      handler: async ({ user, params, body }) => {
        const p = await manage(params.pid!, user.sub);
        const { food } = parse(z.object({ food: z.string().trim().min(1).max(80) }), body);
        const target = normalizeFood(food);
        let daysChanged = 0;
        for (const day of await allDays(p.id)) {
          let changed = false;
          for (const k of MEAL_KEYS) {
            const kept = day.meals[k].filter((f) => normalizeFood(f.text) !== target);
            if (kept.length !== day.meals[k].length) {
              day.meals[k] = kept;
              changed = true;
            }
          }
          if (!changed) continue;
          daysChanged += 1;
          const next: Day = { ...day, updatedAt: now().toISOString(), updatedBy: user.sub };
          await db.put(table, { pk: `PROFILE#${p.id}`, sk: `DAY#${day.date}`, ...next });
        }
        // Permanent: hide it from suggestions even if no day contained it (so this can never "not find" anything).
        await db.put(table, { pk: `PROFILE#${p.id}`, sk: `HIDDENFOOD#${target}`, food: target });
        return { daysChanged };
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
      // Glimmers are always visible to the family: any allowlisted member may list them.
      method: 'GET',
      path: '/profiles/:pid/glimmers',
      handler: async ({ params, query }) => {
        const month = parse(monthStr, query.month);
        const p = await profile(params.pid!);
        return (await db.query(table, `PROFILE#${p.id}`, `GLIMMER#${month}`)).map(toGlimmer);
      },
    },
    {
      method: 'POST',
      path: '/profiles/:pid/glimmers',
      handler: async ({ user, params, body }) => {
        const p = await manage(params.pid!, user.sub);
        const { date, caption, image } = parse(glimmerInput, body);
        if (image && !photos) throw new HttpError(503, 'Photos are not set up');
        const existing = await db.query(table, `PROFILE#${p.id}`, `GLIMMER#${date}#`);
        if (existing.length >= MAX_GLIMMERS_PER_DAY) throw new HttpError(409, `That day already has ${MAX_GLIMMERS_PER_DAY} glimmers`);
        const id = randomUUID();
        const createdAt = now().toISOString();
        const meta = { id, profileId: p.id, date, ...(caption ? { caption } : {}), hasImage: !!image, createdAt };
        await db.put(table, { pk: `PROFILE#${p.id}`, sk: `GLIMMER#${date}#${id}`, ...meta, createdBy: user.sub });
        await db.put(table, { pk: `GLIMMERFEED#${date.slice(0, 7)}`, sk: `${date}#${createdAt}#${id}`, ...meta });
        if (image && photos) {
          for (const [size, url] of [['thumb', image.thumb], ['full', image.full]] as const) {
            const { contentType, bytes } = parseDataUrl(url);
            await photos.put(photoKey(id, size), bytes, contentType);
          }
        }
        return { status: 201, body: meta satisfies Glimmer };
      },
    },
    {
      method: 'DELETE',
      path: '/profiles/:pid/glimmers/:date/:gid',
      handler: async ({ user, params }) => {
        const date = parse(dateStr, params.date);
        const p = await manage(params.pid!, user.sub);
        const gid = params.gid!;
        const it = await db.get(table, `PROFILE#${p.id}`, `GLIMMER#${date}#${gid}`);
        if (it) {
          await db.delete(table, `PROFILE#${p.id}`, `GLIMMER#${date}#${gid}`);
          await db.delete(table, `GLIMMERFEED#${date.slice(0, 7)}`, `${date}#${String(it.createdAt)}#${gid}`);
          await photos?.delete([photoKey(gid, 'thumb'), photoKey(gid, 'full')]);
          for (const img of await db.query(table, `GLIMMERIMG#${gid}`)) await db.delete(table, img.pk, img.sk); // photos saved before S3
        }
        return { status: 204 };
      },
    },
    {
      // Newest first, this month and last.
      method: 'GET',
      path: '/glimmers/feed',
      handler: async () => {
        const thisMonth = today().slice(0, 7);
        const items = [...(await db.query(table, `GLIMMERFEED#${thisMonth}`)), ...(await db.query(table, `GLIMMERFEED#${prevMonth(thisMonth)}`))];
        return items
          .map(toGlimmer)
          .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
          .slice(0, 20);
      },
    },
    {
      method: 'GET',
      path: '/glimmers/:gid/image',
      handler: async ({ params, query }) => {
        const size = query.size === 'full' ? 'full' : 'thumb';
        const obj = await photos?.get(photoKey(params.gid!, size));
        if (obj) return { dataUrl: toDataUrl(obj.contentType, obj.bytes) };
        // Photos saved before S3 lived in the table (the full one in numbered chunks).
        const old = size === 'full' ? await db.query(table, `GLIMMERIMG#${params.gid}`, 'full') : [await db.get(table, `GLIMMERIMG#${params.gid}`, 'thumb')].filter((x) => !!x);
        if (old.length === 0) throw new HttpError(404, 'Not found');
        return { dataUrl: old.map((x) => String(x!.dataUrl)).join('') };
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

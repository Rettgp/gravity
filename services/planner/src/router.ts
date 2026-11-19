import {
  HttpError,
  PLANNER_COLLECTIONS,
  PLANNER_GIFT_COLLECTIONS,
  PLANNER_ID_RE,
  PLANNER_MAX_IMPORT_BYTES,
  PLANNER_MAX_ITEM_BYTES,
  PLANNER_MAX_YEAR,
  PLANNER_MIN_YEAR,
  createRouter,
  type Db,
  type Route,
} from '@gravity/shared/server';
import { PriceError, checkAndSave, createHttpFetcher, fetchImage, logEmail, mergeTracker, runScheduled, type FetchPage, type PriceCtx, type SendEmail } from './prices.js';
import { plannerStore, type Doc } from './store.js';

export const PLANNER_PREFIX = '/api/planner';

export interface PlannerDeps {
  db: Db;
  table: string;
  allowlist: () => Promise<string[]>;
  now?: () => Date;
  /** Downloads a product page. Defaults to the real, SSRF-guarded fetcher; tests and local mode inject a fake. */
  fetchPage?: FetchPage;
  /** Sends a price-drop email. Defaults to printing it to the console. */
  sendEmail?: SendEmail;
}

const isObj = (v: unknown): v is Doc => !!v && typeof v === 'object' && !Array.isArray(v);

/** A JSON object body, size-checked on its serialised form. No body at all is an empty object. */
const jsonBody = (body: unknown, limit = PLANNER_MAX_ITEM_BYTES): Doc => {
  if (body === undefined) return {};
  if (Buffer.byteLength(JSON.stringify(body)) > limit) throw new HttpError(413, 'Request too large');
  if (!isObj(body)) throw new HttpError(400, 'Expected a JSON object');
  return body;
};

const year = (v: string) => {
  if (!/^[0-9]+$/.test(v) || +v < PLANNER_MIN_YEAR || +v > PLANNER_MAX_YEAR) throw new HttpError(400, 'Invalid year');
  return +v;
};
const collection = (v: string) => {
  if (!(PLANNER_COLLECTIONS as readonly string[]).includes(v)) throw new HttpError(404, 'Unknown collection');
  return v;
};
const itemId = (v: string) => {
  if (!PLANNER_ID_RE.test(v)) throw new HttpError(400, 'Invalid id');
  return v;
};

const validateImport = (body: Doc) => {
  const settings = body.settings || {};
  const collections = body.collections || {};
  if (!isObj(settings) || !isObj(collections)) throw new HttpError(400, 'Invalid backup format');
  const clean: Record<string, Doc[]> = {};
  for (const [name, items] of Object.entries(collections)) {
    if (!(PLANNER_COLLECTIONS as readonly string[]).includes(name)) continue;
    if (!Array.isArray(items)) throw new HttpError(400, `Invalid items for ${name}`);
    clean[name] = items.map((doc) => {
      if (!isObj(doc) || !PLANNER_ID_RE.test(String(doc.id ?? ''))) throw new HttpError(400, `Invalid item in ${name}`);
      if (Buffer.byteLength(JSON.stringify(doc)) > PLANNER_MAX_ITEM_BYTES) throw new HttpError(413, `Item too large in ${name}`);
      return doc;
    });
  }
  return { settings, collections: clean };
};

export function buildPlannerRouter({ db, table, allowlist, now = () => new Date(), fetchPage = createHttpFetcher(), sendEmail = logEmail }: PlannerDeps) {
  const store = plannerStore(db, table, now);
  const ctx: PriceCtx = { store, allowlist, fetchPage, sendEmail, now };
  const isGiftCollection = (c: string) => (PLANNER_GIFT_COLLECTIONS as readonly string[]).includes(c);
  const ok = { ok: true };

  const routes: Route[] = [
    { method: 'GET', path: '/ping', handler: async () => ok },
    { method: 'GET', path: '/years', handler: async () => ({ years: await store.listYears() }) },
    {
      method: 'GET',
      path: '/years/:year',
      handler: async ({ params }) => {
        const y = year(params.year!);
        const settings = await store.getSettings(y);
        if (!settings) throw new HttpError(404, 'Year not set up yet');
        return { year: y, settings, collections: await store.listItems(y) };
      },
    },
    {
      method: 'DELETE',
      path: '/years/:year',
      handler: async ({ params }) => {
        await store.deleteYear(year(params.year!));
        return ok;
      },
    },
    {
      method: 'PUT',
      path: '/years/:year/settings',
      handler: async ({ params, body, user }) => {
        const y = year(params.year!);
        const settings = { ...jsonBody(body), year: y };
        await store.putSettings(y, settings, user.email);
        return { settings };
      },
    },
    {
      method: 'POST',
      path: '/years/:year/import',
      handler: async ({ params, body, user }) => {
        const y = year(params.year!);
        const { settings, collections } = validateImport(jsonBody(body, PLANNER_MAX_IMPORT_BYTES));
        await store.replaceYear(y, { ...settings, year: y }, collections, user.email);
        return ok;
      },
    },
    {
      method: 'POST',
      path: '/years/:year/:collection/:id/check-price',
      handler: async ({ params }) => {
        const y = year(params.year!);
        const c = params.collection!;
        if (!isGiftCollection(c)) throw new HttpError(404, 'Not found');
        const gift = await store.getItem(y, c, itemId(params.id!));
        if (!gift) throw new HttpError(404, 'Gift not found');
        if (!gift.priceTracker || !gift.link) throw new HttpError(400, "This gift isn't tracking a price");
        return { item: await checkAndSave(ctx, y, gift, c) };
      },
    },
    {
      method: 'PUT',
      path: '/years/:year/items/:collection/:id',
      handler: async ({ params, body, user }) => {
        const y = year(params.year!);
        const c = collection(params.collection!);
        const id = itemId(params.id!);
        if (!(await store.getSettings(y))) throw new HttpError(404, 'Year not set up yet');
        let doc: Doc = { ...jsonBody(body), id };
        if (isGiftCollection(c)) {
          try {
            doc = mergeTracker(doc, await store.getItem(y, c, id), user.email);
          } catch (e) {
            if (e instanceof RangeError) throw new HttpError(400, 'Tracker percentage must be between 1 and 99');
            throw e;
          }
        }
        await store.putItem(y, c, id, doc, user.email);
        return { item: doc };
      },
    },
    {
      method: 'DELETE',
      path: '/years/:year/items/:collection/:id',
      handler: async ({ params }) => {
        const y = year(params.year!);
        const c = collection(params.collection!);
        const id = itemId(params.id!);
        if (!(await store.getSettings(y))) throw new HttpError(404, 'Year not set up yet');
        await store.deleteItem(y, c, id);
        return ok;
      },
    },
    {
      method: 'POST',
      path: '/link-image',
      handler: async ({ body }) => {
        const url = jsonBody(body).url;
        if (typeof url !== 'string' || url.length > 2000) throw new HttpError(400, 'Missing link');
        try {
          return { image: await fetchImage(url, fetchPage) };
        } catch (e) {
          // 503: try again on a later visit; 422: this link has no photo, don't ask again.
          if (e instanceof PriceError) throw new HttpError(e.retryable ? 503 : 422, e.message);
          throw e;
        }
      },
    },
  ];

  const router = createRouter({ prefix: PLANNER_PREFIX, allowlist, routes });
  return Object.assign(router, {
    /** Scheduled entry point (EventBridge), not reachable over HTTP. */
    checkPrices: () => runScheduled(ctx),
  });
}

import { z } from 'zod';
import {
  HttpError,
  MAX_SECTION_BYTES,
  buildTripTemplate,
  createRouter,
  parse,
  sectionSchema,
  tripCreate,
  tripDates,
  tripImport,
  tripMetaInput,
  type Db,
  type GrocerySection,
  type PackingSection,
  type Route,
  type TripMeta,
} from '@gravity/shared/server';

export const TRIPS_PREFIX = '/api/trips';

export interface TripsDeps {
  db: Db;
  table: string;
  allowlist: () => Promise<string[]>;
  now?: () => Date;
}

const TRIPS = 'TRIPS';
const tripPk = (id: string) => 'TRIP#' + id;
const sectionBody = z.object({ rev: z.number().int().min(0), data: z.unknown() });

const strip = <T>(it: Record<string, unknown>): T => {
  const { pk: _pk, sk: _sk, ...rest } = it;
  return rest as T;
};
const tooBig = (data: unknown) => Buffer.byteLength(JSON.stringify(data) ?? '') > MAX_SECTION_BYTES;

export function buildTripsRouter({ db, table, allowlist, now = () => new Date() }: TripsDeps) {
  const stamp = () => now().toISOString();
  const loadMeta = async (id: string) => {
    const it = await db.get(table, TRIPS, 'T#' + id);
    if (!it) throw new HttpError(404, 'Trip not found');
    return strip<TripMeta>(it);
  };
  const putSection = (id: string, key: string, data: unknown, rev: number, by: string) =>
    db.put(table, { pk: tripPk(id), sk: 'S#' + key, rev, data, updatedBy: by, updatedAt: stamp() });
  const putAll = async (id: string, sections: Record<string, unknown>, by: string) => {
    const entries = Object.entries(sections);
    for (let i = 0; i < entries.length; i += 25) await Promise.all(entries.slice(i, i + 25).map(([k, d]) => putSection(id, k, d, 1, by)));
  };
  const whoIs = (u: { email: string; name?: string }) => u.name ?? u.email;

  const routes: Route[] = [
    {
      method: 'GET',
      path: '/',
      handler: async () => (await db.query(table, TRIPS, 'T#')).map((it) => strip<TripMeta>(it)).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    },
    {
      method: 'POST',
      path: '/',
      handler: async ({ body, user }) => {
        const { copyListsFrom, ...input } = parse(tripCreate, body);
        let copyFrom: { packing?: PackingSection; grocery?: GrocerySection } | undefined;
        if (copyListsFrom) {
          await loadMeta(copyListsFrom);
          const get = async (k: string) => (await db.get(table, tripPk(copyListsFrom), 'S#' + k))?.data;
          copyFrom = { packing: (await get('packing')) as PackingSection | undefined, grocery: (await get('grocery')) as GrocerySection | undefined };
        }
        const { meta, sections } = buildTripTemplate(input, copyFrom);
        const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'trip';
        const base = `${slug}-${input.startDate.slice(0, 4)}`;
        let id = base;
        for (let n = 2; await db.get(table, TRIPS, 'T#' + id); n++) id = `${base}-${n}`;
        const full: TripMeta = { id, ...meta, createdBy: whoIs(user), createdAt: stamp() };
        await putAll(id, sections, whoIs(user));
        await db.put(table, { pk: TRIPS, sk: 'T#' + id, ...full }); // meta last: a half-written trip stays invisible
        return { status: 201, body: full };
      },
    },
    {
      method: 'GET',
      path: '/:id',
      handler: async ({ params }) => {
        const meta = await loadMeta(params.id!);
        const out: Record<string, { rev: number; data: unknown }> = {};
        for (const it of await db.query(table, tripPk(meta.id), 'S#')) out[it.sk.slice(2)] = { rev: it.rev as number, data: it.data };
        return { meta, sections: out };
      },
    },
    {
      method: 'PUT',
      path: '/:id/meta',
      handler: async ({ params, body, user }) => {
        const old = await loadMeta(params.id!);
        const input = parse(tripMetaInput, body);
        tripDates(input.startDate, input.endDate);
        const next: TripMeta = { id: old.id, ...input, createdBy: old.createdBy, createdAt: old.createdAt };
        await db.put(table, { pk: TRIPS, sk: 'T#' + old.id, ...next });
        // New dates get their empty days; days that fell out of range are kept with their data.
        const { sections } = buildTripTemplate({ ...input, family: [] });
        for (const [key, data] of Object.entries(sections)) {
          if (key.startsWith('day-') && !(await db.get(table, tripPk(old.id), 'S#' + key))) await putSection(old.id, key, data, 1, whoIs(user));
        }
        return next;
      },
    },
    {
      method: 'PUT',
      path: '/:id/sections/:key',
      handler: async ({ params, body, user }) => {
        const id = params.id!;
        const key = params.key!;
        const schema = sectionSchema(key);
        const { rev, data } = parse(sectionBody, body);
        if (tooBig(data)) throw new HttpError(413, 'Section is too large');
        const clean = parse(schema, data);
        await loadMeta(id);
        // shortcut: not atomic, fine for one family; use a conditional write if edits ever collide
        const cur = await db.get(table, tripPk(id), 'S#' + key);
        if (!cur && key.startsWith('day-')) throw new HttpError(404, 'Day not found');
        const curRev = (cur?.rev as number | undefined) ?? 0;
        if (rev !== curRev) return { status: 409, body: { error: 'Conflict', section: { rev: curRev, data: cur?.data } } };
        await putSection(id, key, clean, curRev + 1, whoIs(user));
        return { rev: curRev + 1 };
      },
    },
    {
      method: 'PUT',
      path: '/:id/import',
      handler: async ({ params, body, query, user }) => {
        const { meta, sections } = parse(tripImport, body);
        if (meta.id !== params.id) throw new HttpError(400, 'meta.id must match the trip id in the path');
        tripDates(meta.startDate, meta.endDate);
        const clean: Record<string, unknown> = {};
        for (const [key, data] of Object.entries(sections)) {
          let schema;
          try {
            schema = sectionSchema(key);
          } catch {
            throw new HttpError(400, `Unknown section: ${key}`);
          }
          if (tooBig(data)) throw new HttpError(413, `Section ${key} is too large`);
          clean[key] = parse(schema, data);
        }
        const exists = await db.get(table, TRIPS, 'T#' + meta.id);
        if (exists && query.force !== '1') throw new HttpError(409, 'Trip already exists; use ?force=1 to replace it');
        if (exists) {
          for (const it of await db.query(table, tripPk(meta.id), 'S#')) if (!(it.sk.slice(2) in clean)) await db.delete(table, it.pk, it.sk);
        }
        await putAll(meta.id, clean, whoIs(user));
        const full: TripMeta = { ...meta, createdBy: meta.createdBy ?? whoIs(user), createdAt: meta.createdAt ?? stamp() };
        await db.put(table, { pk: TRIPS, sk: 'T#' + meta.id, ...full });
        return full;
      },
    },
  ];
  return createRouter({ prefix: TRIPS_PREFIX, allowlist, routes });
}

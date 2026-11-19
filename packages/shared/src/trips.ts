import { z, type ZodTypeAny } from 'zod';
import { addDays, fmt, toUtc } from './dates.js';
import { HttpError } from './http.js';
import { dateStr } from './schemas.js';

export const MAX_TRIP_DAYS = 31;
export const MAX_SECTION_BYTES = 200_000;

export const tripId = z.string().regex(/^[a-z0-9-]{1,64}$/, 'Expected a trip id like branson-2026');

/** Plain text + **bold** + [label](https://url). No HTML, and link targets are limited to https:, tel: and mailto:. */
export const rich = z
  .string()
  .max(2000)
  .superRefine((s, ctx) => {
    if (/<[a-zA-Z]/.test(s)) ctx.addIssue({ code: 'custom', message: 'HTML is not allowed' });
    for (const m of s.matchAll(/\]\(([^)]*)\)/g)) {
      if (!/^(https:\/\/|tel:|mailto:)/.test(m[1]!)) ctx.addIssue({ code: 'custom', message: 'Links must start with https://, tel: or mailto:' });
    }
  });
export type Rich = z.infer<typeof rich>;

const text = (max = 200) => z.string().max(max);
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Expected HH:MM');
const color = z.string().regex(/^var\(--[a-z0-9-]+\)$/, 'Expected a CSS variable like var(--green)');
const url = z.string().max(500).regex(/^https:\/\//, 'Links must start with https://');

export const check = z.object({ label: text(), checked: z.boolean() });
export type Check = z.infer<typeof check>;
export const row = z.object({ label: text(), value: rich, tbd: z.boolean().optional() });
export type Row = z.infer<typeof row>;
export const infoCard = z.object({
  title: text(),
  intro: rich.optional(),
  groups: z.array(z.object({ label: text().optional(), rows: z.array(row).max(60) })).max(30),
});
export type InfoCard = z.infer<typeof infoCard>;
const checkGroup = z.object({ id: text(64), title: text(), items: z.array(check).max(300) });

// ---- Sections -------------------------------------------------------------------------------------------------
export const overviewSection = z.object({ planParagraphs: z.array(rich).max(30), party: rich, stay: rich });
export const daySection = z.object({
  title: text(),
  navLabel: text(40),
  color,
  goal: rich.optional(),
  anchor: rich.optional(),
  events: z
    .array(
      z.object({
        id: text(64),
        time: text(40),
        at: hhmm.optional(),
        until: hhmm.optional(),
        title: text(),
        body: rich,
        meta: z.array(rich).max(20),
        anchor: z.boolean(),
        reminders: z.array(text()).max(20),
      }),
    )
    .max(60),
  notes: z.array(rich).max(40),
  cards: z.array(infoCard).max(20),
});
export const diningSection = z.object({
  note: rich.optional(),
  meals: z
    .array(
      z.object({
        title: text(),
        intro: rich.optional(),
        groups: z
          .array(z.object({ label: text(), intro: rich.optional(), items: z.array(z.object({ name: text(), tag: text(60).optional(), body: rich, meta: z.array(rich).max(20) })).max(100) }))
          .max(20),
      }),
    )
    .max(10),
});
export const grocerySection = z.object({ groups: z.array(checkGroup).max(30) });
export const packingSection = z.object({
  todo: z.array(check).max(100),
  people: z.array(z.object({ name: text(60), groups: z.array(checkGroup).max(20) })).max(20),
});
export const logisticsSection = z.object({
  sections: z.array(z.object({ title: text(), rows: z.array(row).max(80) })).max(20),
  tickets: z
    .array(
      z.object({
        id: text(64),
        name: text(),
        urgency: z.enum(['urgent', 'moderate', 'flexible']),
        body: rich,
        link: z.object({ label: text(), href: url }).optional(),
        booked: z.boolean(),
      }),
    )
    .max(60),
});
export const costsSection = z.object({ rows: z.array(z.object({ label: text(), amount: text(40) })).max(40) });

export type OverviewSection = z.infer<typeof overviewSection>;
export type DaySection = z.infer<typeof daySection>;
export type DiningSection = z.infer<typeof diningSection>;
export type GrocerySection = z.infer<typeof grocerySection>;
export type PackingSection = z.infer<typeof packingSection>;
export type LogisticsSection = z.infer<typeof logisticsSection>;
export type CostsSection = z.infer<typeof costsSection>;

const FIXED: Record<string, ZodTypeAny> = {
  overview: overviewSection,
  dining: diningSection,
  grocery: grocerySection,
  packing: packingSection,
  logistics: logisticsSection,
  costs: costsSection,
};
export const dayKey = (date: string) => 'day-' + date;
const DAY_KEY = /^day-\d{4}-\d{2}-\d{2}$/;

/** The zod schema for a section key; 404 for a key that is not a section. */
export function sectionSchema(key: string): ZodTypeAny {
  if (DAY_KEY.test(key)) return daySection;
  const s = Object.hasOwn(FIXED, key) ? FIXED[key] : undefined; // not `constructor`, `__proto__`...
  if (!s) throw new HttpError(404, 'Unknown section');
  return s;
}

// ---- Meta -----------------------------------------------------------------------------------------------------
const metaFields = {
  name: z.string().trim().min(1).max(120),
  eyebrow: text(120),
  destination: z.string().trim().min(1).max(160),
  startDate: dateStr,
  endDate: dateStr,
  checkIn: text(40).optional(),
  checkOut: text(40).optional(),
  tz: text(64),
};
/** Body of PUT /:id/meta. */
export const tripMetaInput = z.object(metaFields);
export const tripMeta = z.object({ id: tripId, ...metaFields, createdBy: text(), createdAt: text(40) });
export type TripMeta = z.infer<typeof tripMeta>;
/** Body of PUT /:id/import: createdBy and createdAt are filled in when missing. */
export const tripImport = z.object({
  meta: tripMeta.partial({ createdBy: true, createdAt: true }),
  sections: z.record(z.string().max(64), z.unknown()),
});
/** Body of POST /. */
export const tripCreate = z.object({
  name: metaFields.name,
  destination: metaFields.destination,
  startDate: dateStr,
  endDate: dateStr,
  checkIn: metaFields.checkIn,
  checkOut: metaFields.checkOut,
  tz: metaFields.tz.optional(),
  family: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  copyListsFrom: tripId.optional(),
});

/** Every date from start to end inclusive; 400 for a bad date, end before start, or more than 31 days. */
export function tripDates(start: string, end: string): string[] {
  for (const d of [start, end]) if (fmt(toUtc(d)) !== d) throw new HttpError(400, `${d} is not a real date`);
  if (end < start) throw new HttpError(400, 'endDate is before startDate');
  const n = (toUtc(end) - toUtc(start)) / 86_400_000 + 1;
  if (n > MAX_TRIP_DAYS) throw new HttpError(400, `A trip can be at most ${MAX_TRIP_DAYS} days`);
  return Array.from({ length: n }, (_, i) => addDays(start, i));
}

// ---- Template -------------------------------------------------------------------------------------------------
const DAY_COLORS = ['var(--green)', 'var(--coral)', 'var(--amber)', 'var(--violet)', 'var(--cyan)'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface TripTemplateInput {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  checkIn?: string;
  checkOut?: string;
  tz?: string;
  family: string[];
}
export type TripTemplateMeta = Omit<TripMeta, 'id' | 'createdBy' | 'createdAt'>;

const list = (id: string, title: string): z.infer<typeof checkGroup> => ({ id, title, items: [] });
const unchecked = <T extends { checked: boolean }>(items: T[]): T[] => items.map((i) => ({ ...i, checked: false }));

/** Pure: the starting content of a new trip. `copyFrom` carries packing and grocery lists over with everything unchecked. */
export function buildTripTemplate(
  input: TripTemplateInput,
  copyFrom?: { packing?: PackingSection; grocery?: GrocerySection },
): { meta: TripTemplateMeta; sections: Record<string, unknown> } {
  const dates = tripDates(input.startDate, input.endDate);
  const meta: TripTemplateMeta = {
    name: input.name,
    eyebrow: input.destination,
    destination: input.destination,
    startDate: input.startDate,
    endDate: input.endDate,
    ...(input.checkIn ? { checkIn: input.checkIn } : {}),
    ...(input.checkOut ? { checkOut: input.checkOut } : {}),
    tz: input.tz ?? 'America/Chicago',
  };
  const sections: Record<string, unknown> = {
    overview: { planParagraphs: [], party: '', stay: '' } satisfies OverviewSection,
    dining: { meals: ['Breakfast', 'Lunch', 'Dinner'].map((title) => ({ title, groups: [] })) } satisfies DiningSection,
    grocery: copyFrom?.grocery
      ? { groups: copyFrom.grocery.groups.map((g) => ({ ...g, items: unchecked(g.items) })) }
      : ({ groups: [list('breakfast', 'Breakfast'), list('lunch', 'Lunch'), list('snacks', 'Snacks & drinks'), list('household', 'Household')] } satisfies GrocerySection),
    packing: copyFrom?.packing
      ? { todo: unchecked(copyFrom.packing.todo), people: copyFrom.packing.people.map((p) => ({ ...p, groups: p.groups.map((g) => ({ ...g, items: unchecked(g.items) })) })) }
      : ({
          todo: [],
          people: [
            ...input.family.map((name) => ({ name, groups: [list('clothing', 'Clothing'), list('extras', 'Extras')] })),
            { name: 'General', groups: [list('gear', 'Gear'), list('road', 'On the road')] },
          ],
        } satisfies PackingSection),
    logistics: {
      sections: ['Stay', 'Amenities', 'Groceries', 'Party', 'To confirm'].map((title) => ({ title, rows: [] })),
      tickets: [],
    } satisfies LogisticsSection,
    costs: { rows: ['Lodging', 'Groceries', 'Tickets', 'Dining out', 'Gas / travel', 'Misc / souvenirs'].map((label) => ({ label, amount: '' })) } satisfies CostsSection,
  };
  dates.forEach((d, i) => {
    sections[dayKey(d)] = {
      title: `Day ${i + 1}`,
      navLabel: WEEKDAYS[new Date(toUtc(d)).getUTCDay()]!,
      color: DAY_COLORS[i % DAY_COLORS.length]!,
      events: [],
      notes: [],
      cards: [],
    } satisfies DaySection;
  });
  return { meta, sections };
}

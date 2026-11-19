import { describe, expect, it } from 'vitest';
import { buildTripTemplate, type PackingSection } from '@gravity/shared';
import { makeApp } from './helpers';

const input = { name: 'Branson', destination: 'Branson, MO', startDate: '2026-12-26', endDate: '2026-12-29', family: ['Mom', 'Dad'] };
type Trip = { meta: { id: string; startDate: string }; sections: Record<string, { rev: number; data: any }> };

const setup = async (over: Record<string, unknown> = {}) => {
  const app = makeApp();
  const res = await app.trips('mom', 'POST', '/', { ...input, ...over });
  return { app, res, id: (res.body as { id: string }).id };
};
const getTrip = async (app: ReturnType<typeof makeApp>, id: string) => (await app.trips('mom', 'GET', '/' + id)).body as Trip;
const put = (app: ReturnType<typeof makeApp>, id: string, key: string, rev: number, data: unknown) =>
  app.trips('mom', 'PUT', `/${id}/sections/${key}`, { rev, data });

describe('trips: template', () => {
  it('makes one day per date, one packing person per family name plus General', () => {
    const { meta, sections } = buildTripTemplate(input);
    expect(Object.keys(sections).filter((k) => k.startsWith('day-'))).toEqual(['day-2026-12-26', 'day-2026-12-27', 'day-2026-12-28', 'day-2026-12-29']);
    expect(sections['day-2026-12-26']).toMatchObject({ title: 'Day 1', navLabel: 'Sat', color: 'var(--green)' });
    expect((sections.packing as PackingSection).people.map((p) => p.name)).toEqual(['Mom', 'Dad', 'General']);
    expect(meta).toMatchObject({ name: 'Branson', startDate: '2026-12-26', tz: 'America/Chicago' });
  });
  it('caps trips at 31 days and rejects end before start', () => {
    expect(() => buildTripTemplate({ ...input, endDate: '2027-01-25' })).not.toThrow(); // 31 days
    expect(() => buildTripTemplate({ ...input, endDate: '2027-01-26' })).toThrow(/31 days/);
    expect(() => buildTripTemplate({ ...input, endDate: '2026-12-25' })).toThrow(/before/);
  });
});

describe('trips: access', () => {
  it('needs a signed-in, allowlisted family member', async () => {
    const { trips } = makeApp();
    expect((await trips(null, 'GET', '/')).status).toBe(401);
    expect((await trips('stranger', 'GET', '/')).status).toBe(403);
    expect((await trips('stranger', 'PUT', '/x/sections/overview', { rev: 0, data: {} })).status).toBe(403);
  });
});

describe('trips: create, list, get', () => {
  it('creates from the template and returns it', async () => {
    const { app, res, id } = await setup();
    expect(res.status).toBe(201);
    expect(id).toBe('branson-2026');
    const t = await getTrip(app, id);
    expect(Object.keys(t.sections).sort()).toEqual(
      ['costs', 'day-2026-12-26', 'day-2026-12-27', 'day-2026-12-28', 'day-2026-12-29', 'dining', 'grocery', 'logistics', 'overview', 'packing'],
    );
    expect(t.sections.packing!.rev).toBe(1);
    expect(t.sections.packing!.data.people).toHaveLength(3);
    expect((await app.trips('mom', 'GET', '/nope')).status).toBe(404);
    expect((await app.trips('mom', 'POST', '/', { ...input, endDate: '2026-12-01' })).status).toBe(400);
  });

  it('lists newest startDate first and keeps ids unique for the same name', async () => {
    const { app, id } = await setup();
    const again = (await app.trips('mom', 'POST', '/', input)).body as { id: string };
    await app.trips('mom', 'POST', '/', { ...input, name: 'Spring', startDate: '2027-04-01', endDate: '2027-04-02' });
    expect(again.id).toBe(id + '-2');
    const list = (await app.trips('dad', 'GET', '/')).body as { id: string }[];
    expect(list.map((t) => t.id)).toEqual(['spring-2027', 'branson-2026', 'branson-2026-2']);
  });

  it('copyListsFrom copies packing and grocery with everything unchecked', async () => {
    const { app, id } = await setup();
    const t = await getTrip(app, id);
    const packing = { ...t.sections.packing!.data, todo: [{ label: 'Book hotel', checked: true }] };
    packing.people[0].groups[0].items = [{ label: 'Coat', checked: true }];
    await put(app, id, 'packing', 1, packing);
    const grocery = { groups: [{ id: 'g', title: 'Snacks', items: [{ label: 'Chips', checked: true }] }] };
    await put(app, id, 'grocery', 1, grocery);

    const next = (await app.trips('mom', 'POST', '/', { ...input, name: 'Next', startDate: '2027-06-01', endDate: '2027-06-02', copyListsFrom: id })).body as { id: string };
    const n = await getTrip(app, next.id);
    expect(n.sections.packing!.data.todo).toEqual([{ label: 'Book hotel', checked: false }]);
    expect(n.sections.packing!.data.people[0].groups[0].items).toEqual([{ label: 'Coat', checked: false }]);
    expect(n.sections.grocery!.data.groups[0].items).toEqual([{ label: 'Chips', checked: false }]);
    expect((await app.trips('mom', 'POST', '/', { ...input, copyListsFrom: 'missing' })).status).toBe(404);
  });
});

describe('trips: sections', () => {
  it('bumps rev on each save', async () => {
    const { app, id } = await setup();
    const data = { planParagraphs: ['Go **big**'], party: 'Us', stay: 'Cabin' };
    expect((await put(app, id, 'overview', 1, data)).body).toEqual({ rev: 2 });
    expect((await put(app, id, 'overview', 2, data)).body).toEqual({ rev: 3 });
    expect((await getTrip(app, id)).sections.overview).toEqual({ rev: 3, data });
  });

  it('saves dining intros on meals and groups and returns them unchanged', async () => {
    const { app, id } = await setup();
    const data = { note: 'n', meals: [{ title: 'Lunch', intro: 'Meal intro', groups: [{ label: 'Near', intro: 'Line one\nLine two', items: [] }, { label: 'Far', items: [] }] }] };
    expect((await put(app, id, 'dining', 1, data)).body).toEqual({ rev: 2 });
    expect((await getTrip(app, id)).sections.dining).toEqual({ rev: 2, data });
    expect((await put(app, id, 'dining', 2, { meals: [{ title: 'x', intro: '<b>x</b>', groups: [] }] })).status).toBe(400);
  });

  it('returns 409 with the current section for a stale rev and changes nothing', async () => {
    const { app, id } = await setup();
    const mine = { planParagraphs: ['mine'], party: '', stay: '' };
    await put(app, id, 'overview', 1, mine);
    const res = await put(app, id, 'overview', 1, { planParagraphs: ['theirs'], party: '', stay: '' });
    expect(res).toEqual({ status: 409, body: { error: 'Conflict', section: { rev: 2, data: mine } } });
    expect((await getTrip(app, id)).sections.overview).toEqual({ rev: 2, data: mine });
  });

  it('404 for unknown keys and days that do not exist, 400 for bad data, 413 for oversize', async () => {
    const { app, id } = await setup();
    const ok = { planParagraphs: [], party: '', stay: '' };
    expect((await put(app, id, 'bogus', 0, ok)).status).toBe(404);
    expect((await put(app, id, 'day-2030-01-01', 0, { title: 'x', navLabel: 'x', color: 'var(--green)', events: [], notes: [], cards: [] })).status).toBe(404);
    expect((await app.trips('mom', 'PUT', '/nope/sections/overview', { rev: 1, data: ok })).status).toBe(404);
    expect((await put(app, id, 'overview', 1, { planParagraphs: 'x' })).status).toBe(400);
    expect((await put(app, id, 'overview', 1, { ...ok, party: 'x'.repeat(250_000) })).status).toBe(413);
    expect((await getTrip(app, id)).sections.overview!.rev).toBe(1);
  });

  it('404 for keys inherited from Object.prototype and writes nothing', async () => {
    const { app, id } = await setup();
    const before = await getTrip(app, id);
    for (const key of ['constructor', '__proto__', 'toString']) expect((await put(app, id, key, 0, {})).status).toBe(404);
    expect(await getTrip(app, id)).toEqual(before);
  });

  it('only allows plain text, bold and safe links in Rich fields', async () => {
    const { app, id } = await setup();
    const withParty = (party: string) => put(app, id, 'overview', 1, { planParagraphs: [], party, stay: '' });
    expect((await withParty('[x](javascript:alert(1))')).status).toBe(400);
    expect((await withParty('<script>alert(1)</script>')).status).toBe(400);
    expect((await withParty('[x](http://example.com)')).status).toBe(400);
    expect((await withParty('[x](https://example.com) and [call](tel:5551234) **hi**')).status).toBe(200);
  });
});

describe('trips: meta', () => {
  it('adds days for new dates and keeps existing days with their data, never deleting', async () => {
    const { app, id } = await setup();
    const day = { title: 'Arrive', navLabel: 'Sat', color: 'var(--coral)', events: [], notes: ['hi'], cards: [] };
    await put(app, id, 'day-2026-12-27', 1, day);
    const meta = { name: 'Branson', eyebrow: 'Holiday', destination: 'Branson, MO', startDate: '2026-12-27', endDate: '2026-12-31', tz: 'America/Chicago' };
    expect((await app.trips('mom', 'PUT', `/${id}/meta`, meta)).status).toBe(200);
    const t = await getTrip(app, id);
    expect(t.meta).toMatchObject({ id, startDate: '2026-12-27', eyebrow: 'Holiday', createdBy: 'Mom Jones' });
    expect(Object.keys(t.sections).filter((k) => k.startsWith('day-'))).toEqual([
      'day-2026-12-26', 'day-2026-12-27', 'day-2026-12-28', 'day-2026-12-29', 'day-2026-12-30', 'day-2026-12-31',
    ]);
    expect(t.sections['day-2026-12-27']).toEqual({ rev: 2, data: day });
    expect(t.sections['day-2026-12-30']!.data.title).toBe('Day 4');
    expect((await app.trips('mom', 'PUT', `/${id}/meta`, { ...meta, endDate: '2026-12-01' })).status).toBe(400);
  });
});

describe('trips: import', () => {
  const file = (name: string) => ({
    meta: { id: 'old-trip', name, eyebrow: 'Past', destination: 'Somewhere', startDate: '2025-07-01', endDate: '2025-07-02', tz: 'America/Chicago', createdBy: 'me', createdAt: '2025-06-01T00:00:00Z' },
    sections: { overview: { planParagraphs: ['p'], party: '', stay: '' }, 'day-2025-07-01': { title: 'Day 1', navLabel: 'Tue', color: 'var(--green)', events: [], notes: [], cards: [] } },
  });

  it('creates, refuses to overwrite without force, and replaces with force=1', async () => {
    const app = makeApp();
    expect((await app.trips('mom', 'PUT', '/old-trip/import', file('One'))).status).toBe(200);
    let t = await getTrip(app, 'old-trip');
    expect(t.meta).toMatchObject({ name: 'One', createdBy: 'me' });
    expect(t.sections.overview!.rev).toBe(1);

    expect((await app.trips('mom', 'PUT', '/old-trip/import', file('Two'))).status).toBe(409);
    expect((await getTrip(app, 'old-trip')).meta).toMatchObject({ name: 'One' });

    const second = file('Two');
    delete (second.sections as Record<string, unknown>)['day-2025-07-01'];
    expect((await app.trips('mom', 'PUT', '/old-trip/import', second, { force: '1' })).status).toBe(200);
    t = await getTrip(app, 'old-trip');
    expect(t.meta.id).toBe('old-trip');
    expect(Object.keys(t.sections)).toEqual(['overview']);
    expect(((await app.trips('mom', 'GET', '/')).body as { name: string }[])[0]!.name).toBe('Two');
  });

  it('validates everything before writing', async () => {
    const app = makeApp();
    const bad = file('Bad');
    (bad.sections as Record<string, unknown>).overview = { planParagraphs: [], party: '[x](javascript:1)', stay: '' };
    expect((await app.trips('mom', 'PUT', '/old-trip/import', bad)).status).toBe(400);
    expect((await app.trips('mom', 'PUT', '/other/import', file('Bad'))).status).toBe(400);
    expect((await app.trips('mom', 'PUT', '/old-trip/import', { ...file('x'), sections: { nope: {} } })).status).toBe(400);
    expect((await app.trips('mom', 'GET', '/old-trip')).status).toBe(404);
  });
});

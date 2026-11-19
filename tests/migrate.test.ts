import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MemoryDb, tripImport } from '@gravity/shared/server';
import { countByKind, diffRows, importRows, transformPlanner, type Args, type OldRow } from '../scripts/migrate-planner';
import { buildSections, missingTexts, richFromHtml } from '../scripts/export-branson';
import { buildTripsRouter } from '../services/trips/src/router';

// Made-up rows in the shape of the old table.
const old: OldRow[] = [
  { PK: 'HH#main', SK: 'Y#2030', doc: JSON.stringify({ year: 2030, name: 'Test year' }), updatedBy: 'a@x.test', updatedAt: 1700000000 },
  { PK: 'HH#main#Y#2030', SK: 'I#gifts#g1', doc: JSON.stringify({ id: 'g1', name: 'Kite', price: 12.5, tags: ['a', 'b'] }), updatedBy: 'a@x.test', updatedAt: 1700000001 },
  { PK: 'HH#main#Y#2030', SK: 'I#gifts#g2', doc: JSON.stringify({ id: 'g2', name: 'Ball' }), updatedBy: 'b@x.test', updatedAt: 1700000002 },
  { PK: 'HH#main#Y#2030', SK: 'I#todos#t1', doc: JSON.stringify({ id: 't1', done: false }), updatedBy: 'b@x.test', updatedAt: 1700000003 },
  { PK: 'HH#main', SK: 'F#f1', doc: JSON.stringify({ id: 'f1', type: 'Bug', area: 'Gifts', description: 'Broken', done: false, createdAt: 1, createdBy: 'A', doneAt: null, occasion: 'Birthday' }), updatedBy: 'a@x.test', updatedAt: 1700000004 },
  { PK: 'HH#main', SK: 'F#f2', doc: JSON.stringify({ id: 'f2', type: 'Feature', area: 'Budget', description: 'More', done: true, createdAt: 2, createdBy: 'B', doneAt: 3 }), updatedBy: 'b@x.test', updatedAt: 1700000005 },
];

describe('migrate planner: transform', () => {
  const out = transformPlanner(old);
  it('keeps key strings and parses doc for planner rows', () => {
    expect(out.planner).toHaveLength(4);
    expect(out.planner[1]).toEqual({ pk: 'HH#main#Y#2030', sk: 'I#gifts#g1', doc: { id: 'g1', name: 'Kite', price: 12.5, tags: ['a', 'b'] }, updatedBy: 'a@x.test', updatedAt: 1700000001 });
  });
  it('moves feedback to the core table and re-tags it', () => {
    expect(out.core).toEqual([
      { pk: 'FEEDBACK', sk: 'F#f1', doc: { id: 'f1', type: 'Bug', area: 'Planner', originalArea: 'Gifts', description: 'Broken', done: false, createdAt: 1, createdBy: 'A', doneAt: null, occasion: 'Birthday' }, updatedBy: 'a@x.test', updatedAt: 1700000004 },
      { pk: 'FEEDBACK', sk: 'F#f2', doc: { id: 'f2', type: 'Feature', area: 'Planner', originalArea: 'Budget', description: 'More', done: true, createdAt: 2, createdBy: 'B', doneAt: 3, occasion: 'Christmas' }, updatedBy: 'b@x.test', updatedAt: 1700000005 },
    ]);
  });
  it('counts per collection', () => {
    expect(countByKind([...out.planner, ...out.core])).toEqual({ feedback: 2, gifts: 2, settings: 1, todos: 1 });
  });
});

describe('migrate planner: verify', () => {
  const expected = transformPlanner(old);
  it('finds no difference in a faithful copy, through the real MemoryDb', async () => {
    const db = new MemoryDb();
    for (const r of expected.planner) await db.put('planner', r);
    for (const r of expected.core) await db.put('core', r);
    const actual = { planner: [...(await db.query('planner', 'HH#main')), ...(await db.query('planner', 'HH#main#Y#2030'))], core: await db.query('core', 'FEEDBACK') };
    expect(diffRows(expected, actual)).toEqual([]);
  });
  it('reports missing, different and unexpected rows and count changes', () => {
    const actual = structuredClone(expected);
    actual.planner.shift(); // settings row gone
    (actual.planner[0]!.doc as { name: string }).name = 'Changed';
    (actual.core[0]!.doc as { area: string }).area = 'Gifts'; // feedback not re-tagged
    actual.planner.push({ pk: 'HH#main#Y#2030', sk: 'I#gifts#zz', doc: {} });
    const diffs = diffRows(expected, actual).join('\n');
    expect(diffs).toContain('MISSING HH#main | Y#2030');
    expect(diffs).toContain('DIFFERENT HH#main#Y#2030 | I#gifts#g1');
    expect(diffs).toContain('DIFFERENT FEEDBACK | F#f1');
    expect(diffs).toContain('UNEXPECTED HH#main#Y#2030 | I#gifts#zz');
    expect(diffs).toContain('counts differ');
  });
});

describe('migrate planner: import guard', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migrate-'));
  const exportFile = join(dir, 'export.json');
  writeFileSync(exportFile, JSON.stringify(old));
  const args = (db: string, force = false): Args => ({ cmd: 'import', target: 'local', db, export: exportFile, table: '', region: '', force, yes: false });
  const run = async (a: Args) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    try {
      await importRows(a);
      return 'ok';
    } catch (e) {
      return (e as Error).message;
    } finally {
      vi.restoreAllMocks();
    }
  };

  it('is not blocked by unrelated feedback filed after deploy, but still protects planner rows', async () => {
    const db = join(dir, 'a.json');
    const seed = new MemoryDb(db);
    await seed.put('core', { pk: 'FEEDBACK', sk: 'F#new1', doc: { id: 'new1' } });
    expect(await run(args(db))).toBe('ok');
    expect(await new MemoryDb(db).query('core', 'FEEDBACK')).toHaveLength(3);
    expect(await run(args(db))).toBe('exit'); // planner rows and feedback ids now exist
    expect(await run(args(db, true))).toBe('ok');
  });

  it('refuses when an incoming feedback id already exists, or planner rows exist', async () => {
    const fb = join(dir, 'b.json');
    await new MemoryDb(fb).put('core', { pk: 'FEEDBACK', sk: 'F#f1', doc: {} });
    expect(await run(args(fb))).toBe('exit');
    const pl = join(dir, 'c.json');
    await new MemoryDb(pl).put('planner', { pk: 'HH#main', sk: 'Y#2030', doc: {} });
    expect(await run(args(pl))).toBe('exit');
  });
});

describe('branson: html to Rich', () => {
  it('converts bold and safe links, drops other tags, decodes entities', () => {
    expect(richFromHtml('Pick <strong>two</strong> &amp; go&nbsp;now — <a href="https://x.test/a?b=1&amp;c=2" target="_blank">Map →</a>.')).toBe('Pick **two** & go now — [Map →](https://x.test/a?b=1&c=2).');
    expect(richFromHtml('<a href="tel:+15550100">Call</a> or <a href="mailto:a@x.test">mail</a>')).toBe('[Call](tel:+15550100) or [mail](mailto:a@x.test)');
  });
  it('keeps only the label of a link that is not https/tel/mailto', () => {
    expect(richFromHtml('<a href="http://x.test">plain</a> <a href="javascript:alert(1)">bad</a> <a>none</a>')).toBe('plain bad none');
  });
  it('turns <br> into a newline and moves edge spaces out of bold', () => {
    expect(richFromHtml('Line one<br>Line two <strong> bold </strong>end <b></b>')).toBe('Line one\nLine two **bold** end');
  });
  it('produces text the Rich schema accepts', () => {
    const { meta, sections } = buildSections(fixturePage(), [{ day: 'day1', label: 'Check in', start: '2030-01-01T16:00:00-06:00', end: '2030-01-01T17:30:00-06:00' }]);
    expect(() => tripImport.parse({ meta, sections })).not.toThrow();
    const day = sections['day-2026-11-21'] as { events: { at?: string; until?: string }[] };
    expect(day.events[0]).toMatchObject({ at: '16:00', until: '17:30' });
    expect(day.events[1]!.at).toBeUndefined();
  });
});

describe('branson: completeness', () => {
  it('flags text that is not in the JSON and ignores markup', () => {
    const json = [{ body: 'Go **now** to [the map →](https://x.test)', n: 3 }];
    expect(missingTexts(['Go now to the map →', 'now', 'the map', 'lost text'], json)).toEqual(['lost text']);
  });
});

describe('branson: import through the trips route', () => {
  it('writes the trip and refuses to replace it without force', async () => {
    const { meta, sections } = buildSections(fixturePage(), []);
    const db = new MemoryDb();
    const user = { sub: 's', email: 'm@x.test', name: 'M' };
    const router = buildTripsRouter({ db, table: 'trips', allowlist: async () => [user.email] });
    const put = (query: Record<string, string>) => router({ method: 'PUT', path: `/api/trips/${meta.id}/import`, query, body: { meta, sections }, user });
    expect((await put({})).status).toBe(200);
    expect(await db.get('trips', 'TRIP#' + meta.id, 'S#grocery')).toMatchObject({ rev: 1, updatedBy: 'M' });
    expect((await put({})).status).toBe(409);
    expect((await put({ force: '1' })).status).toBe(200);
  });
});

/** The raw page extraction shape, with invented content. */
function fixturePage() {
  const day = (title: string) => ({
    title,
    navLabel: 'Sat · ' + title,
    goal: 'Plan <strong>light</strong>',
    anchor: 'Anchor: <strong>Show</strong>, 7pm',
    events: [
      { id: 'd-1', time: '4:00 PM', title: 'Check in', body: 'Keys &amp; map', meta: ['<a href="https://x.test">Map →</a>'], anchor: false, reminders: ['Bring ID'] },
      { id: 'd-2', time: '5:00 PM', title: 'Dinner', body: '', meta: [], anchor: true, reminders: [] },
    ],
    notes: ['<strong>Note</strong> — invented'],
    cards: [{ title: 'Heights', intro: 'Intro', groups: [{ label: 'Kids', rows: [{ label: 'Ride', value: '42&quot; min', tbd: false }] }, { rows: [{ label: 'Ask', value: 'Call', tbd: true }] }] }],
  });
  return {
    name: 'Test trip',
    eyebrow: 'Eyebrow',
    overview: { plan: ['One', 'Two'], party: 'Us', stay: 'Here<br>There' },
    days: [day('One'), day('Two'), day('Three'), day('Four')],
    dining: { sub: 'Sub', note: '<strong>Plan</strong> note', meals: [{ title: 'Lunch', intro: 'Meal intro', groups: [{ label: 'Near', intros: ['Group intro'], metas: ['1 mi'], items: [{ name: 'Cafe', tag: 'Diner', body: 'Good', meta: ['Open'] }] }] }] },
    grocery: { groups: [{ id: 'g', title: 'Food', items: [{ label: 'Milk', checked: true }] }] },
    packing: { todo: [{ label: 'Call', checked: false }], people: [{ name: 'Pat', groups: [{ id: 'p-c', title: 'Clothes', items: [{ label: 'Coat', checked: false }] }] }] },
    logistics: { sections: [{ title: 'Stay', rows: [{ label: 'Unit', value: '1', tbd: false }] }], tickets: [{ id: 't', name: 'Show', urgency: 'urgent', body: 'Book', link: { label: 'site →', href: 'https://x.test' }, booked: false }] },
    costs: { rows: [{ label: 'Hotel', amount: '10' }] },
  };
}

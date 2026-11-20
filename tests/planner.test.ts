import { describe, expect, it } from 'vitest';
import { MemoryDb, PLANNER_COLLECTIONS, plannerHouseholdPk, plannerItemSk, plannerSettingsSk, plannerYearPk } from '@gravity/shared/server';
import { makeApp } from './helpers';
import { plannerStore } from '../services/planner/src/store';

const NOW_MS = Date.parse('2026-09-28T12:00:00Z');

describe('planner: access', () => {
  it('needs a signed-in, allowlisted family member for every route', async () => {
    const { planner } = makeApp();
    const routes = [
      ['GET', '/years'], ['GET', '/years/2026'], ['DELETE', '/years/2026'], ['PUT', '/years/2026/settings'], ['POST', '/years/2026/import'],
      ['PUT', '/years/2026/items/gifts/g1'], ['DELETE', '/years/2026/items/gifts/g1'], ['POST', '/years/2026/gifts/g1/check-price'],
      ['POST', '/link-image'],
    ] as const;
    for (const [m, p] of routes) {
      expect((await planner(null, m, p, {})).status, `${m} ${p}`).toBe(401);
      expect((await planner('stranger', m, p, {})).status, `${m} ${p}`).toBe(403);
    }
  });

  it('matches the allowlist case-insensitively', async () => {
    const { planner } = makeApp(['MOM@Example.com']);
    expect((await planner('mom', 'GET', '/years')).status).toBe(200);
    expect((await planner('dad', 'GET', '/years')).status).toBe(403);
  });
});

describe('planner: years', () => {
  it('shares a year between family members, keeps years independent', async () => {
    const { planner } = makeApp();
    expect((await planner('mom', 'GET', '/years/2026')).status).toBe(404);
    expect((await planner('mom', 'PUT', '/years/2026/settings', { name: 'Jones', currency: 'USD' })).status).toBe(200);
    const put = await planner('dad', 'PUT', '/years/2026/items/gifts/g1', { recipient: 'Mom', budget: 50 });
    expect(put.status).toBe(200);
    expect((put.body as any).item.id).toBe('g1');
    const body = (await planner('mom', 'GET', '/years/2026')).body as any;
    expect(body.year).toBe(2026);
    expect(body.settings).toEqual({ name: 'Jones', currency: 'USD', year: 2026 });
    expect(body.collections.gifts[0].recipient).toBe('Mom');
    await planner('mom', 'PUT', '/years/2027/settings', { name: 'Jones' });
    expect(((await planner('mom', 'GET', '/years/2027')).body as any).collections).toEqual({});
    const years = ((await planner('mom', 'GET', '/years')).body as any).years;
    expect(years.map((y: any) => y.year)).toEqual([2026, 2027]);
    expect(years[0].settings.name).toBe('Jones');
    expect((await planner('mom', 'DELETE', '/years/2026/items/gifts/g1')).status).toBe(200);
    expect(((await planner('mom', 'GET', '/years/2026')).body as any).collections.gifts ?? []).toEqual([]);
  });

  it('deletes a year with all its items', async () => {
    const { planner, db } = makeApp();
    await planner('mom', 'PUT', '/years/2026/settings', {});
    await planner('mom', 'PUT', '/years/2026/items/todos/t1', { title: 'a' });
    expect(await planner('mom', 'DELETE', '/years/2026')).toEqual({ status: 200, body: { ok: true } });
    expect((await planner('mom', 'GET', '/years/2026')).status).toBe(404);
    expect(await db.query('planner', plannerYearPk(2026))).toEqual([]);
    expect((await planner('mom', 'DELETE', '/years/2026')).status).toBe(200); // deleting an unknown year is fine
  });

  it('rejects unknown collections, bad ids and bad years; items need a set-up year', async () => {
    const { planner } = makeApp();
    expect((await planner('mom', 'PUT', '/years/2026/items/todos/a', {})).body).toEqual({ error: 'Year not set up yet' });
    await planner('mom', 'PUT', '/years/2026/settings', {});
    expect((await planner('mom', 'PUT', '/years/2026/items/hackers/a', {})).body).toEqual({ error: 'Unknown collection' });
    expect([400, 404]).toContain((await planner('mom', 'PUT', '/years/2026/items/gifts/../x', {})).status);
    expect((await planner('mom', 'PUT', '/years/2026/items/gifts/bad%20id!', {})).body).toEqual({ error: 'Invalid id' });
    expect((await planner('mom', 'PUT', '/years/2026/items/gifts/' + 'a'.repeat(65), {})).status).toBe(400);
    for (const y of ['1800', '2101', 'abc']) expect((await planner('mom', 'GET', '/years/' + y)).body, y).toEqual({ error: 'Invalid year' });
    expect((await planner('mom', 'GET', '/years/2000')).status).toBe(404);
    expect((await planner('mom', 'GET', '/years/2100')).status).toBe(404);
  });

  it('accepts every one of the 19 collections', async () => {
    const { planner } = makeApp();
    expect(PLANNER_COLLECTIONS).toHaveLength(19);
    await planner('mom', 'PUT', '/years/2026/settings', {});
    for (const c of PLANNER_COLLECTIONS) expect((await planner('mom', 'PUT', `/years/2026/items/${c}/x1`, { n: 1 })).status, c).toBe(200);
  });

  it('caps an item at 64 KB (413) and wants a JSON object (400)', async () => {
    const { planner } = makeApp();
    await planner('mom', 'PUT', '/years/2026/settings', {});
    const big = { note: 'x'.repeat(64 * 1024) };
    expect((await planner('mom', 'PUT', '/years/2026/items/todos/a', big)).status).toBe(413);
    expect((await planner('mom', 'PUT', '/years/2026/settings', big)).status).toBe(413);
    expect((await planner('mom', 'PUT', '/years/2026/items/todos/a', { note: 'x'.repeat(60 * 1024) })).status).toBe(200);
    expect((await planner('mom', 'PUT', '/years/2026/items/todos/a', [1])).status).toBe(400);
    expect((await planner('mom', 'PUT', '/years/2026/items/todos/a', null)).body).toEqual({ error: 'Expected a JSON object' });
    expect((await planner('mom', 'PUT', '/years/2026/items/todos/a')).status).toBe(200); // no body = {}
  });

  it('stores rows under the old table keys, with a native doc, the editor and epoch seconds', async () => {
    const { planner, db } = makeApp();
    await planner('dad', 'PUT', '/years/2026/settings', { name: 'Jones' });
    await planner('dad', 'PUT', '/years/2026/items/todos/t1', { title: 'Wrap' });
    const at = Math.floor(NOW_MS / 1000);
    expect(await db.get('planner', 'HH#main', 'Y#2026')).toEqual({ pk: 'HH#main', sk: 'Y#2026', doc: { name: 'Jones', year: 2026 }, updatedBy: 'dad@example.com', updatedAt: at });
    expect(await db.get('planner', 'HH#main#Y#2026', 'I#todos#t1')).toMatchObject({ doc: { title: 'Wrap', id: 't1' }, updatedBy: 'dad@example.com', updatedAt: at });
    expect([plannerHouseholdPk(), plannerYearPk(2026), plannerSettingsSk(2026), plannerItemSk('todos', 't1')]).toEqual(['HH#main', 'HH#main#Y#2026', 'Y#2026', 'I#todos#t1']);
  });
});

describe('planner: import', () => {
  it('replaces the year, dropping unknown collections', async () => {
    const { planner } = makeApp();
    await planner('mom', 'PUT', '/years/2026/settings', {});
    await planner('mom', 'PUT', '/years/2026/items/todos/old', { title: 'old' });
    const backup = { settings: { name: 'Restored' }, collections: { todos: [{ id: 't1', title: 'Wrap' }], bogus: [{ id: 'z' }] } };
    expect(await planner('mom', 'POST', '/years/2026/import', backup)).toEqual({ status: 200, body: { ok: true } });
    const body = (await planner('mom', 'GET', '/years/2026')).body as any;
    expect(body.settings).toEqual({ name: 'Restored', year: 2026 });
    expect(body.collections).toEqual({ todos: [{ id: 't1', title: 'Wrap' }] });
  });

  it('validates the backup before touching anything', async () => {
    const { planner } = makeApp();
    await planner('mom', 'PUT', '/years/2026/settings', { name: 'Keep' });
    const bad = (body: unknown) => planner('mom', 'POST', '/years/2026/import', body);
    expect((await bad({ settings: 5 })).body).toEqual({ error: 'Invalid backup format' });
    expect((await bad({ collections: [] , settings: 'x' })).status).toBe(400);
    expect((await bad({ collections: { todos: 'nope' } })).body).toEqual({ error: 'Invalid items for todos' });
    expect((await bad({ collections: { todos: [{ id: 'ok' }, { title: 'no id' }] } })).body).toEqual({ error: 'Invalid item in todos' });
    expect((await bad({ collections: { todos: [{ id: 'bad id' }] } })).status).toBe(400);
    expect((await bad([])).status).toBe(400);
    expect(((await planner('mom', 'GET', '/years/2026')).body as any).settings.name).toBe('Keep');
  });

  it('allows up to 4 MB, and refuses more with 413', async () => {
    const { planner } = makeApp();
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'i' + i, note: 'x'.repeat(1000) }));
    expect((await planner('mom', 'POST', '/years/2026/import', { collections: { todos: items(100) } })).status).toBe(200);
    expect(((await planner('mom', 'GET', '/years/2026')).body as any).collections.todos).toHaveLength(100);
    expect((await planner('mom', 'POST', '/years/2026/import', { collections: { todos: items(4200) } })).status).toBe(413);
  });

  it('rejects an oversize item with 413 and leaves the existing year intact', async () => {
    const { planner } = makeApp();
    await planner('mom', 'PUT', '/years/2026/settings', { name: 'Keep' });
    await planner('mom', 'PUT', '/years/2026/items/todos/old', { title: 'old' });
    const res = await planner('mom', 'POST', '/years/2026/import', { collections: { todos: [{ id: 'a', title: 'ok' }, { id: 'big', note: 'x'.repeat(64 * 1024) }] } });
    expect(res.status).toBe(413);
    const body = (await planner('mom', 'GET', '/years/2026')).body as any;
    expect(body.settings.name).toBe('Keep');
    expect(body.collections.todos).toEqual([{ id: 'old', title: 'old' }]);
  });

  it('loses nothing when a write fails part-way through a replace', async () => {
    const mem = new MemoryDb();
    const store = plannerStore(mem, 'planner', () => new Date());
    await store.putSettings(2026, { name: 'Keep', year: 2026 }, 'm');
    await store.putItem(2026, 'todos', 'old1', { id: 'old1' }, 'm');
    await store.putItem(2026, 'todos', 'old2', { id: 'old2' }, 'm');
    let puts = 0;
    const flaky = Object.create(mem) as MemoryDb;
    flaky.put = async (t, item) => {
      if (++puts === 2) throw new Error('throttled');
      return mem.put(t, item);
    };
    await expect(plannerStore(flaky, 'planner', () => new Date()).replaceYear(2026, { name: 'New' }, { todos: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }] }, 'm')).rejects.toThrow('throttled');
    expect((await store.listItems(2026)).todos!.map((d) => d.id)).toEqual(expect.arrayContaining(['old1', 'old2']));
    expect(await store.getSettings(2026)).toEqual({ name: 'Keep', year: 2026 });
  });
});

describe('planner: hidden (surprise) gifts', () => {
  const setup = async () => {
    const app = makeApp();
    await app.planner('mom', 'PUT', '/years/2026/settings', {});
    await app.planner('mom', 'PUT', '/years/2026/items/gifts/g1', { idea: 'Ring', hidden: true });
    await app.planner('mom', 'PUT', '/years/2026/items/bday_gifts/b1', { idea: 'Book', hidden: true });
    return app;
  };
  const list = async (app: Awaited<ReturnType<typeof setup>>, who: 'mom' | 'dad') => ((await app.planner(who, 'GET', '/years/2026')).body as any).collections;

  it('stores hiddenBy server-side and shows it only to the hider', async () => {
    const app = await setup();
    const mine = await list(app, 'mom');
    expect(mine.gifts[0].hiddenBy).toBe('mom@example.com');
    expect(mine.gifts[0].hidden).toBeUndefined();
    expect(mine.bday_gifts).toHaveLength(1);
    const theirs = await list(app, 'dad');
    expect(theirs.gifts ?? []).toEqual([]);
    expect(theirs.bday_gifts ?? []).toEqual([]);
  });

  it('hides it from others for put, delete and check-price', async () => {
    const app = await setup();
    expect((await app.planner('dad', 'PUT', '/years/2026/items/gifts/g1', { idea: 'Overwrite' })).status).toBe(404);
    expect((await app.planner('dad', 'DELETE', '/years/2026/items/gifts/g1')).status).toBe(404);
    expect((await app.planner('dad', 'POST', '/years/2026/gifts/g1/check-price')).status).toBe(404);
    expect(((await list(app, 'mom')).gifts[0]).idea).toBe('Ring');
  });

  it('lets the hider unhide, and ignores a forged hiddenBy', async () => {
    const app = await setup();
    await app.planner('mom', 'PUT', '/years/2026/items/gifts/g1', { idea: 'Ring', hidden: false, hiddenBy: 'dad@example.com' });
    expect((await list(app, 'dad')).gifts[0].hiddenBy).toBeUndefined();
    await app.planner('dad', 'PUT', '/years/2026/items/gifts/g2', { idea: 'Tie', hidden: true, hiddenBy: 'mom@example.com' });
    expect((await list(app, 'mom')).gifts.map((g: any) => g.id)).toEqual(['g1']);
    expect((await list(app, 'dad')).gifts.find((g: any) => g.id === 'g2').hiddenBy).toBe('dad@example.com');
  });

  it("keeps another user's hidden gift through an import and drops forged hiddenBy", async () => {
    const app = await setup();
    const res = await app.planner('dad', 'POST', '/years/2026/import', {
      collections: { gifts: [{ id: 'g1', idea: 'Clobber' }, { id: 'g3', idea: 'Mug', hiddenBy: 'mom@example.com' }] },
    });
    expect(res.status).toBe(200);
    const mine = await list(app, 'mom');
    expect(mine.gifts.find((g: any) => g.id === 'g1').idea).toBe('Ring');
    expect(mine.bday_gifts).toHaveLength(1);
    expect(mine.gifts.find((g: any) => g.id === 'g3').hiddenBy).toBeUndefined();
  });

  it('emails a hidden gift price drop only to the hider', async () => {
    const app = await setup();
    app.pages.set('https://shop.test/a', '<meta property="product:price:amount" content="100">');
    await app.planner('dad', 'PUT', '/years/2026/items/gifts/g9', { idea: 'Watch', link: 'https://shop.test/a', priceTracker: { pct: 10 } });
    await app.planner('mom', 'PUT', '/years/2026/items/gifts/g9', { idea: 'Watch', link: 'https://shop.test/a', priceTracker: { pct: 10 }, hidden: true });
    await app.checkPrices();
    app.pages.set('https://shop.test/a', '<meta property="product:price:amount" content="50">');
    await app.checkPrices();
    expect(app.emails.map((e) => e.to)).toEqual(['mom@example.com']);
  });
});

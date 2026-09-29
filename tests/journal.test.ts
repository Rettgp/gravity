import { beforeEach, describe, expect, it } from 'vitest';
import { day, makeApp, type Who } from './helpers';

let app: ReturnType<typeof makeApp>;
let momPid: string;
let kidPid: string;

beforeEach(async () => {
  app = makeApp();
  momPid = ((await app.core('mom', 'GET', '/me')).body as any).defaultProfileId;
  await app.core('dad', 'GET', '/me');
  await app.core('teen', 'GET', '/me');
  kidPid = ((await app.core('mom', 'POST', '/profiles', { name: 'Kid', emoji: 'K', color: '#2fb67c', shareByDefault: false })).body as any).id;
});

const put = (who: Who, pid: string, date: string, body: unknown) => app.journal(who, 'PUT', '/profiles/' + pid + '/days/' + date, body);
const get = (who: Who, pid: string, date: string) => app.journal(who, 'GET', '/profiles/' + pid + '/days/' + date);
const list = (who: Who, pid: string, month: string) => app.journal(who, 'GET', '/profiles/' + pid + '/days', undefined, { month });
const feed = (who: Who, month: string) => app.journal(who, 'GET', '/shared', undefined, { month });
const meal = (t: string) => ({ breakfast: [{ text: t }], lunch: [], dinner: [], snacks: [] });

describe('journal days', () => {
  it('saves and reads a day, and the month summary flags unwell days', async () => {
    const meals = { breakfast: [{ text: 'Eggs' }], lunch: [], dinner: [{ text: 'Pasta' }], snacks: [] };
    const saved = await put('mom', momPid, '2026-09-10', day({ meals, unwell: true, symptoms: [{ name: 'nausea', severity: 4 }] }));
    expect(saved.status).toBe(200);
    const got = (await get('mom', momPid, '2026-09-10')).body as any;
    expect(got.unwell).toBe(true);
    expect(got.meals.dinner[0].text).toBe('Pasta');
    await put('mom', momPid, '2026-09-11', day());
    await put('mom', momPid, '2026-10-01', day({ unwell: true }));
    const month = (await list('mom', momPid, '2026-09')).body as any[];
    expect(month.map((d) => d.date)).toEqual(['2026-09-10', '2026-09-11']);
    expect(month[0]).toMatchObject({ unwell: true, mealCount: 2, symptomCount: 1 });
  });

  it('returns an empty day when nothing is logged', async () => {
    expect((await get('mom', momPid, '2026-09-12')).body).toMatchObject({ date: '2026-09-12', unwell: false, shared: false });
  });

  it('validates input and rejects bad dates', async () => {
    expect((await put('mom', momPid, '2026-09-10', { nope: 1 })).status).toBe(400);
    expect((await put('mom', momPid, 'yesterday', day())).status).toBe(400);
    expect((await put('mom', momPid, '2026-09-10', day({ symptoms: [{ name: 'x', severity: 9 }] }))).status).toBe(400);
  });

  it('detects concurrent edits with expectedUpdatedAt', async () => {
    const first = (await put('mom', momPid, '2026-09-10', day())).body as any;
    expect((await put('mom', momPid, '2026-09-10', { ...day(), expectedUpdatedAt: 'stale' })).status).toBe(409);
    expect((await put('mom', momPid, '2026-09-10', { ...day(), expectedUpdatedAt: first.updatedAt })).status).toBe(200);
  });

  it('deletes a day and its shared index entry', async () => {
    await put('mom', momPid, '2026-09-10', day({ unwell: true, shared: true }));
    expect((await app.journal('mom', 'DELETE', '/profiles/' + momPid + '/days/2026-09-10')).status).toBe(204);
    expect((await feed('mom', '2026-09')).body).toEqual([]);
  });
});

describe('journal privacy', () => {
  it('other family members cannot read, write, or list private days', async () => {
    await put('mom', momPid, '2026-09-10', day({ unwell: true, notes: 'private' }));
    expect((await get('dad', momPid, '2026-09-10')).status).toBe(404);
    expect((await put('dad', momPid, '2026-09-10', day())).status).toBe(404);
    expect((await list('dad', momPid, '2026-09')).body).toEqual([]);
    expect((await app.journal('dad', 'GET', '/profiles/' + momPid + '/foods')).status).toBe(404);
    expect((await app.journal('dad', 'GET', '/profiles/' + momPid + '/insights')).status).toBe(404);
    expect((await app.journal('dad', 'DELETE', '/profiles/' + momPid + '/days/2026-09-10')).status).toBe(404);
  });

  it('shared days are read-only for family and appear in the shared feed', async () => {
    await put('mom', momPid, '2026-09-10', day({ unwell: true, shared: true, symptoms: [{ name: 'cough', severity: 2 }], notes: 'n' }));
    await put('mom', momPid, '2026-09-11', day({ unwell: true }));
    expect(((await get('dad', momPid, '2026-09-10')).body as any).unwell).toBe(true);
    expect((await put('dad', momPid, '2026-09-10', day())).status).toBe(404);
    expect(((await list('dad', momPid, '2026-09')).body as any[]).map((d) => d.date)).toEqual(['2026-09-10']);
    expect((await feed('teen', '2026-09')).body).toEqual([{ profileId: momPid, date: '2026-09-10', unwell: true, symptomCount: 1 }]);
    await put('mom', momPid, '2026-09-10', day({ unwell: true, shared: false }));
    expect((await feed('teen', '2026-09')).body).toEqual([]);
  });

  it('a co-manager can log for a managed child, other adults cannot', async () => {
    await app.core('mom', 'POST', '/profiles/' + kidPid + '/managers', { email: 'dad@example.com' });
    expect((await put('dad', kidPid, '2026-09-10', day({ unwell: true }))).status).toBe(200);
    expect((await put('teen', kidPid, '2026-09-10', day())).status).toBe(404);
  });
});

describe('journal foods + insights', () => {
  it('lists distinct foods by frequency and finds suspects', async () => {
    await put('mom', momPid, '2026-09-01', day({ meals: meal('Milk') }));
    await put('mom', momPid, '2026-09-02', day({ meals: meal('Rice'), unwell: true }));
    await put('mom', momPid, '2026-09-03', day({ meals: meal('Oats') }));
    await put('mom', momPid, '2026-09-04', day({ meals: meal('Oats') }));
    await put('mom', momPid, '2026-09-05', day({ meals: meal('rice'), unwell: true }));
    await put('mom', momPid, '2026-09-06', day({ meals: meal('Oats') }));
    const foods = (await app.journal('mom', 'GET', '/profiles/' + momPid + '/foods')).body as any[];
    expect(foods[0]).toEqual({ food: 'oats', count: 3 });
    const q = { from: '2026-09-01', to: '2026-09-30' };
    const ins = (await app.journal('mom', 'GET', '/profiles/' + momPid + '/insights', undefined, q)).body as any;
    expect(ins.unwellDays).toBe(2);
    expect(ins.suspects[0].food).toBe('rice');
  });

  it('forgets a mistyped food across every day, only for managers', async () => {
    await put('mom', momPid, '2026-09-01', day({ meals: meal('Pizzaa') }));
    await put('mom', momPid, '2026-09-02', day({ meals: { ...meal('Rice'), lunch: [{ text: 'pizzaa ' }] } }));
    await put('mom', momPid, '2026-09-03', day({ meals: meal('Oats') }));
    const url = '/profiles/' + momPid + '/foods/remove';
    expect((await app.journal('dad', 'POST', url, { food: 'pizzaa' })).status).toBe(404);
    const res = await app.journal('mom', 'POST', url, { food: 'PIZZAA' });
    expect(res.body).toEqual({ daysChanged: 2 });
    const foods = (await app.journal('mom', 'GET', '/profiles/' + momPid + '/foods')).body as any[];
    expect(foods.map((f) => f.food).sort()).toEqual(['oats', 'rice']);
    expect(((await get('mom', momPid, '2026-09-02')).body as any).meals.breakfast[0].text).toBe('Rice');
    expect((await app.journal('mom', 'POST', url, { food: '' })).status).toBe(400);
  });

  it('removal is permanent and never errors, even when the food is on no day', async () => {
    const url = '/profiles/' + momPid + '/foods/remove';
    // Not on any day: still succeeds (idempotent) and is remembered as hidden.
    expect((await app.journal('mom', 'POST', url, { food: 'Ghost Pepper' })).body).toEqual({ daysChanged: 0 });
    expect((await app.journal('mom', 'POST', url, { food: 'ghost pepper' })).status).toBe(200);
    // Foods that only live in a day the person can no longer see also stay out after a later removal.
    await put('mom', momPid, '2026-01-05', day({ meals: meal('Bannana') }));
    await app.journal('mom', 'POST', '/profiles/' + momPid + '/foods/remove', { food: 'bannana' });
    let foods = (await app.journal('mom', 'GET', '/profiles/' + momPid + '/foods')).body as any[];
    expect(foods.map((f) => f.food)).not.toContain('bannana');
    // Logging it again on purpose brings it back.
    await put('mom', momPid, '2026-01-06', day({ meals: meal('Bannana') }));
    foods = (await app.journal('mom', 'GET', '/profiles/' + momPid + '/foods')).body as any[];
    expect(foods.map((f) => f.food)).toContain('bannana');
    // Hidden markers are per profile.
    await app.journal('mom', 'POST', url, { food: 'bannana' });
    await put('mom', kidPid, '2026-01-06', day({ meals: meal('Bannana') }));
    expect(((await app.journal('mom', 'GET', '/profiles/' + kidPid + '/foods')).body as any[]).map((f) => f.food)).toContain('bannana');
  });
});

import { describe, expect, it } from 'vitest';
import { feedbackSk } from '@gravity/shared/server';
import { makeApp } from './helpers';

const FB = { type: 'Bug', area: 'Meals', description: 'Tiles overlap on small screens' };
const NOW_MS = Date.parse('2026-09-28T12:00:00Z');

describe('feedback: access', () => {
  it('needs a signed-in, allowlisted family member for every route', async () => {
    const { core } = makeApp();
    for (const [m, p] of [['GET', '/feedback'], ['PUT', '/feedback/f1'], ['DELETE', '/feedback/f1']] as const) {
      expect((await core(null, m, p, {})).status, `${m} ${p}`).toBe(401);
      expect((await core('stranger', m, p, {})).status, `${m} ${p}`).toBe(403);
    }
  });
});

describe('feedback: items', () => {
  it('is shared between members; authorship and creation time stay server-side', async () => {
    const { core, db } = makeApp();
    expect(((await core('mom', 'GET', '/feedback')).body as any).items).toEqual([]);
    const first = await core('mom', 'PUT', '/feedback/f1', FB);
    expect(first.status).toBe(200);
    expect((first.body as any).item).toEqual({ ...FB, id: 'f1', done: false, doneAt: null, createdAt: NOW_MS, createdBy: 'Mom Jones' });
    expect(await db.get('core', 'FEEDBACK', feedbackSk('f1'))).toMatchObject({ doc: { id: 'f1' }, updatedBy: 'mom@example.com', updatedAt: Math.floor(NOW_MS / 1000) });
    const second = (await core('dad', 'PUT', '/feedback/f1', { ...FB, done: true, createdBy: 'spoofed', createdAt: 1 })).body as any;
    expect(second.item).toMatchObject({ done: true, doneAt: NOW_MS, createdAt: NOW_MS, createdBy: 'Mom Jones' });
    expect(((await core('mom', 'PUT', '/feedback/f1', { ...FB, done: false })).body as any).item.doneAt).toBeNull();
    expect(((await core('dad', 'GET', '/feedback')).body as any).items).toHaveLength(1);
    expect(await core('dad', 'DELETE', '/feedback/f1')).toEqual({ status: 200, body: { ok: true } });
    expect(((await core('mom', 'GET', '/feedback')).body as any).items).toEqual([]);
  });

  it('lists newest first', async () => {
    const { core, db } = makeApp();
    await core('mom', 'PUT', '/feedback/a', FB);
    const row = (await db.get('core', 'FEEDBACK', 'F#a'))!;
    await db.put('core', { ...row, sk: 'F#b', doc: { ...(row.doc as object), id: 'b', createdAt: NOW_MS + 5 } });
    expect(((await core('mom', 'GET', '/feedback')).body as any).items.map((i: any) => i.id)).toEqual(['b', 'a']);
  });

  it('keeps originalArea and occasion from the stored item, and never accepts them from the client', async () => {
    const { core, db } = makeApp();
    const spoof = { ...FB, originalArea: 'Hacked', occasion: 'Birthday' };
    const fresh = (await core('mom', 'PUT', '/feedback/f1', spoof)).body as any;
    expect(fresh.item).not.toHaveProperty('originalArea');
    expect(fresh.item).not.toHaveProperty('occasion');
    await db.put('core', { pk: 'FEEDBACK', sk: 'F#old', doc: { ...FB, id: 'old', done: false, createdAt: 5, createdBy: 'Old', doneAt: null, area: 'Planner', originalArea: 'Gift Planner', occasion: 'Both' }, updatedBy: 'x', updatedAt: 1 });
    const kept = (await core('dad', 'PUT', '/feedback/old', { ...FB, area: 'Planner', done: true, originalArea: 'Nope', occasion: 'Christmas' })).body as any;
    expect(kept.item).toMatchObject({ originalArea: 'Gift Planner', occasion: 'Both', createdAt: 5, createdBy: 'Old', done: true });
  });

  it('validates input', async () => {
    const { core } = makeApp();
    const put = (body: unknown, id = 'f1') => core('mom', 'PUT', '/feedback/' + id, body);
    expect((await put({ ...FB, description: '   ' })).body).toEqual({ error: 'Description is required' });
    expect((await put({ ...FB, description: 'x'.repeat(2001) })).status).toBe(400);
    expect((await put({ ...FB, description: 'x'.repeat(2000) })).status).toBe(200);
    expect((await put({ ...FB, type: 'Complaint' })).body).toEqual({ error: 'Type must be Feature or Bug' });
    expect((await put({ ...FB, area: '' })).body).toEqual({ error: 'Choose a section of the app' });
    expect((await put({ ...FB, area: '   ' })).status).toBe(400);
    expect((await put({ ...FB, area: 7 })).status).toBe(400);
    expect((await put({ ...FB, area: 'x'.repeat(41) })).status).toBe(400);
    const ok = (await put({ ...FB, area: '  ' + 'x'.repeat(40) + '  ' })).body as any;
    expect(ok.item.area).toBe('x'.repeat(40));
    expect((await put(FB, 'bad id!')).status).toBe(400);
    expect((await put(FB, 'x'.repeat(65))).status).toBe(400);
    expect((await put([1])).status).toBe(400);
    expect((await put(undefined)).status).toBe(400);
  });
});

import { describe, expect, it } from 'vitest';
import type { DaySection, TripMeta } from '@gravity/shared';
import { formatMoney, groupTrips, mergeSections, parseAmount, retryDelay, tokenizeRich, tripWhen, whatsNext } from './logic';

const meta = (o: Partial<TripMeta> = {}): TripMeta => ({
  id: 't', name: 'T', eyebrow: '', destination: 'Somewhere', startDate: '2026-03-30', endDate: '2026-04-02', checkIn: '2026-03-30T16:00', checkOut: '2026-04-02T10:30', tz: 'America/Chicago', createdBy: 'x', createdAt: '', ...o,
});
const ev = (title: string, at?: string, until?: string) => ({ id: title, time: '', at, until, title, body: '', meta: [], anchor: false, reminders: [] });
const day = (...events: ReturnType<typeof ev>[]): DaySection => ({ title: 'D', navLabel: 'D', color: 'var(--green)', events, notes: [], cards: [] });
const days = { '2026-03-31': day(ev('Breakfast', '08:00'), ev('Museum', '09:00', '11:00'), ev('Free time')), '2026-04-01': day(ev('Show', '19:00')) };
const tbd = [{ label: 'Tickets', value: 'unsure', tbd: true }];

describe('tokenizeRich', () => {
  it('splits text, bold and links', () => {
    expect(tokenizeRich('a **b** [c](https://x.test/y) d')).toEqual([
      { t: 'text', v: 'a ' }, { t: 'bold', v: 'b' }, { t: 'text', v: ' ' }, { t: 'link', label: 'c', href: 'https://x.test/y' }, { t: 'text', v: ' d' },
    ]);
  });
  it('accepts tel and mailto but never other schemes, and leaves tags as plain text', () => {
    expect(tokenizeRich('[call](tel:+15550100)')[0]).toMatchObject({ t: 'link' });
    expect(tokenizeRich('[x](mailto:a@b.test)')[0]).toMatchObject({ t: 'link' });
    expect(tokenizeRich('[x](javascript:alert(1))')).toEqual([{ t: 'text', v: 'x' }, { t: 'text', v: ')' }]);
    expect(tokenizeRich('<b>hi</b>')).toEqual([{ t: 'text', v: '<b>hi</b>' }]);
    expect(tokenizeRich('')).toEqual([]);
  });
});

describe('whatsNext', () => {
  it('before: counts calendar days across a month boundary and shows tbd rows only within 7 days', () => {
    const far = whatsNext(meta(), days, tbd, new Date('2026-03-20T12:00:00'));
    expect(far).toEqual({ kind: 'before', days: 10, todo: [] });
    expect(whatsNext(meta(), days, tbd, new Date('2026-03-25T09:00:00'))).toEqual({ kind: 'before', days: 5, todo: tbd });
    expect(whatsNext(meta({ startDate: '2026-04-02', endDate: '2026-04-05', checkIn: '2026-04-02T16:00' }), days, tbd, new Date('2026-03-31T12:00:00'))).toMatchObject({ days: 2 });
  });
  it('during with a current event', () => {
    const n = whatsNext(meta(), days, tbd, new Date('2026-03-31T09:30:00'));
    expect(n).toMatchObject({ kind: 'during', date: '2026-03-31', current: { title: 'Museum' } });
  });
  it('during with only a next event, ignoring events without a time of day', () => {
    const n = whatsNext(meta(), days, tbd, new Date('2026-03-31T12:00:00'));
    expect(n).toMatchObject({ kind: 'during', date: '2026-04-01', next: { title: 'Show' } });
    const none = whatsNext(meta(), { '2026-03-31': day(ev('Free time')) }, tbd, new Date('2026-03-31T12:00:00'));
    expect(none).toEqual({ kind: 'during', date: '2026-03-31', current: undefined, next: undefined });
  });
  it('after', () => {
    expect(whatsNext(meta(), days, tbd, new Date('2026-04-02T11:00:00'))).toEqual({ kind: 'after' });
  });
});

describe('groupTrips / tripWhen', () => {
  const a = meta({ id: 'a', startDate: '2026-05-01', endDate: '2026-05-03' });
  const b = meta({ id: 'b', startDate: '2026-03-01', endDate: '2026-03-03' });
  const c = meta({ id: 'c', startDate: '2026-04-10', endDate: '2026-04-20' });
  const d = meta({ id: 'd', startDate: '2026-06-01', endDate: '2026-06-02' });
  it('splits into now, upcoming (soonest first) and past', () => {
    const g = groupTrips([d, a, b, c], '2026-04-12');
    expect(g.now.map((t) => t.id)).toEqual(['c']);
    expect(g.upcoming.map((t) => t.id)).toEqual(['a', 'd']);
    expect(g.past.map((t) => t.id)).toEqual(['b']);
  });
  it('labels', () => {
    expect(tripWhen(c, '2026-04-12')).toBe('Day 3 of 11');
    expect(tripWhen(b, '2026-04-12')).toBe('Completed');
    expect(tripWhen(a, '2026-04-30')).toBe('Tomorrow');
    expect(tripWhen(a, '2026-04-12')).toBe('In 19 days');
  });
});

describe('money', () => {
  it('parses loosely and formats currency', () => {
    expect(parseAmount('$1,200.50')).toBe(1200.5);
    expect(parseAmount('abc')).toBe(0);
    expect(formatMoney(1234.5)).toBe('$1,234.50');
  });
});

describe('mergeSections', () => {
  const sec = (rev: number, v = 'x') => ({ rev, data: v });
  const never = () => false;
  it('keeps the cached section when the server copy is older, takes equal or newer', () => {
    const cached = { a: sec(4, 'mine'), b: sec(4, 'mine'), c: sec(4, 'mine') };
    const fresh = { a: sec(3, 'old'), b: sec(4, 'srv'), c: sec(5, 'new') };
    expect(mergeSections(cached, fresh, never)).toEqual({ a: sec(4, 'mine'), b: sec(4, 'srv'), c: sec(5, 'new') });
  });
  it('keeps a busy section whatever its rev, and only merges sections present on both sides', () => {
    expect(mergeSections({ a: sec(1, 'mine'), gone: sec(9) }, { a: sec(2, 'srv'), added: sec(1) }, (k) => k === 'a')).toEqual({ a: sec(1, 'mine'), added: sec(1) });
    expect(mergeSections(undefined, { a: sec(1) }, never)).toEqual({ a: sec(1) });
  });
});

describe('retryDelay', () => {
  it('backs off 2 s, 5 s, 15 s, then every 30 s', () => {
    expect([1, 2, 3, 4, 9].map(retryDelay)).toEqual([2000, 5000, 15000, 30000, 30000]);
  });
});

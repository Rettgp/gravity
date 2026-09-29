import { describe, expect, it } from 'vitest';
import { addDays, canManage, canReadDay, computeInsights, emptyDay, isAllowed, type Day } from '@gravity/shared';

const mk = (date: string, foods: string[], unwell = false, symptoms: string[] = []): Day => ({
  ...emptyDay(date),
  meals: { breakfast: foods.map((text) => ({ text })), lunch: [], dinner: [], snacks: [] },
  unwell,
  symptoms: symptoms.map((name) => ({ name, severity: 3 })),
});

describe('computeInsights', () => {
  it('ranks a food eaten right before unwell days as a suspect', () => {
    const days = [
      mk('2026-09-01', ['Milk', 'Toast']),
      mk('2026-09-02', ['Rice'], true, ['nausea']),
      mk('2026-09-03', ['Eggs']),
      mk('2026-09-04', ['Eggs']),
      mk('2026-09-05', ['Oats']),
      mk('2026-09-06', ['Rice'], true, ['nausea', 'headache']),
      mk('2026-09-07', ['Toast']),
      mk('2026-09-08', ['Toast']),
    ];
    const r = computeInsights(days);
    expect(r.loggedDays).toBe(8);
    expect(r.unwellDays).toBe(2);
    expect(r.suspects[0]?.food).toBe('rice');
    expect(r.suspects[0]?.lift).toBeGreaterThan(1.5);
    expect(r.suspects[0]?.dates).toEqual(['2026-09-02', '2026-09-06']);
    expect(r.symptoms[0]).toEqual({ name: 'nausea', count: 2 });
    expect(r.suspects.find((s) => s.food === 'eggs')).toBeUndefined();
  });

  it('counts a food eaten the day before (0-48h window)', () => {
    const filler = ['03', '04', '05', '06', '07', '15', '16', '20'].map((d) => mk('2026-09-' + d, ['Oats']));
    const days = [mk('2026-09-01', ['Shrimp']), mk('2026-09-02', [], true), mk('2026-09-10', ['Shrimp']), mk('2026-09-11', [], true), ...filler];
    expect(computeInsights(days).suspects.map((s) => s.food)).toContain('shrimp');
  });

  it('needs at least 2 unwell occurrences and returns nothing when never unwell', () => {
    expect(computeInsights([mk('2026-09-01', ['a']), mk('2026-09-02', ['b'])]).suspects).toEqual([]);
    expect(computeInsights([mk('2026-09-01', ['a'], true), mk('2026-09-05', ['b'])]).suspects).toEqual([]);
    expect(computeInsights([]).loggedDays).toBe(0);
  });
});

describe('dates + access', () => {
  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('allowlist is case-insensitive and rejects empties', () => {
    expect(isAllowed('Mom@Example.com', ['mom@example.com'])).toBe(true);
    expect(isAllowed(undefined, ['a@b.c'])).toBe(false);
    expect(isAllowed('x@y.z', [])).toBe(false);
  });
  it('owner/manager can read+write, others only read shared days', () => {
    const p = { managers: ['a', 'b'] };
    expect(canManage(p, 'a')).toBe(true);
    expect(canManage(p, 'z')).toBe(false);
    expect(canReadDay(p, 'z', false)).toBe(false);
    expect(canReadDay(p, 'z', true)).toBe(true);
  });
});

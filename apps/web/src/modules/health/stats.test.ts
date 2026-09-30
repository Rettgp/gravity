import { describe, expect, it } from 'vitest';
import { HOUR_STEPS, avgOver, daySpan, monthsBetween, niceTicks, pointsOf, summarize, unwellSplit, usualOf, type Point } from './stats';

const series = (from: string, values: (number | undefined)[]): Point[] =>
  values.flatMap((v, i) => {
    if (v === undefined) return [];
    const d = new Date(Date.parse(from + 'T12:00:00Z') + i * 86_400_000).toISOString().slice(0, 10);
    return [{ date: d, value: v }];
  });

describe('health stats', () => {
  it('pointsOf keeps only days with a number inside the window, oldest first', () => {
    const days = [
      { date: '2026-09-03', restingHr: 64 },
      { date: '2026-09-01', restingHr: 62 },
      { date: '2026-09-02' },
      { date: '2026-08-01', restingHr: 99 },
    ];
    expect(pointsOf(days, 'restingHr', '2026-09-01', '2026-09-30')).toEqual([
      { date: '2026-09-01', value: 62 },
      { date: '2026-09-03', value: 64 },
    ]);
  });

  it('usualOf needs a week of data before it says what is normal, and ignores the last 7 days', () => {
    const to = '2026-09-28';
    const older = series('2026-08-25', Array(28).fill(60).map((v, i) => v + (i % 3)));
    const recent = series('2026-09-22', Array(7).fill(90));
    const u = usualOf([...older, ...recent], to)!;
    expect(u.n).toBeGreaterThanOrEqual(7);
    expect(u.mean).toBeLessThan(62);
    expect(usualOf(series('2026-09-15', [60, 61, 62]), to)).toBeUndefined();
  });

  it('summarize: latest, averages, extremes with their dates, and the change from usual', () => {
    const to = '2026-09-28';
    const all = [...series('2026-08-25', Array(28).fill(60)), ...series('2026-09-22', [66, 66, 66, 66, 66, 66, 66])];
    const range = all.filter((p) => p.date >= '2026-09-15');
    const s = summarize(all, range, to, 14);
    expect(s.latest).toEqual({ date: '2026-09-28', value: 66 });
    expect(s.avg7).toBe(66);
    expect(s.usual!.mean).toBe(60);
    expect(s.diff).toBe(6);
    expect(s.min!.value).toBe(60);
    expect(s.max!.value).toBe(66);
    expect(s.count).toBe(range.length);
    expect(s.span).toBe(14);
  });

  it('summarize is honest when data is thin', () => {
    const s = summarize(series('2026-09-27', [61, 62]), series('2026-09-27', [61, 62]), '2026-09-28', 30);
    expect(s.avg7).toBeUndefined(); // needs 3 recent days
    expect(s.avg30).toBeUndefined(); // needs 7
    expect(s.usual).toBeUndefined();
    expect(s.diff).toBeUndefined();
    expect(s.latest!.value).toBe(62);
    expect(summarize([], [], '2026-09-28', 7)).toMatchObject({ count: 0, latest: undefined, min: undefined });
  });

  it('avgOver requires a minimum number of days', () => {
    const p = series('2026-09-20', [10, 20, 30]);
    expect(avgOver(p, '2026-09-20', '2026-09-22', 3)).toBe(20);
    expect(avgOver(p, '2026-09-20', '2026-09-22', 4)).toBeUndefined();
  });

  it('unwellSplit compares unwell days with the rest, only when both sides have enough days', () => {
    const p = series('2026-09-01', [60, 60, 60, 70, 70, 70, 60, 60]);
    const unwell = new Set(['2026-09-04', '2026-09-05', '2026-09-06']);
    expect(unwellSplit(p, unwell)).toEqual({ unwellDays: 3, unwellMean: 70, otherDays: 5, otherMean: 60 });
    expect(unwellSplit(p, new Set(['2026-09-04']))).toBeUndefined();
    expect(unwellSplit(p, new Set(p.map((x) => x.date)))).toBeUndefined();
  });

  it('niceTicks gives round gridlines covering the data', () => {
    const t = niceTicks(58.3, 71.9);
    expect(t.ticks[0]).toBeLessThanOrEqual(58.3);
    expect(t.ticks[t.ticks.length - 1]).toBeGreaterThanOrEqual(71.9);
    expect(t.ticks.length).toBeGreaterThanOrEqual(3);
    expect(t.ticks.length).toBeLessThanOrEqual(8);
    expect(t.ticks.every((x) => Number.isInteger(x * 2))).toBe(true); // steps of 1, 2, 2.5 or 5
    expect(niceTicks(0, 11500).ticks).toEqual([0, 2500, 5000, 7500, 10000, 12500]);
    const flat = niceTicks(5, 5);
    expect(flat.min).toBeLessThan(5);
    expect(flat.max).toBeGreaterThan(5);
  });

  it('niceTicks can step in whole hours for time axes', () => {
    expect(niceTicks(0, 9.4, 5, HOUR_STEPS).ticks).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(0, 3.1, 5, HOUR_STEPS).ticks).toEqual([0, 1, 2, 3, 4]);
    expect(niceTicks(0, 13, 5, HOUR_STEPS).ticks.every((t) => Number.isInteger(t))).toBe(true);
  });

  it('monthsBetween and daySpan', () => {
    expect(monthsBetween('2025-11-20', '2026-02-03')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthsBetween('2026-09-01', '2026-09-30')).toEqual(['2026-09']);
    expect(daySpan('2026-09-01', '2026-09-30')).toBe(30);
    expect(daySpan('2026-09-28', '2026-09-28')).toBe(1);
  });
});

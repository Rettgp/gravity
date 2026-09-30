import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, computeBodySignals, computeHeadsUp, emptyDay, type Day, type HealthDay } from '@gravity/shared';
import { day, makeApp } from './helpers';

// Deterministic small wobble so "normal" days are not identical (a zero spread would hide everything).
const wobble = (i: number, amp = 1) => ((i * 7) % 5) - 2 === 0 ? 0 : (((i * 7) % 5) - 2) * (amp / 2);

/** 60 days ending 2026-09-28. Every 6th day is unwell: resting HR up, HRV and sleep down, and a bit worse the day before. */
function scenario() {
  const end = '2026-09-28';
  const journal: Day[] = [];
  const health: HealthDay[] = [];
  const unwellIdx = new Set<number>();
  for (let i = 5; i < 60; i += 6) unwellIdx.add(i);
  for (let i = 0; i < 60; i++) {
    const date = addDays(end, i - 59);
    const d = emptyDay(date);
    d.meals.dinner = [{ text: i % 2 ? 'Pasta' : 'Rice' }];
    d.unwell = unwellIdx.has(i);
    journal.push(d);
    const before = unwellIdx.has(i + 1);
    health.push({
      date,
      restingHr: 62 + wobble(i) + (d.unwell ? 6 : before ? 3 : 0),
      hrv: 45 + wobble(i + 1, 3) - (d.unwell ? 10 : before ? 5 : 0),
      sleepMinutes: 420 + wobble(i + 2, 20) - (d.unwell ? 60 : 0),
      steps: 7000 + wobble(i + 3, 900) - (d.unwell ? 2500 : 0),
      breathing: 15 + wobble(i + 4, 0.4),
    });
  }
  return { journal, health, unwellDates: journal.filter((d) => d.unwell).map((d) => d.date) };
}

describe('body signals', () => {
  it('finds numbers that differ on unwell days, and already on the day before', () => {
    const { journal, health, unwellDates } = scenario();
    const r = computeBodySignals(journal, health);
    const keys = r.signals.map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(['restingHr', 'hrv', 'sleepMinutes', 'steps']));
    expect(keys).not.toContain('breathing'); // just noise
    const rhr = r.signals.find((s) => s.key === 'restingHr')!;
    expect(rhr.diff).toBeGreaterThan(4);
    expect(rhr.unwellDays).toBe(unwellDates.length);
    expect(rhr.consistent).toBe(unwellDates.length);
    expect(rhr.dayBefore).toMatchObject({ days: unwellDates.length });
    expect(rhr.dayBefore!.diff).toBeGreaterThan(1.5);
    expect(r.signals.find((s) => s.key === 'hrv')!.diff).toBeLessThan(-6);
    // Sorted by how big the difference is relative to normal wobble.
    const effects = r.signals.map((s) => Math.abs(s.effect));
    expect(effects).toEqual([...effects].sort((a, b) => b - a));
    expect(r.coverage).toEqual({ healthDays: 60, unwellDaysWithData: unwellDates.length });
  });

  it('ignores an average that a few extreme days are dragging', () => {
    const { journal, health, unwellDates } = scenario();
    // Same average shift in resting HR, but concentrated in 2 of the unwell days; the rest look normal.
    const skewed = health.map((h) => (unwellDates.includes(h.date) ? { ...h, restingHr: 62 } : h));
    skewed.filter((h) => unwellDates.includes(h.date)).slice(0, 2).forEach((h) => (h.restingHr = 62 + 6 * (unwellDates.length / 2)));
    expect(computeBodySignals(journal, skewed).signals.map((s) => s.key)).not.toContain('restingHr');
  });

  it('says nothing when there are too few unwell days or no real difference', () => {
    const { journal, health } = scenario();
    const fewUnwell = journal.map((d, i) => ({ ...d, unwell: i === 5 || i === 11 }));
    expect(computeBodySignals(fewUnwell, health).signals).toEqual([]);
    const flat = health.map((h, i) => ({ ...h, restingHr: 62 + wobble(i), hrv: 45 + wobble(i, 3), sleepMinutes: 420 + wobble(i, 20), steps: 7000 + wobble(i, 900) }));
    expect(computeBodySignals(journal, flat).signals).toEqual([]);
  });

  it('does not count a day-before that was itself unwell', () => {
    const { journal, health } = scenario();
    const twoDay = journal.map((d) => ({ ...d }));
    // Make every unwell day part of a two-day illness: the "day before" of the second day is unwell, so it is skipped.
    for (const d of journal.filter((x) => x.unwell)) {
      const next = twoDay.find((x) => x.date === addDays(d.date, 1));
      if (next) next.unwell = true;
    }
    const rhr = computeBodySignals(twoDay, health, { minConsistent: 0 }).signals.find((s) => s.key === 'restingHr');
    // Only the first day of each two-day illness has a healthy day before it: 10 of the 19 unwell days.
    expect(twoDay.filter((d) => d.unwell)).toHaveLength(19);
    expect(rhr?.dayBefore?.days).toBe(10);
  });

  it('flags foods that are followed by a worse next morning', () => {
    const { journal, health } = scenario();
    // Pizza on 6 non-unwell days; the next morning HRV is clearly lower.
    const picks = [6, 7, 12, 13, 19, 20]; // none of these (or the day after) is an unwell day
    for (const i of picks) {
      journal[i]!.meals.dinner = [{ text: 'Pizza' }];
      health[i + 1]!.hrv = 30;
    }
    const foods = computeBodySignals(journal, health).foods;
    const pizza = foods.find((f) => f.food === 'pizza' && f.key === 'hrv');
    expect(pizza).toBeDefined();
    expect(pizza!.diff).toBeLessThan(-8);
    expect(pizza!.exposedDays).toBe(picks.length);
    expect(foods.some((f) => f.food === 'pasta' || f.food === 'rice')).toBe(false);
  });

  it('needs enough body data before doing any of this', () => {
    const { journal, health } = scenario();
    expect(computeBodySignals(journal, health.slice(-6))).toMatchObject({ signals: [], foods: [] });
    expect(computeBodySignals([], [])).toEqual({ coverage: { healthDays: 0, unwellDaysWithData: 0 }, signals: [], foods: [] });
  });
});

describe('early heads-up', () => {
  const base = (): HealthDay[] =>
    Array.from({ length: 30 }, (_, i) => ({ date: addDays('2026-09-28', i - 29), restingHr: 62 + wobble(i), hrv: 45 + wobble(i + 1, 3), skinTempC: 32 + wobble(i + 2, 0.2) }));

  it('speaks up when two or more numbers are outside your normal', () => {
    const days = base();
    days[29] = { ...days[29]!, restingHr: 69, hrv: 36 };
    const r = computeHeadsUp(days, '2026-09-28');
    expect(r.map((s) => s.key).sort()).toEqual(['hrv', 'restingHr']);
    expect(r.find((s) => s.key === 'restingHr')!.diff).toBeGreaterThan(5);
  });

  it('stays quiet for one odd number, a normal week, too little history, or the "good" direction', () => {
    const one = base();
    one[29] = { ...one[29]!, restingHr: 70 };
    expect(computeHeadsUp(one, '2026-09-28')).toEqual([]);
    expect(computeHeadsUp(base(), '2026-09-28')).toEqual([]);
    expect(computeHeadsUp(base().slice(-8), '2026-09-28')).toEqual([]);
    const better = base();
    better[29] = { ...better[29]!, restingHr: 55, hrv: 60 };
    expect(computeHeadsUp(better, '2026-09-28')).toEqual([]);
  });

  it('uses a value from yesterday if today has not synced yet, but not older ones', () => {
    const days = base();
    days[28] = { ...days[28]!, restingHr: 69, hrv: 36 };
    days.pop();
    expect(computeHeadsUp(days, '2026-09-28')).toHaveLength(2);
    expect(computeHeadsUp(days, '2026-09-30')).toEqual([]);
  });
});

describe('journal body routes', () => {
  let app: ReturnType<typeof makeApp>;
  let momPid: string;

  beforeEach(async () => {
    app = makeApp();
    momPid = ((await app.core('mom', 'GET', '/me')).body as any).defaultProfileId;
    await app.core('dad', 'GET', '/me');
    await app.db.put('health', { pk: `PROFILE#${momPid}`, sk: 'DAY#2026-09-20', date: '2026-09-20', restingHr: 63, sleepMinutes: 430, syncedAt: 'x' });
  });

  it('returns the day\'s numbers without storage fields, or null', async () => {
    const r = await app.journal('mom', 'GET', `/profiles/${momPid}/body/2026-09-20`);
    expect(r.body).toEqual({ date: '2026-09-20', restingHr: 63, sleepMinutes: 430 });
    expect((await app.journal('mom', 'GET', `/profiles/${momPid}/body/2026-09-21`)).body).toBeNull();
  });

  it('is private to the profile manager, even when the journal day is shared with the family', async () => {
    await app.journal('mom', 'PUT', `/profiles/${momPid}/days/2026-09-20`, day({ unwell: true, shared: true }));
    expect((await app.journal('dad', 'GET', `/profiles/${momPid}/days/2026-09-20`)).status).toBe(200); // the shared day itself is visible
    expect((await app.journal('dad', 'GET', `/profiles/${momPid}/body/2026-09-20`)).status).toBe(404);
    expect((await app.journal('dad', 'GET', `/profiles/${momPid}/body-signals`)).status).toBe(404);
    expect((await app.journal('mom', 'GET', `/profiles/${momPid}/body-signals`)).status).toBe(200);
    expect((await app.journal(null, 'GET', `/profiles/${momPid}/body/2026-09-20`)).status).toBe(401);
    expect((await app.journal('stranger', 'GET', `/profiles/${momPid}/body-signals`)).status).toBe(403);
    // Nothing health-related leaks into the shared family feed.
    expect(JSON.stringify((await app.journal('dad', 'GET', '/shared', undefined, { month: '2026-09' })).body)).not.toMatch(/restingHr|sleep/);
  });

  it('body signals are computed from the journal plus stored health days', async () => {
    const { journal, health } = scenario();
    for (const d of journal) await app.journal('mom', 'PUT', `/profiles/${momPid}/days/${d.date}`, day({ meals: d.meals, unwell: d.unwell }));
    for (const h of health) await app.db.put('health', { pk: `PROFILE#${momPid}`, sk: `DAY#${h.date}`, ...h });
    const r = (await app.journal('mom', 'GET', `/profiles/${momPid}/body-signals`)).body as any;
    expect(r.signals.map((s: any) => s.key)).toContain('restingHr');
    expect(r.coverage.healthDays).toBe(60);
  });
});

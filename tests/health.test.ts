import { beforeEach, describe, expect, it } from 'vitest';
import {
  civilDate,
  compareToUsual,
  num,
  parseHrv,
  parseRestingHr,
  parseSkinTemp,
  parseSleep,
  parseSpo2,
  parseStepsRollup,
  type HealthDay,
  type HealthLink,
} from '@gravity/shared/server';
import { makeApp, type Who } from './helpers';

// ---- Recorded Google Health API responses (trimmed), so the parsers are checked against the real shapes ------------
const sleepFull = {
  sleep: {
    interval: { startUtcOffset: '-14400s', endUtcOffset: '-14400s', startTime: '2025-02-05T17:42:00Z', endTime: '2025-02-05T21:05:30Z' },
    summary: {
      stagesSummary: [
        { count: '3', minutes: '8', type: 'AWAKE' },
        { count: '25', minutes: '117', type: 'LIGHT' },
        { count: '10', minutes: '22', type: 'DEEP' },
        { count: '14', minutes: '56', type: 'REM' },
      ],
      minutesInSleepPeriod: '203',
      minutesAsleep: '195',
      minutesAwake: '8',
    },
    type: 'STAGES',
    metadata: { mainSleep: true, processed: true, stagesStatus: 'SUCCEEDED' },
  },
  dataSource: { device: { displayName: 'Charge 6' }, recordingMethod: 'DERIVED', platform: 'FITBIT' },
};
const sleepClassicNap = {
  sleep: {
    interval: { startUtcOffset: '-18000s', endUtcOffset: '-18000s', startTime: '2025-08-18T01:43:00Z', endTime: '2025-08-18T03:05:30Z' },
    summary: {
      stagesSummary: [
        { count: '5', minutes: '16', type: 'RESTLESS' },
        { count: '5', minutes: '66', type: 'ASLEEP' },
      ],
      minutesInSleepPeriod: '82',
      minutesAsleep: '66',
      minutesAwake: '16',
    },
    type: 'CLASSIC',
    metadata: { mainSleep: true, nap: true, processed: true, stagesStatus: 'REJECTED_NAP' },
  },
};

describe('health parsing (recorded Google responses)', () => {
  it('reads numbers that arrive as strings and treats "NaN" as missing', () => {
    expect(num('73')).toBe(73);
    expect(num(11.207)).toBe(11.207);
    expect(num('NaN')).toBeUndefined();
    expect(num(undefined)).toBeUndefined();
    expect(num('')).toBeUndefined();
    expect(civilDate({ year: 2026, month: 9, day: 5 })).toBe('2026-09-05');
    expect(civilDate({})).toBeUndefined();
  });

  it('steps rollup: one entry per day, count as a string', () => {
    const days = parseStepsRollup({
      rollupDataPoints: [
        { civilStartTime: { date: { year: 2026, month: 9, day: 29 }, time: {} }, steps: { countSum: '3527' } },
        { civilStartTime: { date: { year: 2026, month: 9, day: 28 }, time: {} }, steps: { countSum: '6323' } },
      ],
    });
    expect(days.get('2026-09-29')).toEqual({ steps: 3527 });
    expect(days.get('2026-09-28')).toEqual({ steps: 6323 });
  });

  it('resting heart rate, HRV, SpO2 and skin temperature (with NaN baseline)', () => {
    expect(
      parseRestingHr({ dataPoints: [{ dailyRestingHeartRate: { date: { year: 2026, month: 9, day: 29 }, beatsPerMinute: '73' } }] }).get('2026-09-29'),
    ).toEqual({ restingHr: 73 });
    expect(
      parseHrv({
        dataPoints: [{ dailyHeartRateVariability: { date: { year: 2025, month: 2, day: 5 }, deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 11.207, nonRemHeartRateBeatsPerMinute: '101' } }],
      }).get('2025-02-05'),
    ).toEqual({ hrv: 11.207 });
    expect(
      parseSpo2({
        dataPoints: [{ dailyOxygenSaturation: { date: { year: 2026, month: 8, day: 5 }, upperBoundPercentage: 99.1, averagePercentage: 96.4, lowerBoundPercentage: 94.6 } }],
      }).get('2026-08-05'),
    ).toEqual({ spo2: 96.4, spo2Low: 94.6 });
    const temp = parseSkinTemp({
      dataPoints: [
        { dailySleepTemperatureDerivations: { date: { year: 2025, month: 2, day: 5 }, nightlyTemperatureCelsius: 32.10294117647059, baselineTemperatureCelsius: 'NaN', relativeNightlyStddev30dCelsius: 'NaN' } },
        { dailySleepTemperatureDerivations: { date: { year: 2025, month: 2, day: 6 }, nightlyTemperatureCelsius: 32.5, baselineTemperatureCelsius: 32.2 } },
      ],
    });
    expect(temp.get('2025-02-05')).toEqual({ skinTempC: 32.1 });
    expect(temp.get('2025-02-06')).toEqual({ skinTempC: 32.5, skinTempDelta: 0.3 });
  });

  it('sleep: belongs to the wake-up day in local time, with stages and clock times', () => {
    const d = parseSleep({ dataPoints: [sleepFull] }).get('2025-02-05')!;
    expect(d).toMatchObject({ sleepMinutes: 195, sleepAwakeMin: 8, sleepDeepMin: 22, sleepLightMin: 117, sleepRemMin: 56 });
    expect(d.bedtime).toBe('13:42'); // 17:42Z at UTC-4
    expect(d.wakeTime).toBe('17:05');
  });

  it('sleep: a session Google flags as a nap and rejects for stages is skipped only when it is not the main sleep', () => {
    // Recorded example carries BOTH mainSleep and nap: it still counts (classic sleep has no stage breakdown).
    const d = parseSleep({ dataPoints: [sleepClassicNap] }).get('2025-08-17')!;
    expect(d.sleepMinutes).toBe(66);
    expect(d.sleepDeepMin).toBeUndefined();
    const pure = structuredClone(sleepClassicNap);
    (pure.sleep.metadata as any).mainSleep = false;
    expect(parseSleep({ dataPoints: [pure] }).size).toBe(0);
  });

  it('sleep: the same night reported by two sources counts once', () => {
    const phone = structuredClone(sleepFull) as any;
    phone.sleep.type = 'CLASSIC';
    phone.sleep.summary.minutesAsleep = '200';
    const d = parseSleep({ dataPoints: [phone, sleepFull] }).get('2025-02-05')!;
    expect(d.sleepMinutes).toBe(195); // the staged Fitbit record wins; not 395
  });

  it('ignores junk without throwing', () => {
    expect(parseSleep({}).size).toBe(0);
    expect(parseHrv(undefined).size).toBe(0);
    expect(parseStepsRollup({ rollupDataPoints: [{}] }).size).toBe(0);
  });
});

describe('compareToUsual', () => {
  it('compares the last week with the weeks before', () => {
    const series = [...Array(28).fill(60), ...Array(7).fill(66)];
    const c = compareToUsual(series)!;
    expect(c.usual).toBe(60);
    expect(c.recent).toBe(66);
    expect(c.diff).toBe(6);
  });
  it('says nothing without enough data', () => {
    expect(compareToUsual([60, 61, 62])).toBeUndefined();
    expect(compareToUsual([...Array(28).fill(undefined), 66, 66, 66, undefined, undefined, undefined, undefined])).toBeUndefined();
  });
});

// ---- The service ----------------------------------------------------------------------------------------------------
const RETURN = 'https://gravity.test/app/health/callback';
let app: ReturnType<typeof makeApp>;
let momPid: string;
let dadPid: string;

beforeEach(async () => {
  app = makeApp();
  momPid = ((await app.core('mom', 'GET', '/me')).body as any).defaultProfileId;
  dadPid = ((await app.core('dad', 'GET', '/me')).body as any).defaultProfileId;
});

const link = (who: Who, pid: string) => app.health(who, 'GET', `/profiles/${pid}/link`);
const days = (who: Who, pid: string, q: Record<string, string> = {}) => app.health(who, 'GET', `/profiles/${pid}/days`, undefined, q);

async function connect(who: Who, pid: string) {
  const start = await app.health(who, 'POST', `/profiles/${pid}/link/start`, { redirectUri: RETURN });
  const url = new URL((start.body as any).url);
  return app.health(who, 'POST', '/link/callback', { code: url.searchParams.get('code'), state: url.searchParams.get('state') });
}
async function syncUntilDone(who: Who, pid: string) {
  let l: HealthLink = (await link(who, pid)).body as HealthLink;
  for (let i = 0; i < 20 && !l.backfillDone; i++) l = (await app.health(who, 'POST', `/profiles/${pid}/sync`)).body as HealthLink;
  return l;
}

describe('health: connecting Google', () => {
  it('starts not connected, and connects through the consent round trip', async () => {
    expect((await link('mom', momPid)).body).toMatchObject({ configured: true, connected: false, needsReconnect: false });
    const done = await connect('mom', momPid);
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ profileId: momPid, connected: true, backfillDone: false });
    expect(await app.tokens.get(momPid)).toBe('fake-refresh-token');
  });

  it('refuses return addresses that are not on the list', async () => {
    const r = await app.health('mom', 'POST', `/profiles/${momPid}/link/start`, { redirectUri: 'https://evil.example/app/health/callback' });
    expect(r.status).toBe(400);
  });

  it('a connection attempt works once, only for the person who started it, and only while fresh', async () => {
    const start = await app.health('mom', 'POST', `/profiles/${momPid}/link/start`, { redirectUri: RETURN });
    const q = new URL((start.body as any).url).searchParams;
    const body = { code: q.get('code'), state: q.get('state') };
    expect((await app.health('dad', 'POST', '/link/callback', body)).status).toBe(400); // someone else's state
    expect((await app.health('mom', 'POST', '/link/callback', body)).status).toBe(400); // consumed by the attempt above
    const again = await app.health('mom', 'POST', `/profiles/${momPid}/link/start`, { redirectUri: RETURN });
    const q2 = new URL((again.body as any).url).searchParams;
    app.setNow('2026-09-28T12:20:00Z'); // 20 minutes later
    expect((await app.health('mom', 'POST', '/link/callback', { code: q2.get('code'), state: q2.get('state') })).status).toBe(400);
    expect(await app.tokens.get(momPid)).toBeUndefined();
  });

  it('refuses to send anyone to Google when the server setup is unfinished (e.g. client secret missing)', async () => {
    app.google.problem = 'Setup is unfinished: the Google client secret has not been stored on the server yet';
    const r = await app.health('mom', 'POST', `/profiles/${momPid}/link/start`, { redirectUri: RETURN });
    expect(r.status).toBe(503);
    expect((r.body as any).error).toContain('client secret');
    expect(await app.db.query('health', 'OAUTHSTATE#')).toEqual([]);
  });

  it('reports "not set up" instead of failing when the server has no Google client', async () => {
    app.google.configured = false;
    expect((await link('mom', momPid)).body).toMatchObject({ configured: false });
    expect((await app.health('mom', 'POST', `/profiles/${momPid}/link/start`, { redirectUri: RETURN })).status).toBe(503);
  });
});

describe('health: privacy', () => {
  it('needs a valid allowlisted sign-in', async () => {
    expect((await app.health(null, 'GET', `/profiles/${momPid}/link`)).status).toBe(401);
    expect((await app.health('stranger', 'GET', `/profiles/${momPid}/link`)).status).toBe(403);
  });

  it('other family members cannot see, connect, sync or delete someone else\'s health data', async () => {
    await connect('mom', momPid);
    await syncUntilDone('mom', momPid);
    expect((await link('dad', momPid)).status).toBe(404);
    expect((await days('dad', momPid)).status).toBe(404);
    expect((await app.health('dad', 'POST', `/profiles/${momPid}/sync`)).status).toBe(404);
    expect((await app.health('dad', 'DELETE', `/profiles/${momPid}/link`)).status).toBe(404);
    expect((await app.health('dad', 'POST', `/profiles/${momPid}/link/start`, { redirectUri: RETURN })).status).toBe(404);
    expect(((await days('mom', momPid)).body as HealthDay[]).length).toBeGreaterThan(0);
  });

  it('a manager of a child profile can use it; health is never in the shared journal feed', async () => {
    const kid = ((await app.core('mom', 'POST', '/profiles', { name: 'Kid', emoji: 'K', color: '#2fb67c', shareByDefault: true })).body as any).id;
    expect((await link('mom', kid)).status).toBe(200);
    expect((await link('dad', kid)).status).toBe(404);
    await connect('mom', kid);
    await syncUntilDone('mom', kid);
    expect((await app.journal('dad', 'GET', '/shared', undefined, { month: '2026-09' })).body).toEqual([]);
  });
});

describe('health: syncing', () => {
  it('imports recent days first, then a year of history in chunks', async () => {
    await connect('mom', momPid);
    const first = (await app.health('mom', 'POST', `/profiles/${momPid}/sync`)).body as HealthLink;
    expect(first.backfillDone).toBe(false);
    expect(first.historyFrom).toBe('2026-06-27'); // recent days are Sep 25-28, then 90 days back from Sep 25
    const done = await syncUntilDone('mom', momPid);
    expect(done.backfillDone).toBe(true);
    expect(done.lastSyncAt).toBeDefined();
    const all = (await days('mom', momPid, { from: '2025-01-01', to: '2026-09-28' })).body as HealthDay[];
    expect(all.length).toBe(366); // 2025-09-28 .. 2026-09-28 inclusive: a year back, no gaps and no duplicates
    const d = all.find((x) => x.date === '2026-09-28')!;
    expect(d).toMatchObject({ steps: expect.any(Number), restingHr: expect.any(Number), hrv: expect.any(Number), sleepMinutes: expect.any(Number) });
    expect(d).not.toHaveProperty('pk');
    expect(d).not.toHaveProperty('syncedAt');
  });

  it('keeps existing values when a later sync has nothing for a metric', async () => {
    await connect('mom', momPid);
    await app.health('mom', 'POST', `/profiles/${momPid}/sync`);
    const before = ((await days('mom', momPid)).body as HealthDay[]).find((x) => x.date === '2026-09-28')!;
    const real = app.google.fetchDays.bind(app.google);
    app.google.fetchDays = async (...a) => {
      const r = await real(...a);
      for (const m of r.days.values()) delete m.hrv;
      return r;
    };
    await app.health('mom', 'POST', `/profiles/${momPid}/sync`);
    const after = ((await days('mom', momPid)).body as HealthDay[]).find((x) => x.date === '2026-09-28')!;
    expect(after.hrv).toBe(before.hrv);
  });

  it('one failing data type is reported but does not stop the others', async () => {
    app.google.errors = ['skin temperature: 400 bad filter'];
    await connect('mom', momPid);
    const l = (await app.health('mom', 'POST', `/profiles/${momPid}/sync`)).body as HealthLink;
    expect(l.lastError).toContain('skin temperature');
    expect(((await days('mom', momPid)).body as HealthDay[]).length).toBeGreaterThan(0);
  });

  it('if Google is completely down the history cursor does not move, so nothing is skipped', async () => {
    await connect('mom', momPid);
    app.google.fetchDays = async () => ({ days: new Map(), errors: Array(7).fill('503 unavailable'), attempted: 7 });
    expect((await app.health('mom', 'POST', `/profiles/${momPid}/sync`)).status).toBe(502);
    const l = (await link('mom', momPid)).body as HealthLink;
    expect(l.historyFrom).toBe('2026-09-25');
    expect(l.lastError).toContain('503');
  });

  it('asks the person to reconnect when Google revokes access, and recovers after they do', async () => {
    await connect('mom', momPid);
    app.google.revoked = true;
    const l = (await app.health('mom', 'POST', `/profiles/${momPid}/sync`)).body as HealthLink;
    expect(l).toMatchObject({ connected: false, needsReconnect: true });
    app.google.revoked = false;
    expect(((await connect('mom', momPid)).body as HealthLink).connected).toBe(true);
    expect(((await app.health('mom', 'POST', `/profiles/${momPid}/sync`)).body as HealthLink).needsReconnect).toBe(false);
  });

  it('cannot sync before connecting', async () => {
    expect((await app.health('mom', 'POST', `/profiles/${momPid}/sync`)).status).toBe(409);
  });
});

describe('health: disconnecting', () => {
  it('revokes at Google, forgets the token, and deletes every imported day', async () => {
    await connect('mom', momPid);
    await syncUntilDone('mom', momPid);
    expect((await app.health('mom', 'DELETE', `/profiles/${momPid}/link`)).status).toBe(204);
    expect(app.google.revokedTokens).toEqual(['fake-refresh-token']);
    expect(await app.tokens.get(momPid)).toBeUndefined();
    expect((await link('mom', momPid)).body).toMatchObject({ connected: false });
    expect((await days('mom', momPid)).body).toEqual([]);
    expect(await app.db.query('health', 'LINKS')).toEqual([]);
  });

  it('leaves the journal untouched', async () => {
    await app.journal('mom', 'PUT', `/profiles/${momPid}/days/2026-09-20`, {
      meals: { breakfast: [{ text: 'Eggs' }], lunch: [], dinner: [], snacks: [] },
      unwell: true,
      symptoms: [],
      shared: false,
    });
    await connect('mom', momPid);
    await syncUntilDone('mom', momPid);
    await app.health('mom', 'DELETE', `/profiles/${momPid}/link`);
    expect(((await app.journal('mom', 'GET', `/profiles/${momPid}/days/2026-09-20`)).body as any).unwell).toBe(true);
  });
});

describe('health: the schedule', () => {
  it('syncs everyone who is connected', async () => {
    await connect('mom', momPid);
    await connect('dad', dadPid);
    const both = await app.syncAll();
    expect(both).toEqual({ synced: 2, skipped: 0, failed: 0 });
    expect(((await days('dad', dadPid)).body as HealthDay[]).length).toBeGreaterThan(0);
  });

  it('does not keep syncing someone who has been taken off the allowlist', async () => {
    const list = ['mom@example.com', 'dad@example.com'];
    const a = makeApp(list);
    const mom = ((await a.core('mom', 'GET', '/me')).body as any).defaultProfileId;
    const dad = ((await a.core('dad', 'GET', '/me')).body as any).defaultProfileId;
    for (const [who, pid] of [['mom', mom], ['dad', dad]] as const) {
      const s = await a.health(who, 'POST', `/profiles/${pid}/link/start`, { redirectUri: RETURN });
      const q = new URL((s.body as any).url).searchParams;
      await a.health(who, 'POST', '/link/callback', { code: q.get('code'), state: q.get('state') });
    }
    list.splice(list.indexOf('dad@example.com'), 1);
    expect(await a.syncAll()).toEqual({ synced: 1, skipped: 1, failed: 0 });
  });

  it('a failure for one person does not stop the rest', async () => {
    await connect('mom', momPid);
    await connect('dad', dadPid);
    let calls = 0;
    const real = app.google.accessToken.bind(app.google);
    app.google.accessToken = async () => {
      if (++calls === 1) throw new Error('network');
      return real();
    };
    expect(await app.syncAll()).toEqual({ synced: 1, skipped: 0, failed: 1 });
  });
});

describe('health: Google client configuration', () => {
  it('ignores stray whitespace around the client ID (a trailing space caused Google to answer invalid_client)', async () => {
    const { RealGoogle } = await import('../services/health/src/google');
    const g = new RealGoogle({ clientId: '  123-abc.apps.googleusercontent.com \n', clientSecret: async () => 's' });
    const url = new URL(g.authUrl('https://gravity.test/app/health/callback', 'st'));
    expect(url.searchParams.get('client_id')).toBe('123-abc.apps.googleusercontent.com');
    expect(g.configured).toBe(true);
    expect(new RealGoogle({ clientId: '   ', clientSecret: async () => 's' }).configured).toBe(false);
    // A missing SSM secret is reported as unfinished setup, not as a Google rejection.
    const noSecret = new RealGoogle({ clientId: 'x', clientSecret: async () => { throw new Error('ParameterNotFound'); } });
    expect(await noSecret.ready()).toContain('client secret');
    expect(await g.ready()).toBeUndefined();
  });
});

import { addDays, type DayMap, type HealthMetrics } from '@gravity/shared/server';
import { ReauthError, type FetchResult, type GoogleHealth } from './google.js';

/** Small deterministic hash -> [0, 1) so the same date always yields the same fake numbers. */
const rand = (seed: string, salt: string) => {
  let h = 2166136261;
  for (const c of seed + salt) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
};
const between = (seed: string, salt: string, lo: number, hi: number) => lo + rand(seed, salt) * (hi - lo);

export function fakeDay(date: string): HealthMetrics {
  const sleep = Math.round(between(date, 'sleep', 330, 500));
  const deep = Math.round(sleep * between(date, 'deep', 0.1, 0.2));
  const rem = Math.round(sleep * between(date, 'rem', 0.18, 0.26));
  const bed = Math.round(between(date, 'bed', 22 * 60 + 15, 24 * 60 + 15)) % (24 * 60);
  const wake = (bed + sleep + 15) % (24 * 60);
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return {
    steps: Math.round(between(date, 'steps', 2500, 11500)),
    restingHr: Math.round(between(date, 'rhr', 60, 68)),
    hrv: Math.round(between(date, 'hrv', 28, 52) * 10) / 10,
    spo2: Math.round(between(date, 'spo2', 94.5, 97.5) * 10) / 10,
    spo2Low: Math.round(between(date, 'spo2l', 91, 94) * 10) / 10,
    skinTempC: Math.round(between(date, 'temp', 31.6, 32.6) * 100) / 100,
    skinTempDelta: Math.round(between(date, 'tempd', -0.6, 0.6) * 100) / 100,
    breathing: Math.round(between(date, 'br', 13.5, 17) * 10) / 10,
    sleepMinutes: sleep,
    sleepDeepMin: deep,
    sleepRemMin: rem,
    sleepLightMin: sleep - deep - rem,
    sleepAwakeMin: Math.round(between(date, 'awake', 15, 55)),
    bedtime: clock(bed),
    wakeTime: clock(wake),
  };
}

/** Stand-in for Google used by `npm run local`, the e2e tests and unit tests. No network, no credentials. */
export class FakeGoogle implements GoogleHealth {
  configured = true;
  /** Tests flip this to simulate Google revoking access. */
  revoked = false;
  revokedTokens: string[] = [];
  /** Tests set this to simulate one data type failing. */
  errors: string[] = [];

  authUrl(redirectUri: string, state: string) {
    // No Google in local mode: bounce straight back to the app as if consent was granted.
    return `${redirectUri}?code=fake-code&state=${encodeURIComponent(state)}`;
  }
  async exchange() {
    return { refreshToken: 'fake-refresh-token' };
  }
  async accessToken() {
    if (this.revoked) throw new ReauthError('invalid_grant');
    return 'fake-access-token';
  }
  async revoke(token: string) {
    this.revokedTokens.push(token);
  }
  async fetchDays(_access: string, from: string, to: string): Promise<FetchResult> {
    const days: DayMap = new Map();
    for (let d = from; d < to; d = addDays(d, 1)) days.set(d, fakeDay(d));
    return { days, errors: this.errors, attempted: 7 };
  }
}

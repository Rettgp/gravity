import {
  addDays,
  mergeDays,
  parseBreathing,
  parseHrv,
  parseRestingHr,
  parseSkinTemp,
  parseSleep,
  parseSpo2,
  parseStepsRollup,
  sleepDate,
  withinRange,
  type DayMap,
} from '@gravity/shared/server';

/** Google no longer honours the saved permission (revoked, expired, or the app was disconnected). */
export class ReauthError extends Error {}

export interface FetchResult {
  days: DayMap;
  /** Human-readable problems for individual data types. One failing type never blocks the others. */
  errors: string[];
  /** How many data types were requested, so callers can tell "one hiccup" from "Google is down". */
  attempted: number;
}

/** Everything the health service needs from Google, so the real thing and a local fake are interchangeable. */
export interface GoogleHealth {
  /** False when no OAuth client is set up on the server. */
  configured: boolean;
  authUrl(redirectUri: string, state: string): string;
  exchange(code: string, redirectUri: string): Promise<{ refreshToken: string }>;
  accessToken(refreshToken: string): Promise<string>;
  revoke(refreshToken: string): Promise<void>;
  /** Metrics for every day in [from, to). */
  fetchDays(accessToken: string, from: string, to: string): Promise<FetchResult>;
}

const BASE = 'https://health.googleapis.com/v4/users/me/dataTypes';
const SCOPES = ['activity_and_fitness', 'health_metrics_and_measurements', 'sleep'].map((s) => `https://www.googleapis.com/auth/googlehealth.${s}.readonly`);
/** Rollups accept at most 90 days per request. */
const ROLLUP_DAYS = 80;
const MAX_PAGES = 40;

export interface RealGoogleOptions {
  clientId?: string;
  clientSecret: () => Promise<string>;
  fetch?: typeof fetch;
}

export class RealGoogle implements GoogleHealth {
  private http: typeof fetch;
  constructor(private o: RealGoogleOptions) {
    this.http = o.fetch ?? fetch;
    // A stray space or newline from configuration makes Google answer "invalid_client", so never trust the raw value.
    this.clientId = o.clientId?.trim() || undefined;
  }
  private clientId?: string;
  get configured() {
    return !!this.clientId;
  }

  authUrl(redirectUri: string, state: string) {
    const q = new URLSearchParams({
      client_id: this.clientId ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      // offline + consent: always hand back a refresh token, even if the person connected before.
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + q;
  }

  private async token(params: Record<string, string>) {
    const res = await this.http('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId ?? '', client_secret: await this.o.clientSecret(), ...params }),
    });
    const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
    if (!res.ok) {
      if (json.error === 'invalid_grant') throw new ReauthError(json.error_description ?? 'invalid_grant');
      throw new Error(`Google token endpoint ${res.status}: ${json.error ?? 'error'}`);
    }
    return json;
  }

  async exchange(code: string, redirectUri: string) {
    const t = await this.token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    if (!t.refresh_token) throw new Error('Google did not return a refresh token');
    return { refreshToken: t.refresh_token };
  }

  async accessToken(refreshToken: string) {
    const t = await this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
    if (!t.access_token) throw new Error('Google did not return an access token');
    return t.access_token;
  }

  async revoke(refreshToken: string) {
    await this.http('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(refreshToken), { method: 'POST' });
  }

  private async call(access: string, url: string, init?: { method: string; body: unknown }) {
    const res = await this.http(url, {
      method: init?.method ?? 'GET',
      headers: { authorization: 'Bearer ' + access, ...(init ? { 'content-type': 'application/json' } : {}) },
      body: init ? JSON.stringify(init.body) : undefined,
    });
    if (res.status === 401) throw new ReauthError('Google rejected the access token');
    if (!res.ok) throw new Error(`${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`);
    return (await res.json()) as unknown;
  }

  /** Daily steps for [from, to), de-duplicated across the watch and the phone (all-sources). */
  private async steps(access: string, from: string, to: string): Promise<DayMap> {
    const out: DayMap = new Map();
    const civil = (d: string) => {
      const [year, month, day] = d.split('-').map(Number);
      return { date: { year, month, day } };
    };
    for (let start = from; start < to; start = addDays(start, ROLLUP_DAYS)) {
      const end = addDays(start, ROLLUP_DAYS) < to ? addDays(start, ROLLUP_DAYS) : to;
      const json = await this.call(access, BASE + '/steps/dataPoints:dailyRollUp', {
        method: 'POST',
        body: { range: { start: civil(start), end: civil(end) }, windowSizeDays: 1, dataSourceFamily: 'users/me/dataSourceFamilies/all-sources' },
      });
      mergeDays(out, parseStepsRollup(json));
    }
    return out;
  }

  /**
   * List a data type and parse it. Filtering is done here (not with Google's filter syntax) so a change in that syntax
   * cannot break the sync. Listings come newest first, so paging stops once a whole page is older than the window.
   */
  private async list(access: string, type: string, pageSize: number, from: string, parse: (json: unknown) => DayMap, dateOf: (p: Record<string, unknown>) => string | undefined) {
    const points: Record<string, unknown>[] = [];
    let token: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const json = (await this.call(access, `${BASE}/${type}/dataPoints?pageSize=${pageSize}` + (token ? '&pageToken=' + encodeURIComponent(token) : ''))) as {
        dataPoints?: Record<string, unknown>[];
        nextPageToken?: string;
      };
      const batch = json.dataPoints ?? [];
      points.push(...batch);
      token = json.nextPageToken;
      if (!token) break;
      const dates = batch.map(dateOf).filter((d): d is string => !!d);
      const newestFirst = dates.every((d, i) => i === 0 || dates[i - 1]! >= d);
      if (newestFirst && dates.length > 0 && dates[dates.length - 1]! < from) break;
    }
    return parse({ dataPoints: points });
  }

  async fetchDays(access: string, from: string, to: string): Promise<FetchResult> {
    const errors: string[] = [];
    const daily = (key: string) => (p: Record<string, unknown>) => {
      const d = (p[key] as { date?: { year?: number; month?: number; day?: number } } | undefined)?.date;
      return d?.year ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : undefined;
    };
    const task = async (name: string, run: () => Promise<DayMap>): Promise<DayMap> => {
      try {
        return await run();
      } catch (e) {
        if (e instanceof ReauthError) throw e;
        errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
        return new Map();
      }
    };
    const results = await Promise.all([
      task('steps', () => this.steps(access, from, to)),
      task('sleep', () => this.list(access, 'sleep', 25, from, parseSleep, sleepDate)),
      task('heart rate variability', () => this.list(access, 'daily-heart-rate-variability', 1000, from, parseHrv, daily('dailyHeartRateVariability'))),
      task('resting heart rate', () => this.list(access, 'daily-resting-heart-rate', 1000, from, parseRestingHr, daily('dailyRestingHeartRate'))),
      task('blood oxygen', () => this.list(access, 'daily-oxygen-saturation', 1000, from, parseSpo2, daily('dailyOxygenSaturation'))),
      task('skin temperature', () => this.list(access, 'daily-sleep-temperature-derivations', 1000, from, parseSkinTemp, daily('dailySleepTemperatureDerivations'))),
      task('breathing rate', () => this.list(access, 'daily-respiratory-rate', 1000, from, parseBreathing, daily('dailyRespiratoryRate'))),
    ]);
    const days: DayMap = new Map();
    for (const r of results) mergeDays(days, r);
    return { days: withinRange(days, from, to), errors, attempted: results.length };
  }
}

import { useMemo } from 'react';
import type { HealthDay, HealthLink, Leaderboard } from '@gravity/shared';
import { useFetcher } from '../../lib/api';

export interface HealthApi {
  link(pid: string): Promise<HealthLink>;
  /** Google's consent URL. `redirectUri` is where Google sends the person back. */
  start(pid: string, redirectUri: string): Promise<{ url: string }>;
  callback(code: string, state: string): Promise<HealthLink & { profileId: string }>;
  /** One sync step (recent days, plus a chunk of history while the first import runs). */
  sync(pid: string): Promise<HealthLink>;
  days(pid: string, from: string, to: string): Promise<HealthDay[]>;
  disconnect(pid: string): Promise<void>;
  /** Everyone's total for a month's family challenge (YYYY-MM). */
  leaderboard(month: string): Promise<Leaderboard>;
  /** Finished challenges before `month`, newest first. */
  pastChallenges(month: string): Promise<Leaderboard[]>;
}

export function useHealthApi(): HealthApi {
  const f = useFetcher();
  return useMemo<HealthApi>(
    () => ({
      link: (pid) => f('/api/health/profiles/' + pid + '/link'),
      start: (pid, redirectUri) => f('/api/health/profiles/' + pid + '/link/start', { method: 'POST', body: { redirectUri } }),
      callback: (code, state) => f('/api/health/link/callback', { method: 'POST', body: { code, state } }),
      sync: (pid) => f('/api/health/profiles/' + pid + '/sync', { method: 'POST' }),
      days: (pid, from, to) => f('/api/health/profiles/' + pid + '/days?from=' + from + '&to=' + to),
      leaderboard: (month) => f('/api/health/leaderboard?month=' + month),
      pastChallenges: (month) => f('/api/health/challenges?before=' + month),
      disconnect: (pid) => f('/api/health/profiles/' + pid + '/link', { method: 'DELETE' }),
    }),
    [f],
  );
}

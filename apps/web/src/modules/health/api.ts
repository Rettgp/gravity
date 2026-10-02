import { useMemo } from 'react';
import type { HealthDay, HealthLink, StepsLeaderboard } from '@gravity/shared';
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
  /** Everyone's step total for a month (YYYY-MM): the family steps challenge. */
  leaderboard(month: string): Promise<StepsLeaderboard>;
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
      leaderboard: (month) => f('/api/health/steps/leaderboard?month=' + month),
      disconnect: (pid) => f('/api/health/profiles/' + pid + '/link', { method: 'DELETE' }),
    }),
    [f],
  );
}

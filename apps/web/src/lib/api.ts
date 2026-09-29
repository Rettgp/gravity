import { useMemo } from 'react';
import { useAuth } from './auth';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Fetcher = <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;

export function useFetcher(): Fetcher {
  const { authHeaders, signOut } = useAuth();
  return useMemo<Fetcher>(
    () => async (path, init = {}) => {
      const res = await fetch(path, {
        method: init.method ?? 'GET',
        headers: { 'content-type': 'application/json', ...(await authHeaders()) },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      if (res.status === 401) {
        void signOut();
        throw new ApiError(401, 'Your session expired. Please sign in again.');
      }
      if (res.status === 204) return undefined as never;
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong');
      return data as never;
    },
    [authHeaders, signOut],
  );
}

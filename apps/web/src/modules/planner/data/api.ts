import { useMemo } from 'react';
import { ApiError, useFetcher } from '../../../lib/api';

export { ApiError };

/** The planner's own tiny REST client: Gravity's authenticated fetcher with the `/api/planner` prefix. */
export function usePlannerApi() {
  const f = useFetcher();
  return useMemo(
    () => ({
      get: <T,>(path: string) => f<T>('/api/planner' + path),
      post: <T,>(path: string, body: unknown = {}) => f<T>('/api/planner' + path, { method: 'POST', body }),
      put: <T,>(path: string, body: unknown) => f<T>('/api/planner' + path, { method: 'PUT', body }),
      del: <T,>(path: string) => f<T>('/api/planner' + path, { method: 'DELETE' }),
    }),
    [f],
  );
}
export type PlannerApi = ReturnType<typeof usePlannerApi>;

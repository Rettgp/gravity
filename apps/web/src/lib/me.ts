import { useQuery } from '@tanstack/react-query';
import type { Me } from '@gravity/shared';
import { useFetcher } from './api';
import { useAuth } from './auth';

export function useMe() {
  const f = useFetcher();
  const { status } = useAuth();
  return useQuery({ queryKey: ['me'], queryFn: () => f<Me>('/api/core/me'), enabled: status === 'authed', staleTime: 60_000 });
}

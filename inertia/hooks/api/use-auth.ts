import type { AuthPublicConfig } from '~/types/api'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

export function useAuthPublicConfig() {
  return useQuery({
    queryKey: ['auth', 'public-config'],
    queryFn: () => apiFetch<AuthPublicConfig>('/api/auth/config'),
    staleTime: 60_000,
  })
}

export function useGoogleOAuthStatus() {
  const q = useAuthPublicConfig()
  return {
    ...q,
    data: q.data ? { configured: q.data.google.configured } : undefined,
  }
}

import type { AuthPublicConfig } from '~/types/api'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

export function useAuthPublicConfig(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['auth', 'public-config'],
    queryFn: () => apiFetch<AuthPublicConfig>('/api/auth/config'),
    staleTime: 60_000,
    // Callers that already have the config server-preloaded pass enabled:false
    // so a published auth page issues no redundant client fetch.
    enabled: options?.enabled ?? true,
  })
}

export function useGoogleOAuthStatus() {
  const q = useAuthPublicConfig()
  return {
    ...q,
    data: q.data ? { configured: q.data.google.configured } : undefined,
  }
}

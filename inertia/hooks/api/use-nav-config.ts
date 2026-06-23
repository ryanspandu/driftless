import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

export interface NavConfig {
  landingEnabled: boolean
  hiddenNav: string[]
}

/** App nav config (hidden core sidebar items + landing toggle) for any admin. */
export function useNavConfig() {
  return useQuery({
    queryKey: ['nav-config'],
    queryFn: () => apiFetch<NavConfig>('/api/admin/nav-config'),
    staleTime: 30_000,
  })
}

import type { UpdateWebsiteSettingsRequest, WebsiteSettingsDto } from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

export const websiteSettingsQueryKey = ['settings', 'website'] as const

export function useWebsiteSettings() {
  return useQuery({
    queryKey: websiteSettingsQueryKey,
    queryFn: () => apiFetch<WebsiteSettingsDto>('/api/admin/settings/web'),
  })
}

export function useUpdateWebsiteSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateWebsiteSettingsRequest) =>
      apiFetch<WebsiteSettingsDto>('/api/admin/settings/web', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: websiteSettingsQueryKey })
      void qc.invalidateQueries({ queryKey: ['auth', 'public-config'] })
    },
  })
}

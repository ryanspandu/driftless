import type { IntegrationSettingsAdmin, UpdateIntegrationSettingsRequest } from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

export const integrationSettingsQueryKey = ['settings', 'integrations'] as const

export function useIntegrationSettings() {
  return useQuery({
    queryKey: integrationSettingsQueryKey,
    queryFn: () => apiFetch<IntegrationSettingsAdmin>('/api/admin/settings/integrations'),
  })
}

export function useUpdateIntegrationSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateIntegrationSettingsRequest) =>
      apiFetch<IntegrationSettingsAdmin>('/api/admin/settings/integrations', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: integrationSettingsQueryKey })
      void qc.invalidateQueries({ queryKey: ['auth', 'public-config'] })
    },
  })
}

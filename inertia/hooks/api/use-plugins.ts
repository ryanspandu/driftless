import type { PluginDto, PluginMenuItem } from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

const qk = {
  list: ['plugins', 'list'] as const,
  menu: ['plugins', 'menu'] as const,
}

export function usePluginsList() {
  return useQuery({
    queryKey: qk.list,
    queryFn: () => apiFetch<PluginDto[]>('/api/admin/plugins'),
    staleTime: 30_000,
  })
}

/** Enabled plugins' sidebar menu entries (available to any admin). */
export function useEnabledPluginsMenu() {
  return useQuery({
    queryKey: qk.menu,
    queryFn: () => apiFetch<PluginMenuItem[]>('/api/admin/plugins/menu'),
    staleTime: 30_000,
  })
}

export function useTogglePlugin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      apiFetch<PluginDto>(`/api/admin/plugins/${name}/toggle`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.list })
      qc.invalidateQueries({ queryKey: qk.menu })
    },
  })
}

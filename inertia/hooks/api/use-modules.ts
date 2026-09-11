import type { ModuleDto, ModuleMenuItem } from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

const qk = {
  list: ['modules', 'list'] as const,
  menu: ['modules', 'menu'] as const,
}

export function useModulesList() {
  return useQuery({
    queryKey: qk.list,
    queryFn: () => apiFetch<ModuleDto[]>('/api/admin/modules'),
    staleTime: 30_000,
  })
}

/** Enabled modules' sidebar nav groups (available to any admin). */
export function useModulesMenu() {
  return useQuery({
    queryKey: qk.menu,
    queryFn: () => apiFetch<ModuleMenuItem[]>('/api/admin/modules/menu'),
    staleTime: 30_000,
  })
}

export function useToggleModule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      apiFetch<ModuleDto>(`/api/admin/modules/${name}/toggle`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.list })
      qc.invalidateQueries({ queryKey: qk.menu })
    },
  })
}

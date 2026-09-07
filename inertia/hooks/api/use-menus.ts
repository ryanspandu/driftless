import type {
  MenuDto,
  MenuSummaryDto,
  MenuItemInputDto,
  CreateMenuRequest,
  UpdateMenuRequest,
} from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

const qk = {
  list: () => ['menus', 'list'] as const,
  one: (id: string) => ['menus', id] as const,
}

export function useMenusList() {
  return useQuery({
    queryKey: qk.list(),
    queryFn: () => apiFetch<MenuSummaryDto[]>('/api/admin/menus'),
    staleTime: 30_000,
  })
}

export function useMenu(id: string, enabled = true) {
  return useQuery({
    queryKey: qk.one(id),
    queryFn: () => apiFetch<MenuDto>(`/api/admin/menus/${id}`),
    enabled,
  })
}

export function useCreateMenu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateMenuRequest) =>
      apiFetch<MenuDto>('/api/admin/menus', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menus', 'list'] }),
  })
}

export function useUpdateMenu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateMenuRequest) =>
      apiFetch<MenuDto>(`/api/admin/menus/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['menus', 'list'] })
      qc.invalidateQueries({ queryKey: qk.one(vars.id) })
    },
  })
}

export function useSaveMenuItems() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: MenuItemInputDto[] }) =>
      apiFetch<MenuDto>(`/api/admin/menus/${id}/items`, {
        method: 'PUT',
        body: JSON.stringify({ items }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['menus', 'list'] })
      qc.invalidateQueries({ queryKey: qk.one(vars.id) })
    },
  })
}

export function useDeleteMenu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/menus/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menus', 'list'] }),
  })
}

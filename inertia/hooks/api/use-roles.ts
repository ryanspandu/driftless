import type { CreateRoleRequest, RoleDto, UpdateRoleRequest } from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

export const roleQueryKeys = {
  all: ['roles'] as const,
  list: () => ['roles', 'list'] as const,
  detail: (id: string) => ['roles', 'detail', id] as const,
}

export function useRolesList(enabled = true) {
  return useQuery({
    queryKey: roleQueryKeys.list(),
    enabled,
    queryFn: () => apiFetch<RoleDto[]>('/api/admin/roles'),
    staleTime: 30_000,
  })
}

export function useRole(id: string | null) {
  return useQuery({
    queryKey: roleQueryKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: () => apiFetch<RoleDto>(`/api/admin/roles/${id}`),
  })
}

export function useCreateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateRoleRequest) =>
      apiFetch<RoleDto>('/api/admin/roles', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: roleQueryKeys.all }),
  })
}

export function useUpdateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRoleRequest }) =>
      apiFetch<RoleDto>(`/api/admin/roles/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: (_row, { id }) => {
      void qc.invalidateQueries({ queryKey: roleQueryKeys.all })
      void qc.invalidateQueries({ queryKey: roleQueryKeys.detail(id) })
    },
  })
}

export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/roles/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: roleQueryKeys.all }),
  })
}

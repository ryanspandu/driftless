import type {
  CreatePermissionRequest,
  PermissionDto,
  UpdatePermissionRequest,
} from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

export const permissionQueryKeys = {
  all: ['permissions'] as const,
  list: () => ['permissions', 'list'] as const,
  detail: (id: string) => ['permissions', 'detail', id] as const,
}

export function usePermissionsList() {
  return useQuery({
    queryKey: permissionQueryKeys.list(),
    queryFn: () => apiFetch<PermissionDto[]>('/api/admin/permissions'),
    staleTime: 30_000,
  })
}

export function usePermission(id: string | null) {
  return useQuery({
    queryKey: permissionQueryKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: () => apiFetch<PermissionDto>(`/api/admin/permissions/${id}`),
  })
}

export function useCreatePermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreatePermissionRequest) =>
      apiFetch<PermissionDto>('/api/admin/permissions', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: permissionQueryKeys.all }),
  })
}

export function useUpdatePermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePermissionRequest }) =>
      apiFetch<PermissionDto>(`/api/admin/permissions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: (_row, { id }) => {
      void qc.invalidateQueries({ queryKey: permissionQueryKeys.all })
      void qc.invalidateQueries({ queryKey: permissionQueryKeys.detail(id) })
    },
  })
}

export function useDeletePermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/admin/permissions/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: permissionQueryKeys.all }),
  })
}

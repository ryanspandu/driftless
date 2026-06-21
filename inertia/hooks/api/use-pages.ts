import type {
  PageDto,
  PageSummaryDto,
  CreatePageRequest,
  UpdatePageRequest,
} from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

const qk = {
  list: ['pages', 'list'] as const,
  trash: ['pages', 'trash'] as const,
  one: (id: string) => ['pages', id] as const,
}

export function usePagesList() {
  return useQuery({
    queryKey: qk.list,
    queryFn: () => apiFetch<PageSummaryDto[]>('/api/admin/pages'),
    staleTime: 30_000,
  })
}

export function usePage(id: string, enabled = true) {
  return useQuery({
    queryKey: qk.one(id),
    queryFn: () => apiFetch<PageDto>(`/api/admin/pages/${id}`),
    enabled,
  })
}

export function useCreatePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreatePageRequest) =>
      apiFetch<PageDto>('/api/admin/pages', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.list }),
  })
}

export function useUpdatePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdatePageRequest) =>
      apiFetch<PageDto>(`/api/admin/pages/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.list })
      qc.invalidateQueries({ queryKey: qk.one(vars.id) })
    },
  })
}

export function useDeletePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/pages/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.list }),
  })
}

/** Soft-deleted pages (the Trash). */
export function useTrashedPages(enabled = true) {
  return useQuery({
    queryKey: qk.trash,
    queryFn: () => apiFetch<PageSummaryDto[]>('/api/admin/pages/trash'),
    staleTime: 10_000,
    enabled,
  })
}

export function useRestorePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<PageSummaryDto>(`/api/admin/pages/${id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.trash })
      qc.invalidateQueries({ queryKey: qk.list })
    },
  })
}

export function useForceDeletePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/admin/pages/${id}/force`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.trash }),
  })
}

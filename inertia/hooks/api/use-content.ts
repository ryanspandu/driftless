import type { ContentDto, CreateContentRequest, UpdateContentRequest } from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

const qk = {
  list: ['content', 'list'] as const,
  trash: ['content', 'trash'] as const,
  one: (id: string) => ['content', id] as const,
}

export function useContentList() {
  return useQuery({
    queryKey: qk.list,
    queryFn: () => apiFetch<ContentDto[]>('/api/admin/content'),
    staleTime: 30_000,
  })
}

export function useCreateContent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateContentRequest) =>
      apiFetch<ContentDto>('/api/admin/content', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.list }),
  })
}

export function useUpdateContent(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateContentRequest) =>
      apiFetch<ContentDto>(`/api/admin/content/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.list })
      qc.invalidateQueries({ queryKey: qk.one(id) })
    },
  })
}

export function useDeleteContent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/content/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.list }),
  })
}

/** Soft-deleted content (the Trash). */
export function useTrashedContent(enabled = true) {
  return useQuery({
    queryKey: qk.trash,
    queryFn: () => apiFetch<ContentDto[]>('/api/admin/content/trash'),
    staleTime: 10_000,
    enabled,
  })
}

export function useRestoreContent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<ContentDto>(`/api/admin/content/${id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.trash })
      qc.invalidateQueries({ queryKey: qk.list })
    },
  })
}

export function useForceDeleteContent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/admin/content/${id}/force`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.trash }),
  })
}

/** Live slug availability check against the DB (excludes `excludeId` when editing). */
export function useContentSlugCheck(slug: string, excludeId?: string) {
  const trimmed = slug.trim()
  return useQuery({
    queryKey: ['content', 'slug-check', trimmed, excludeId ?? null] as const,
    queryFn: () => {
      const params = new URLSearchParams({ slug: trimmed })
      if (excludeId) params.set('excludeId', excludeId)
      return apiFetch<{ available: boolean }>(`/api/admin/content/check-slug?${params.toString()}`)
    },
    enabled: trimmed.length > 0,
    staleTime: 10_000,
  })
}

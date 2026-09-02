import type { PageDto, PageSummaryDto, CreatePageRequest, UpdatePageRequest } from '~/types/api'
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

/**
 * Hand-written page components available in this build.
 *
 * The picker is fed from the same generated manifest the server validates
 * against, so it can never offer a value the save would reject.
 */
export function useCodeComponents(enabled = true) {
  return useQuery({
    queryKey: ['pages', 'code-components'] as const,
    queryFn: () => apiFetch<string[]>('/api/admin/pages/code-components'),
    // Fixed at build time — refetching it during a session cannot change it.
    staleTime: Number.POSITIVE_INFINITY,
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

/** Stage edits (autosave) — writes the draft columns, never the live page. */
export function useSaveDraft() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdatePageRequest) =>
      apiFetch<PageDto>(`/api/admin/pages/${id}/draft`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
  })
}

/** Promote the editor state to live and clear the draft. */
export function usePublishPage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdatePageRequest) =>
      apiFetch<PageDto>(`/api/admin/pages/${id}/publish`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.list })
      qc.invalidateQueries({ queryKey: qk.one(vars.id) })
    },
  })
}

export function useDiscardDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<PageDto>(`/api/admin/pages/${id}/discard-draft`, { method: 'POST' }),
    onSuccess: (_data, id) => qc.invalidateQueries({ queryKey: qk.one(id) }),
  })
}

export function useDuplicatePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<PageDto>(`/api/admin/pages/${id}/duplicate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.list }),
  })
}

export function usePreviewToken() {
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ token: string; url: string }>(`/api/admin/pages/${id}/preview-token`, {
        method: 'POST',
      }),
  })
}

export function useImportPage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (page: unknown) =>
      apiFetch<PageDto>('/api/admin/pages/import', {
        method: 'POST',
        body: JSON.stringify({ page }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.list }),
  })
}

export function useBulkPages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { ids: string[]; action: 'publish' | 'unpublish' | 'trash' | 'delete' }) =>
      apiFetch<{ count: number }>('/api/admin/pages/bulk', {
        method: 'POST',
        body: JSON.stringify(vars),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.list })
      qc.invalidateQueries({ queryKey: qk.trash })
    },
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

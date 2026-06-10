import type { ContentDto, CreateContentRequest, UpdateContentRequest } from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

const qk = { list: ['content', 'list'] as const, one: (id: string) => ['content', id] as const }

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
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/admin/content/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.list }),
  })
}

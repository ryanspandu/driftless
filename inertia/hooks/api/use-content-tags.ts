import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'
import type { ContentTagDto, CreateContentTagRequest, UpdateContentTagRequest } from '~/types/api'

const KEY = ['content-tags'] as const
const BASE = '/api/admin/content-tags'

export function useContentTags() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<ContentTagDto[]>(BASE),
    staleTime: 30_000,
  })
}

export function useCreateContentTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateContentTagRequest) =>
      apiFetch<ContentTagDto>(BASE, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateContentTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateContentTagRequest) =>
      apiFetch<ContentTagDto>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteContentTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`${BASE}/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

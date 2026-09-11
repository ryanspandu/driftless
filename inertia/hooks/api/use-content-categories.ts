import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'
import type {
  ContentCategoryDto,
  CreateContentCategoryRequest,
  UpdateContentCategoryRequest,
} from '~/types/api'

const KEY = ['content-categories'] as const
const BASE = '/api/admin/content-categories'

export function useContentCategories() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<ContentCategoryDto[]>(BASE),
    staleTime: 30_000,
  })
}

export function useCreateContentCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateContentCategoryRequest) =>
      apiFetch<ContentCategoryDto>(BASE, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateContentCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateContentCategoryRequest) =>
      apiFetch<ContentCategoryDto>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteContentCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`${BASE}/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

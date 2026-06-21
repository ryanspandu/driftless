import type {
  TemplateDto,
  TemplateSummaryDto,
  TemplateType,
  CreateTemplateRequest,
  UpdateTemplateRequest,
} from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

const qk = {
  list: (type?: TemplateType) => ['templates', 'list', type ?? 'all'] as const,
  one: (id: string) => ['templates', id] as const,
}

export function useTemplatesList(type?: TemplateType) {
  return useQuery({
    queryKey: qk.list(type),
    queryFn: () =>
      apiFetch<TemplateSummaryDto[]>(
        type ? `/api/admin/templates?type=${type}` : '/api/admin/templates'
      ),
    staleTime: 30_000,
  })
}

export function useTemplate(id: string, enabled = true) {
  return useQuery({
    queryKey: qk.one(id),
    queryFn: () => apiFetch<TemplateDto>(`/api/admin/templates/${id}`),
    enabled,
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateTemplateRequest) =>
      apiFetch<TemplateDto>('/api/admin/templates', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', 'list'] }),
  })
}

export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateTemplateRequest) =>
      apiFetch<TemplateDto>(`/api/admin/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['templates', 'list'] })
      qc.invalidateQueries({ queryKey: qk.one(vars.id) })
    },
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/admin/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', 'list'] }),
  })
}

export function useDuplicateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<TemplateDto>(`/api/admin/templates/${id}/duplicate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', 'list'] }),
  })
}

export function useSetDefaultTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<TemplateDto>(`/api/admin/templates/${id}/default`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['templates', 'list'] })
      qc.invalidateQueries({ queryKey: qk.one(id) })
    },
  })
}

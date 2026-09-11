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
  list: (type?: TemplateType, includeCode = false) =>
    ['templates', 'list', type ?? 'all', includeCode ? 'code' : 'db'] as const,
  one: (id: string) => ['templates', id] as const,
}

/**
 * `includeCode` merges kit code templates (`codetpl:<kit>/…`, no DB row) as
 * read-only rows — the Templates list wants them; the Header/Footer/Layout,
 * Email and Collection pickers do NOT (they add their code options themselves,
 * so mixing them in here would double every entry).
 */
export function useTemplatesList(type?: TemplateType, includeCode = false) {
  return useQuery({
    queryKey: qk.list(type, includeCode),
    queryFn: () => {
      const params = new URLSearchParams()
      if (type) params.set('type', type)
      if (includeCode) params.set('code', '1')
      const qs = params.toString()
      return apiFetch<TemplateSummaryDto[]>(`/api/admin/templates${qs ? `?${qs}` : ''}`)
    },
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

export function useImportTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (template: unknown) =>
      apiFetch<TemplateDto>('/api/admin/templates/import', {
        method: 'POST',
        body: JSON.stringify({ template }),
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
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', 'list'] }),
  })
}

export function useTrashedTemplates(enabled = true) {
  return useQuery({
    queryKey: ['templates', 'trash'] as const,
    queryFn: () => apiFetch<TemplateSummaryDto[]>('/api/admin/templates/trash'),
    enabled,
    staleTime: 10_000,
  })
}

export function useRestoreTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<TemplateDto>(`/api/admin/templates/${id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['templates', 'trash'] })
      void qc.invalidateQueries({ queryKey: ['templates', 'list'] })
    },
  })
}

export function useForceDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/admin/templates/${id}/force`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', 'trash'] }),
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

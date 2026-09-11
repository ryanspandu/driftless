import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut, apiDelete } from '~/lib/api'
import type {
  FormSummaryDto,
  FormDefinitionDto,
  CreateFormRequest,
  UpdateFormRequest,
} from '~/types/api'

const qk = {
  list: () => ['forms-admin', 'list'] as const,
  one: (id: string) => ['forms-admin', id] as const,
}

export function useFormsList() {
  return useQuery({
    queryKey: qk.list(),
    queryFn: () => apiGet<FormSummaryDto[]>('/api/admin/forms/definitions'),
    staleTime: 15_000,
  })
}

export function useForm(id: string, enabled = true) {
  return useQuery({
    queryKey: qk.one(id),
    enabled: !!id && enabled,
    queryFn: () => apiGet<FormDefinitionDto>(`/api/admin/forms/definitions/${id}`),
  })
}

export function useCreateForm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateFormRequest) =>
      apiPost<FormDefinitionDto>('/api/admin/forms/definitions', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.list() }),
  })
}

export function useUpdateForm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateFormRequest & { id: string }) =>
      apiPut<FormDefinitionDto>(`/api/admin/forms/definitions/${id}`, body),
    onSuccess: (form) => {
      qc.setQueryData(qk.one(form.id), form)
      qc.invalidateQueries({ queryKey: qk.list() })
    },
  })
}

export function useDeleteForm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/admin/forms/definitions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.list() }),
  })
}

export function useDuplicateForm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<FormDefinitionDto>(`/api/admin/forms/definitions/${id}/duplicate`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.list() }),
  })
}

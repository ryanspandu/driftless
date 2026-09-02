import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPut } from '~/lib/api'

export type FormStatus = 'new' | 'read' | 'spam'

export interface FormSubmission {
  id: string
  formName: string
  pagePath: string | null
  data: Record<string, unknown>
  email: string | null
  status: FormStatus
  createdAt: string
}

export interface FormSubmissionList {
  items: FormSubmission[]
  unread: number
}

export function useFormSubmissions(status?: FormStatus | 'all') {
  const qs = status && status !== 'all' ? `?status=${status}` : ''
  return useQuery({
    queryKey: ['forms', 'list', status ?? 'all'] as const,
    queryFn: () => apiGet<FormSubmissionList>(`/api/admin/forms${qs}`),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  })
}

export function useUpdateFormStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; status: FormStatus }) =>
      apiPut<FormSubmission>(`/api/admin/forms/${vars.id}/status`, { status: vars.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
  })
}

export function useDeleteFormSubmission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/admin/forms/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
  })
}

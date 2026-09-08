import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPut } from '~/lib/api'

export type FormStatus = 'new' | 'read' | 'spam'

export interface FormSubmission {
  id: string
  formName: string
  formId: string | null
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

/** `formId` scopes the inbox to one defined form (its detail-page Submissions tab). */
export function useFormSubmissions(status?: FormStatus | 'all', formId?: string) {
  const params = new URLSearchParams()
  if (status && status !== 'all') params.set('status', status)
  if (formId) params.set('formId', formId)
  const qs = params.toString()
  return useQuery({
    queryKey: ['forms', 'list', status ?? 'all', formId ?? 'all'] as const,
    queryFn: () => apiGet<FormSubmissionList>(`/api/admin/forms${qs ? `?${qs}` : ''}`),
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

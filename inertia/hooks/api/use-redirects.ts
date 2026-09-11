import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost, apiPut } from '~/lib/api'

export interface Redirect {
  id: string
  fromPath: string
  toPath: string
  status: number
  hits: number
  createdAt: string
  updatedAt: string
}

export function useRedirects() {
  return useQuery({
    queryKey: ['redirects'] as const,
    queryFn: () => apiGet<{ items: Redirect[] }>('/api/admin/redirects'),
    staleTime: 30_000,
  })
}

export function useCreateRedirect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { fromPath: string; toPath: string; status: number }) =>
      apiPost<Redirect>('/api/admin/redirects', vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['redirects'] }),
  })
}

export function useUpdateRedirect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; fromPath?: string; toPath?: string; status?: number }) =>
      apiPut<Redirect>(`/api/admin/redirects/${vars.id}`, vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['redirects'] }),
  })
}

export function useDeleteRedirect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/admin/redirects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['redirects'] }),
  })
}

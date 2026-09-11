import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '~/lib/api'
import { apiFetch } from '~/lib/api-client'

export interface TemplateKitDto {
  id: string
  name: string
  description: string
  isolate: boolean
  protected: boolean
  /** Whether the kit's templates + file-pages are surfaced (fail-closed default). */
  active: boolean
  counts: { pages: number; templates: number; collection: number; emails: number; components: number }
}

export interface ImportKitResult {
  id: string
  files: number
  rebuildRequired: boolean
}

export function useTemplateKits() {
  return useQuery({
    queryKey: ['template-kits'],
    queryFn: () =>
      apiFetch<{ items: TemplateKitDto[] }>('/api/admin/template-kits').then((r) => r.items),
    staleTime: 30_000,
  })
}

export function useSetKitActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch<{ success: boolean }>(`/api/admin/template-kits/${id}/active`, {
        method: 'PUT',
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => {
      // The kit cards + both lists it feeds go stale at once.
      void qc.invalidateQueries({ queryKey: ['template-kits'] })
      void qc.invalidateQueries({ queryKey: ['templates', 'list'] })
      void qc.invalidateQueries({ queryKey: ['pages'] })
    },
  })
}

export function useImportTemplateKit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File): Promise<ImportKitResult> => {
      const form = new FormData()
      form.append('archive', file)
      const res = await api.post<ImportKitResult>('/api/admin/template-kits/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['template-kits'] }),
  })
}

import type { PageDto } from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

export interface PageRevisionDto {
  id: string
  pageId: string
  status: 'DRAFT' | 'PUBLISHED'
  authorId: number | null
  createdAt: string
}

const qk = {
  revisions: (pageId: string) => ['pages', pageId, 'revisions'] as const,
}

export function usePageRevisions(pageId: string, enabled = true) {
  return useQuery({
    queryKey: qk.revisions(pageId),
    queryFn: () => apiFetch<PageRevisionDto[]>(`/api/admin/pages/${pageId}/revisions`),
    enabled: !!pageId && enabled,
  })
}

export function useRestorePageRevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pageId, revisionId }: { pageId: string; revisionId: string }) =>
      apiFetch<PageDto>(`/api/admin/pages/${pageId}/revisions/${revisionId}/restore`, {
        method: 'POST',
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['pages', vars.pageId] })
      qc.invalidateQueries({ queryKey: qk.revisions(vars.pageId) })
    },
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'
import type { CodeSnippet } from '~/puck/custom-code'

/**
 * Site-wide ("global") custom code — CSS/JS injected on every published page.
 * Stored in `web_settings` (section `page_code`) and edited from both the builder
 * Settings dialog and the `/admin/pages` Global code dialog (shared data).
 */
const qk = ['settings', 'page-code'] as const

export function useGlobalCode() {
  return useQuery({
    queryKey: qk,
    queryFn: () => apiFetch<{ snippets: CodeSnippet[] }>('/api/admin/settings/page-code'),
    staleTime: 30_000,
  })
}

export function useUpdateGlobalCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (snippets: CodeSnippet[]) =>
      apiFetch<{ snippets: CodeSnippet[] }>('/api/admin/settings/page-code', {
        method: 'PUT',
        body: JSON.stringify({ snippets }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk }),
  })
}

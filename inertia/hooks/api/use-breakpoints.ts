import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'
import type { Breakpoint } from '~/puck/breakpoints'

/**
 * Site-wide responsive breakpoints (Webflow-style tiers + custom resolutions),
 * stored in `web_settings` (section `builder`). Read by the page builder to drive
 * the device switcher and the per-breakpoint style editor; changing the list is
 * gated on `settings:manage` since it re-renders every published page's CSS.
 */
const qk = ['settings', 'breakpoints'] as const

export function useBreakpoints() {
  return useQuery({
    queryKey: qk,
    queryFn: () => apiFetch<{ breakpoints: Breakpoint[] }>('/api/admin/settings/breakpoints'),
    staleTime: 60_000,
  })
}

export function useUpdateBreakpoints() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (breakpoints: Breakpoint[]) =>
      apiFetch<{ breakpoints: Breakpoint[] }>('/api/admin/settings/breakpoints', {
        method: 'PUT',
        body: JSON.stringify({ breakpoints }),
      }),
    // Reflect the new tier in the switcher immediately, before the round-trip.
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: qk })
      const prev = qc.getQueryData<{ breakpoints: Breakpoint[] }>(qk)
      qc.setQueryData(qk, { breakpoints: next })
      return { prev }
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk, ctx.prev)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk }),
  })
}

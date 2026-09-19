import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '~/lib/api'
import { reportError } from '~/lib/notify'

/**
 * Per-mutation switches read by the global handlers below. Set them as `meta`
 * on the `useMutation` so every call site of a hook gets the same feedback:
 *
 * ```ts
 * useMutation({ mutationFn, meta: { successMessage: 'User deleted' } })
 * useMutation({ mutationFn, meta: { successMessage: (r: { count: number }) => `${r.count} deleted` } })
 * ```
 */
export interface MutationNotifyMeta extends Record<string, unknown> {
  /** Toast shown when the mutation succeeds. May be built from the result and the variables. */
  successMessage?: string | ((data: never, variables: never) => string)
  /** Fallback for the failure toast when the server sent no message. */
  errorMessage?: string
  /** Do not toast a failure — the caller reports or handles it itself. */
  silent?: boolean
}

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: MutationNotifyMeta
  }
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        /**
         * Every failed mutation tells the user, and a mutation that opts in with
         * `meta.successMessage` tells them it worked — so a hook that forgets
         * `onError` is no longer a silent failure. `reportError` de-duplicates,
         * so a caller that also catches and reports the same error is fine.
         */
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            const meta = mutation.meta
            if (meta?.silent) return
            reportError(error, meta?.errorMessage ?? 'Something went wrong')
          },
          onSuccess: (data, variables, _context, mutation) => {
            const message = mutation.meta?.successMessage
            if (!message) return
            toast.success(
              typeof message === 'function' ? message(data as never, variables as never) : message
            )
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
            /**
             * Never retry a 4xx.
             *
             * The default retries every failure three times with backoff. For a
             * definitive answer — not found, not permitted — that only delays
             * the error a screen is waiting to show by several seconds, and a
             * screen mid-retry is indistinguishable from one that has hung.
             * Server faults and dropped connections are still worth one more
             * try, because those genuinely do come back.
             */
            retry: (failureCount, error) => {
              const status = error instanceof ApiError ? error.status : null
              if (status !== null && status >= 400 && status < 500) return false
              return failureCount < 2
            },
          },
        },
      })
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

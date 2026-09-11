import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { ApiError } from '~/lib/api'

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
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

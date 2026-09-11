import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

/**
 * How a restart behaves in this deployment. See `app/services/supervisor.ts`.
 *
 * - `queued`  — systemd holds the socket; no connection is refused
 * - `rolling` — several workers, restarted one at a time
 * - `gap`     — one process; the site does not answer while it restarts
 * - `manual`  — nothing will restart it; the operator has to
 */
export type RestartKind = 'queued' | 'rolling' | 'gap' | 'manual'

export interface DeploymentInfo {
  mode: string
  supervisor: string | null
  supervised: boolean
  restartKind: RestartKind
  workers: number | null
  /**
   * Measured boot time, or null in a process that has not recorded one.
   *
   * Shown to the operator verbatim rather than rounded into an adjective:
   * "about 6 seconds" is a fact, "zero downtime" is a promise this cannot keep.
   */
  bootMs: number | null
  restartHint: string
  autoRestart: boolean
}

export function useDeployment(enabled = true) {
  return useQuery({
    queryKey: ['deployment'] as const,
    queryFn: () => apiFetch<DeploymentInfo>('/api/admin/deployment'),
    enabled,
    /** None of this can change without the process restarting. */
    staleTime: Number.POSITIVE_INFINITY,
  })
}

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

export interface SectionReport {
  name: string
  created: number
  updated: number
  skipped: number
  warnings: string[]
}

export interface ImportResult {
  dryRun: boolean
  mode: string
  conflict: string
  sections: SectionReport[]
  skipped: Array<{ name: string; reason: string }>
  log: string[]
}

export type TransferState = 'queued' | 'running' | 'succeeded' | 'failed'

export interface TransferJobDto {
  id: string
  kind: 'import' | 'export'
  state: TransferState
  total: number
  completed: number
  currentSection: string | null
  logTail: string[]
  errorMessage: string | null
  result: ImportResult | { filename?: string; size?: number } | null
  dryRun: boolean
  mode: string | null
  conflict: string | null
  downloadReady: boolean
  downloadName: string | null
  startedAt: string | null
  finishedAt: string | null
}

export function isTransferTerminal(state: TransferState | undefined): boolean {
  return state === 'succeeded' || state === 'failed'
}

/**
 * Poll one data-transfer job until it reaches a terminal state, then stop.
 * `refetchInterval` returns false once terminal so the fast poll ends on its own.
 */
export function useTransferJob(jobId: string | null) {
  return useQuery({
    queryKey: ['data-transfer', 'job', jobId],
    enabled: !!jobId,
    staleTime: 0,
    refetchInterval: (query) => (isTransferTerminal(query.state.data?.state) ? false : 1500),
    queryFn: () =>
      apiFetch<{ job: TransferJobDto }>(`/api/admin/data-transfer/jobs/${jobId}`).then(
        (r) => r.job
      ),
  })
}

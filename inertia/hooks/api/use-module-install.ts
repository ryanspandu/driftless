import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

export type ModuleInstallState =
  | 'queued'
  | 'running'
  | 'awaiting_restart'
  | 'succeeded'
  | 'failed'
  | 'abandoned'

export type ModuleInstallStep = 'migrate' | 'build' | 'enable' | 'restart'

export interface ModuleInstallJob {
  id: string
  module: string
  state: ModuleInstallState
  step: ModuleInstallStep | null
  requiresBuild: boolean
  requiresRestart: boolean
  restartKind: string | null
  appliedMigrations: string[]
  errorReason: string | null
  errorMessage: string | null
  logTail: string | null
  startedAt: string | null
  finishedAt: string | null
}

export interface DetectedModule {
  name: string
  /** False for a folder dropped in after the server booted. */
  loaded: boolean
  requiresBuild: boolean
}

const TERMINAL: ModuleInstallState[] = ['succeeded', 'failed', 'abandoned']

export function isTerminal(state: ModuleInstallState): boolean {
  return TERMINAL.includes(state)
}

/**
 * Module folders on disk, including ones this server has not loaded.
 *
 * The unloaded ones are the whole point: a package dropped into `modules/` after
 * boot cannot appear in the modules list until a restart, so without this it is
 * invisible to the person who just put it there.
 */
export function useDetectedModules(enabled = true) {
  return useQuery({
    queryKey: ['modules', 'detected'] as const,
    queryFn: () => apiFetch<{ modules: DetectedModule[] }>('/api/admin/modules/detected'),
    enabled,
    staleTime: 5_000,
  })
}

export function useStartModuleInstall() {
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ jobId: string; requiresBuild: boolean; requiresRestart: boolean }>(
        `/api/admin/modules/${name}/install`,
        { method: 'POST' }
      ),
  })
}

/**
 * Poll one install job.
 *
 * The first `refetchInterval` in this codebase, and it needs its reasons
 * written down:
 *
 * - **`retry: false`** overrides the provider default of three retries
 *   (`query-provider.tsx`). During the restart at the end of an install *every*
 *   attempt fails, and TanStack's exponential backoff would push the recovery
 *   check further and further out — the opposite of what is wanted. Each raw
 *   failure surfaced on schedule is what lets the UI say "Restarting…" and then
 *   notice, promptly, that it came back.
 * - **No `visibilitychange` handling.** TanStack already pauses the interval for
 *   a hidden document and resumes it on focus. Hand-rolling that (as
 *   `connection-indicator.tsx` has to, because it uses raw `fetch`) would fight
 *   the library rather than help it.
 * - **The 8s timeout** matters under socket activation: the kernel queues the
 *   connection while the app is down, so the request *hangs* rather than
 *   failing, and a poll that never returns is a poller that has stopped.
 *
 * A note for whoever reads this later: the session survives the restart because
 * `SESSION_DRIVER=cookie`. If that ever changes to a server-side store, the
 * poller starts hard-navigating to `/login` mid-install.
 */
export function useModuleInstallJob(jobId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['module-install-job', jobId] as const,
    queryFn: () =>
      apiFetch<{ job: ModuleInstallJob | null }>(`/api/admin/module-install-jobs/${jobId}`, {
        timeout: 8_000,
      }),
    enabled: enabled && Boolean(jobId),
    refetchInterval: 2_000,
    retry: false,
    staleTime: 0,
  })
}

/**
 * The install worth showing on this page: the active one, or one that finished
 * in the last ten minutes.
 *
 * Because at most one job can be active at a time (a unique index enforces it),
 * "latest" is unambiguous — which is what makes a result survive a page reload,
 * a second tab, or a different admin opening the same screen. `sessionStorage`
 * is a nicety on top; this is the mechanism.
 */
export function useLatestModuleInstallJob(enabled = true) {
  return useQuery({
    queryKey: ['module-install-job', 'latest'] as const,
    queryFn: () =>
      apiFetch<{ job: ModuleInstallJob | null }>('/api/admin/module-install-jobs/latest', {
        timeout: 8_000,
      }),
    enabled,
    // Poll so an admin already sitting on this page discovers an install another
    // admin (or tab) started, without needing a remount/refocus. The endpoint is
    // cheap and at most one job is ever active (enforced by a unique index).
    refetchInterval: 5_000,
    retry: false,
    staleTime: 0,
  })
}

/** Everything a finished install may have changed. */
export function useInvalidateAfterInstall() {
  const qc = useQueryClient()

  return () => {
    void qc.invalidateQueries({ queryKey: ['modules', 'list'] })
    void qc.invalidateQueries({ queryKey: ['modules', 'menu'] })
    void qc.invalidateQueries({ queryKey: ['modules', 'detected'] })
    void qc.invalidateQueries({ queryKey: ['schema', 'pending'] })
  }
}

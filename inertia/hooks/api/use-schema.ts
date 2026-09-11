import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

/** Where a pending migration comes from, so the dialog can group them. */
export type MigrationOrigin = 'core' | 'module'

export interface PendingMigration {
  name: string
  origin: MigrationOrigin
  owner: string | null
}

export interface PendingMigrationsResponse {
  total: number
  migrations: PendingMigration[]
}

const qk = {
  pending: ['schema', 'pending'] as const,
}

/**
 * Migrations that have not run yet.
 *
 * `enabled` is a parameter because this endpoint needs `module:install`, which
 * most admins do not hold — fetching it unconditionally would 403 on every
 * settings page load for them.
 */
export function usePendingMigrations(enabled = true) {
  return useQuery({
    queryKey: qk.pending,
    queryFn: () => apiFetch<PendingMigrationsResponse>('/api/admin/schema/pending'),
    enabled,
    staleTime: 5_000,
  })
}

/**
 * There is deliberately no `useInstallSchema` here.
 *
 * Applying migrations on its own is not enough to install a module — the tables
 * appear, the front-end still has none of its pages, and a module the running
 * process never imported stays invisible. Installing goes through
 * `use-module-install.ts`, which runs the whole sequence in a fresh process and
 * reports what happened. `POST /api/admin/schema/install` still exists for API
 * callers who genuinely want only the migrations.
 */
export function useUninstallModule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, confirm }: { name: string; confirm: string }) =>
      apiFetch<{ droppedTables: string[]; forgottenMigrations: number }>(
        `/api/admin/modules/${name}/uninstall`,
        { method: 'POST', body: JSON.stringify({ confirm }) }
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.pending })
      void qc.invalidateQueries({ queryKey: ['modules', 'list'] })
      void qc.invalidateQueries({ queryKey: ['modules', 'menu'] })
    },
  })
}

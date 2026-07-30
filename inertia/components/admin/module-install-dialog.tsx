import { useMemo, useState } from 'react'
import { AlertTriangle, Database, Hammer, Loader2, Power, RefreshCw } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Badge } from '~/components/ui/badge'
import {
  usePendingMigrations,
  type MigrationOrigin,
  type PendingMigration,
} from '~/hooks/api/use-schema'
import { useStartModuleInstall } from '~/hooks/api/use-module-install'
import { useDeployment, type RestartKind } from '~/hooks/api/use-deployment'
import { apiErrorMessage } from '~/lib/api-client'

const ORIGIN_LABEL: Record<MigrationOrigin, string> = {
  core: 'Core',
  module: 'Module',
}

/**
 * What a restart does to visitors, per deployment shape.
 *
 * Deliberately no "zero downtime" anywhere. Socket activation drops no
 * connections, which is not the same thing: a visitor who arrives mid-restart
 * waits out a full application boot. That number is measured on the server and
 * printed here, because a fact an operator can plan around beats a promise that
 * quietly is not true.
 */
function restartCopy(
  kind: RestartKind,
  opts: { workers: number | null; seconds: string; hint: string; supervisorLabel: string }
): { title: string; detail: string } {
  switch (kind) {
    case 'queued':
      return {
        title: 'Your site stays reachable.',
        detail: `systemd holds the listening socket, so no request is refused. Anyone who arrives during the restart waits about ${opts.seconds} for a reply instead of seeing an error.`,
      }
    case 'rolling':
      return {
        title: 'Your site stays online.',
        detail: `${opts.workers} workers restart one at a time. The others keep serving throughout.`,
      }
    case 'manual':
      return {
        title: 'You will need to restart it yourself.',
        detail: `Nothing here will restart this process, so the installer stops before the restart and waits. When it does, run \`${opts.hint}\`.`,
      }
    default:
      return {
        title: 'Brief restart at the end.',
        detail: `This runs as a single process. It stops and ${opts.supervisorLabel} starts it again — about ${opts.seconds} where the site does not answer. Requests already in flight are finished first.`,
      }
  }
}

/** Strip the directory prefix — the dialog already groups by origin and owner. */
function shortName(name: string): string {
  return name.split('/').pop() ?? name
}

function groupByOwner(migrations: PendingMigration[]) {
  const groups = new Map<
    string,
    { origin: MigrationOrigin; owner: string | null; names: string[] }
  >()
  for (const m of migrations) {
    const key = `${m.origin}:${m.owner ?? ''}`
    const existing = groups.get(key)
    if (existing) existing.names.push(m.name)
    else groups.set(key, { origin: m.origin, owner: m.owner, names: [m.name] })
  }
  return [...groups.values()]
}

export interface InstallTarget {
  name: string
  label: string
  /**
   * Whether the running server has this module loaded. False for a folder
   * dropped in after boot — which changes what we can honestly show below.
   */
  loaded: boolean
  requiresBuild: boolean
}

/**
 * Confirms an install before it starts, and says plainly what it will do.
 *
 * Four things, in order, because each is something the operator can only find
 * out afterwards otherwise: which migrations run, what we cannot tell them yet,
 * whether a multi-minute build is coming, and what the restart costs their
 * visitors.
 */
export function ModuleInstallDialog({
  target,
  open,
  onOpenChange,
  onStarted,
}: {
  target: InstallTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStarted: (jobId: string) => void
}) {
  /**
   * Only meaningful for a module this server has loaded.
   * `SchemaInstallerService.pending()` reads `config.migrations.paths`, which is
   * frozen at boot, so for a drop-in it genuinely cannot see anything — and an
   * empty list would read as "nothing will happen".
   */
  const canListMigrations = Boolean(target?.loaded)
  const pending = usePendingMigrations(open && canListMigrations)
  const deployment = useDeployment(open)
  const start = useStartModuleInstall()
  const [error, setError] = useState<string | null>(null)

  const groups = useMemo(
    () => groupByOwner(pending.data?.migrations ?? []),
    [pending.data?.migrations]
  )

  const total = pending.data?.total ?? 0
  const unrelated = groups.filter((g) => g.owner !== target?.name)

  /** A build, or a module this process cannot see, means the process must cycle. */
  const willRestart = Boolean(target && (target.requiresBuild || !target.loaded))

  const info = deployment.data
  const restart = info
    ? restartCopy(info.restartKind, {
        workers: info.workers,
        seconds: info.bootMs ? `${Math.max(1, Math.round(info.bootMs / 1000))}s` : 'a few seconds',
        hint: info.restartHint,
        supervisorLabel: info.supervisor ?? 'the supervisor',
      })
    : null

  const manual = info?.restartKind === 'manual'

  async function onConfirm() {
    if (!target) return
    setError(null)
    try {
      const started = await start.mutateAsync(target.name)
      onStarted(started.jobId)
      onOpenChange(false)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to start the install'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Install {target?.label}</DialogTitle>
          <DialogDescription>
            Here is everything this will do before anything happens.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 1 — migrations */}
          {canListMigrations ? (
            pending.isLoading ? (
              <p className="text-sm text-muted-foreground">Checking the database…</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Database className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>
                    <span className="font-medium tabular-nums">{total}</span>{' '}
                    {total === 1 ? 'migration' : 'migrations'} will be applied.
                  </span>
                </div>

                {unrelated.length > 0 ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                    <p className="text-amber-900 dark:text-amber-200">
                      This also applies migrations that don&apos;t belong to {target?.label}.
                      Database migrations can&apos;t be applied selectively — they run in order,
                      all together.
                    </p>
                  </div>
                ) : null}

                {total > 0 ? (
                  <div className="max-h-40 space-y-3 overflow-y-auto rounded-lg border border-border p-3">
                    {groups.map((group) => (
                      <div key={`${group.origin}:${group.owner ?? ''}`} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            {ORIGIN_LABEL[group.origin]}
                          </Badge>
                          {group.owner ? (
                            <span className="text-xs font-medium">{group.owner}</span>
                          ) : null}
                        </div>
                        <ul className="space-y-0.5 pl-1">
                          {group.names.map((name) => (
                            <li
                              key={name}
                              className="truncate font-mono text-xs text-muted-foreground"
                              title={name}
                            >
                              {shortName(name)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          ) : (
            /* 2 — the honest gap for a drop-in */
            <div className="flex items-start gap-2 text-sm">
              <Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-muted-foreground">
                This module isn&apos;t loaded in the running server yet, so its migrations
                can&apos;t be listed until the installer starts. They will be applied.
              </p>
            </div>
          )}

          {/* 3 — the build */}
          {target?.requiresBuild ? (
            <div className="flex items-start gap-2 text-sm">
              <Hammer className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-muted-foreground">
                This module ships admin pages, so the front-end will be rebuilt.{' '}
                <span className="font-medium text-foreground">This takes a few minutes</span> and
                the site keeps serving the whole time.
              </p>
            </div>
          ) : null}

          {/* 4 — the restart */}
          {willRestart ? (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <RefreshCw className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium">{restart?.title ?? 'The server will restart.'}</p>
                {restart ? (
                  <p className="mt-0.5 text-muted-foreground">{restart.detail}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm">
              <Power className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-muted-foreground">
                No restart needed — this module is already loaded and ships no pages to rebuild.
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            This changes your database schema and cannot be undone from here. Back up first if this
            is production.
          </p>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={start.isPending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={start.isPending} className="gap-2">
            {start.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {manual && willRestart ? 'Install (you restart at the end)' : 'Install'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

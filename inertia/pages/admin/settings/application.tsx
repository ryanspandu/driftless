import { useMemo, useState } from 'react'
import { Link } from '@inertiajs/react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { BackButton } from '~/components/admin/back-button'
import { PageHeader } from '~/components/admin/page-header'
import { ModulesTable } from '~/components/admin/modules-table'
import { ModuleInstallDialog, type InstallTarget } from '~/components/admin/module-install-dialog'
import { ModuleInstallProgress } from '~/components/admin/module-install-progress'
import { ModuleUninstallDialog } from '~/components/admin/module-uninstall-dialog'
import { Can, useCan } from '~/components/providers/ability-provider'
import { useUrlState } from '~/hooks/use-url-state'
import { useModulesList, useToggleModule } from '~/hooks/api/use-modules'
import {
  useDetectedModules,
  useLatestModuleInstallJob,
  type DetectedModule,
} from '~/hooks/api/use-module-install'
import { apiErrorMessage } from '~/lib/api-client'
import type { ModuleDto } from '~/types/api'

/**
 * Enough to render the progress panel before the first fetch lands, and to
 * remember a dismissal without a column and an endpoint for it.
 */
const JOB_STORAGE_KEY = 'driftless:module-install-job'
const JOB_DISMISSED_KEY = 'driftless:module-install-dismissed'

/** The tab values `?tab=` accepts. Anything else falls back to `apps`. */
const TABS = ['apps', 'plugins'] as const

/**
 * Folders present in `modules/` that this server never imported.
 *
 * A deliberate exception to the "always use the shared DataTable" rule: this is
 * an attention callout for zero to two rows with no sorting, searching or
 * paging to offer, and a full table toolbar plus a "Rows per page" footer above
 * a single unloaded folder reads worse on every axis.
 *
 * It sits **above** the tabs because an unloaded module has no `kind` to sort it
 * into one — reading that would mean importing an unknown manifest into the
 * live process, which is exactly what the installer's separate child exists to
 * avoid.
 */
function FoundOnDisk({
  folders,
  busy,
  onInstall,
}: {
  folders: DetectedModule[]
  busy: boolean
  onInstall: (folder: DetectedModule) => void
}) {
  if (folders.length === 0) return null

  return (
    <section className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">Found on disk ({folders.length})</p>
      {folders.map((folder) => (
        <div
          key={folder.name}
          className="flex items-center justify-between gap-4 rounded-md bg-card/50 px-3 py-2"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-mono text-sm font-medium">{folder.name}</p>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                Not loaded
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Installing it will restart the server.</p>
          </div>
          <Can permission="module:install">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onInstall(folder)}>
              Install
            </Button>
          </Can>
        </div>
      ))}
    </section>
  )
}

function ModulesManager() {
  /**
   * The tab lives in the URL so "the plugins list" is a link someone can paste,
   * and a reload comes back to the same panel. Derived, not mirrored into
   * state — a `useState` copy shows the old tab for a frame after a back-button
   * navigation.
   */
  const url = useUrlState()
  const tab = url.one('tab', TABS, 'apps')

  const modulesList = useModulesList()
  const toggleModule = useToggleModule()
  const modules = modulesList.data ?? []

  const [installing, setInstalling] = useState<InstallTarget | null>(null)
  const [uninstalling, setUninstalling] = useState<ModuleDto | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  /**
   * Only fetched for whoever may actually install; for everyone else these
   * endpoints 403 and requesting them would put an error in every console.
   */
  const canInstall = useCan('module:install')
  const detected = useDetectedModules(canInstall)
  const latestJob = useLatestModuleInstallJob(canInstall)

  const detectedByName = useMemo(
    () => new Map((detected.data?.modules ?? []).map((d) => [d.name, d])),
    [detected.data?.modules]
  )

  /** Folders on disk that this server never imported. */
  const notLoaded = useMemo(
    () => (detected.data?.modules ?? []).filter((d) => !d.loaded),
    [detected.data?.modules]
  )

  /**
   * The `?? 'app'` is belt-and-braces. The field is required on the wire, but a
   * cached response from a server that has not been redeployed yet would be
   * missing it, and an unclassified module should appear somewhere rather than
   * in neither tab.
   */
  const apps = useMemo(() => modules.filter((m) => (m.kind ?? 'app') === 'app'), [modules])
  const plugins = useMemo(() => modules.filter((m) => m.kind === 'plugin'), [modules])

  /**
   * The job to show.
   *
   * The server answer is the real mechanism — it is what makes a result
   * survive a reload, or appear for a second admin watching the same page.
   * `sessionStorage` only lets the panel render before the first fetch lands,
   * and doubles as the dismissal record so no `dismissed_at` column is needed.
   */
  const [dismissedJobId, setDismissedJobId] = useState<string | null>(() =>
    typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(JOB_DISMISSED_KEY)
  )
  const [startedJobId, setStartedJobId] = useState<string | null>(() =>
    typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(JOB_STORAGE_KEY)
  )

  const serverJobId = latestJob.data?.job?.id ?? null
  const candidateJobId = serverJobId ?? startedJobId
  const activeJobId = candidateJobId === dismissedJobId ? null : candidateJobId

  function setActiveJobId(jobId: string) {
    setStartedJobId(jobId)
    setDismissedJobId(null)
    sessionStorage.removeItem(JOB_DISMISSED_KEY)
  }

  function dismissJob() {
    if (!activeJobId) return
    setDismissedJobId(activeJobId)
    sessionStorage.setItem(JOB_DISMISSED_KEY, activeJobId)
  }

  /**
   * Only reachable for a module whose tables exist — the Switch is disabled
   * otherwise, so there is no "install first" error path left to write.
   *
   * The `onError` matters: this mutation has none of its own and neither does
   * the query client, so without it a failed toggle is completely silent and
   * the switch simply snaps back.
   */
  function onToggle(mod: ModuleDto, enabled: boolean) {
    setToggleError(null)
    toggleModule.mutate(
      { name: mod.name, enabled },
      { onError: (err) => setToggleError(apiErrorMessage(err, 'Failed to update the module')) }
    )
  }

  return (
    <div className="space-y-4">
      {toggleError ? (
        <p className="text-sm text-destructive" role="alert">
          {toggleError}
        </p>
      ) : null}

      {/*
        Page-scoped, not tab-scoped: at most one install runs at a time, so the
        panel belongs above the tabs where a tab switch cannot hide it.
      */}
      {activeJobId ? <ModuleInstallProgress jobId={activeJobId} onDismiss={dismissJob} /> : null}

      <FoundOnDisk
        folders={notLoaded}
        busy={Boolean(activeJobId)}
        onInstall={(folder) =>
          setInstalling({
            name: folder.name,
            label: folder.name,
            loaded: false,
            requiresBuild: folder.requiresBuild,
          })
        }
      />

      <Tabs
        value={tab}
        // 'apps' is the default, so it stays out of the URL entirely.
        onValueChange={(value) => url.set({ tab: value === 'apps' ? undefined : value })}
      >
        <TabsList>
          <TabsTrigger value="apps">Apps ({apps.length})</TabsTrigger>
          <TabsTrigger value="plugins">Plugins ({plugins.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="apps" className="pt-4">
          <ModulesTable
            modules={apps}
            isLoading={modulesList.isLoading}
            paramPrefix="apps"
            emptyMessage="No apps installed."
            togglingName={toggleModule.isPending ? toggleModule.variables?.name : undefined}
            installBusy={Boolean(activeJobId)}
            onToggle={onToggle}
            onInstall={(m) =>
              setInstalling({
                name: m.name,
                label: m.label,
                loaded: true,
                requiresBuild: detectedByName.get(m.name)?.requiresBuild ?? false,
              })
            }
            onUninstall={setUninstalling}
          />
        </TabsContent>

        <TabsContent value="plugins" className="pt-4">
          <ModulesTable
            modules={plugins}
            isLoading={modulesList.isLoading}
            paramPrefix="plugins"
            emptyMessage="No plugins installed. Drop a package folder into modules/ and install it from the band above."
            togglingName={toggleModule.isPending ? toggleModule.variables?.name : undefined}
            installBusy={Boolean(activeJobId)}
            onToggle={onToggle}
            onInstall={(m) =>
              setInstalling({
                name: m.name,
                label: m.label,
                loaded: true,
                requiresBuild: detectedByName.get(m.name)?.requiresBuild ?? false,
              })
            }
            onUninstall={setUninstalling}
          />
        </TabsContent>
      </Tabs>

      <ModuleInstallDialog
        target={installing}
        open={installing !== null}
        onOpenChange={(open) => !open && setInstalling(null)}
        onStarted={(jobId) => {
          setActiveJobId(jobId)
          sessionStorage.setItem(JOB_STORAGE_KEY, jobId)
        }}
      />

      <ModuleUninstallDialog
        module={uninstalling}
        open={uninstalling !== null}
        onOpenChange={(open) => !open && setUninstalling(null)}
      />
    </div>
  )
}

export default function ApplicationSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BackButton href="/admin/settings" label="Back to settings" />
        <PageHeader
          className="flex-1"
          title="Modules"
          subtitle={
            <>
              Apps and plugins under <code>modules/</code>. Disabling one hides its routes and
              sidebar group but keeps all of its data.{' '}
              {/*
                Signpost for anyone who bookmarked this page for the public-site
                toggle. Safe to delete a release or two after it ships.
              */}
              <span className="text-muted-foreground">
                Public site and sidebar menus moved to{' '}
                <Link href="/admin/settings/general" className="underline underline-offset-2">
                  Settings → General
                </Link>
                .
              </span>
            </>
          }
        />
      </div>
      <Can
        permission="settings:manage"
        fallback={
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to manage application settings.
          </p>
        }
      >
        <ModulesManager />
      </Can>
    </div>
  )
}

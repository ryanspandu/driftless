import { useMemo, useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { PageHeader } from '~/components/admin/page-header'
import {
  ModuleInstallDialog,
  type InstallTarget,
} from '~/components/admin/module-install-dialog'
import { ModuleInstallProgress } from '~/components/admin/module-install-progress'
import { ModuleUninstallDialog } from '~/components/admin/module-uninstall-dialog'
import { Can, useCan } from '~/components/providers/ability-provider'
import { useWebsiteSettings, useUpdateWebsiteSettings } from '~/hooks/api/use-website-settings'
import { useModulesList, useToggleModule } from '~/hooks/api/use-modules'
import {
  useDetectedModules,
  useLatestModuleInstallJob,
} from '~/hooks/api/use-module-install'
import { apiErrorMessage } from '~/lib/api-client'
import type { ModuleDto } from '~/types/api'

/**
 * Enough to render the progress panel before the first fetch lands, and to
 * remember a dismissal without a column and an endpoint for it.
 */
const JOB_STORAGE_KEY = 'driftless:module-install-job'
const JOB_DISMISSED_KEY = 'driftless:module-install-dismissed'

/** Core sidebar groups the user may hide. Dashboard + Settings always stay. */
const HIDEABLE_NAV = [
  'Analytics',
  'UI',
  'Media',
  'Collections',
  'Integrations',
  'User Management',
]

function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string
  description?: string | null
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

function ApplicationSettings() {
  const { data } = useWebsiteSettings()
  const update = useUpdateWebsiteSettings()
  const appCfg = data?.sections?.['app_config'] ?? {}
  const landingEnabled = (appCfg['landing_enabled'] ?? '1') !== '0'
  // Mirrors the server default in `WEB_DEFAULTS.app_config` — off unless opted in.
  const registrationEnabled = (appCfg['registration_enabled'] ?? '0') === '1'
  const hidden = useMemo(
    () =>
      new Set(
        (appCfg['hidden_nav'] ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    [appCfg]
  )
  const patch = (key: string, value: string) =>
    update.mutate({ patches: [{ section: 'app_config', key, value }] })

  const modulesList = useModulesList()
  const toggleModule = useToggleModule()
  const modules = modulesList.data ?? []

  const [installing, setInstalling] = useState<InstallTarget | null>(null)
  const [uninstalling, setUninstalling] = useState<ModuleDto | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  /**
   * Only visible to whoever may actually install; for everyone else these
   * endpoints 403 and fetching them would put an error in every console.
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
   * Disabling never needs the database, so it goes straight through. Enabling
   * an unready module used to silently open the install dialog; that is now an
   * explicit button, and the switch does only what a switch appears to do.
   *
   * The `catch` matters: this mutation had no error handling at all, and
   * neither did the query client, so a failed toggle was completely silent —
   * the switch simply snapped back with no explanation.
   */
  function onToggleModule(mod: ModuleDto, enabled: boolean) {
    setToggleError(null)

    if (enabled && !mod.schemaReady) {
      setToggleError(
        `${mod.label} has no database tables yet. Use the Install button next to it first.`
      )
      return
    }

    toggleModule.mutate(
      { name: mod.name, enabled },
      { onError: (err) => setToggleError(apiErrorMessage(err, 'Failed to update the module')) }
    )
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Public site</h2>
          <p className="text-xs text-muted-foreground">
            Turn the public-facing site on or off for a dashboard-only SAAS.
          </p>
        </div>
        <ToggleRow
          title="Landing page & public pages"
          description="When off, the landing and public posts redirect to the dashboard / login."
          checked={landingEnabled}
          disabled={update.isPending}
          onChange={(on) => patch('landing_enabled', on ? '1' : '0')}
        />
        <ToggleRow
          title="Public sign-up"
          description="Let anyone create an account at /register. New accounts get the MEMBER role, which holds no permissions — grant capabilities explicitly. Off by default."
          checked={registrationEnabled}
          disabled={update.isPending}
          onChange={(on) => patch('registration_enabled', on ? '1' : '0')}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Dashboard management</h2>
          <p className="text-xs text-muted-foreground">
            Hide core menus you don&apos;t use — their pages return 404 when off. Dashboard and
            Settings always stay.
          </p>
        </div>
        <div className="space-y-2">
          {HIDEABLE_NAV.map((title) => (
            <ToggleRow
              key={title}
              title={title}
              checked={!hidden.has(title)}
              disabled={update.isPending}
              onChange={(visible) => {
                const next = new Set(hidden)
                if (visible) next.delete(title)
                else next.add(title)
                patch('hidden_nav', Array.from(next).join(','))
              }}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Modules</h2>
          <p className="text-xs text-muted-foreground">
            First-party app areas under <code>modules/</code>. Disabling one hides its routes and
            sidebar group but keeps all of its data.
          </p>
        </div>

        {toggleError ? (
          <p className="text-sm text-destructive" role="alert">
            {toggleError}
          </p>
        ) : null}

        {/*
          Survives a page reload, a second tab, and a different admin: the job
          row is the state, and only one can be active at a time.
        */}
        {activeJobId ? (
          <ModuleInstallProgress jobId={activeJobId} onDismiss={dismissJob} />
        ) : null}

        {modules.length === 0 && notLoaded.length === 0 ? (
          <p className="text-sm text-muted-foreground">No modules installed.</p>
        ) : (
          <div className="space-y-2">
            {modules.map((m) => (
              <div
                key={m.name}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{m.label}</p>
                    {!m.schemaReady ? (
                      <Badge variant="warning" className="text-[10px] uppercase tracking-wide">
                        Setup required
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{m.description}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/*
                    An explicit button rather than the old behaviour, where
                    flipping the switch on an unready module silently meant
                    "install" — a side effect the operator never asked for.
                  */}
                  {!m.schemaReady ? (
                    <Can permission="module:install">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={Boolean(activeJobId)}
                        onClick={() =>
                          setInstalling({
                            name: m.name,
                            label: m.label,
                            loaded: true,
                            requiresBuild: detectedByName.get(m.name)?.requiresBuild ?? false,
                          })
                        }
                      >
                        Install
                      </Button>
                    </Can>
                  ) : null}
                  {m.schemaReady && m.canUninstall && !m.enabled ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setUninstalling(m)}
                    >
                      Uninstall
                    </Button>
                  ) : null}
                  <Switch
                    checked={m.enabled}
                    disabled={toggleModule.isPending && toggleModule.variables?.name === m.name}
                    onCheckedChange={(enabled) => onToggleModule(m, enabled)}
                  />
                </div>
              </div>
            ))}

            {/*
              Folders this server has not loaded — a package dropped in after
              boot. Rendered with the folder name only: importing an unknown
              manifest just to read its label would mean executing arbitrary
              code in the live process with no way to unload it.
            */}
            {notLoaded.map((d) => (
              <div
                key={d.name}
                className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-border bg-card/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm font-medium">{d.name}</p>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                      Found on disk
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Not loaded yet — installing it will restart the server.
                  </p>
                </div>

                <Can permission="module:install">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(activeJobId)}
                    onClick={() =>
                      setInstalling({
                        name: d.name,
                        label: d.name,
                        loaded: false,
                        requiresBuild: d.requiresBuild,
                      })
                    }
                  >
                    Install
                  </Button>
                </Can>
              </div>
            ))}
          </div>
        )}
      </section>

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
      <PageHeader
        title="Application"
        subtitle="Toggle the public site, sidebar menus, and modules."
      />
      <Can
        permission="settings:manage"
        fallback={
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to manage application settings.
          </p>
        }
      >
        <ApplicationSettings />
      </Can>
    </div>
  )
}

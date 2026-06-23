import { useMemo } from 'react'
import { Switch } from '~/components/ui/switch'
import { PageHeader } from '~/components/admin/page-header'
import { Can } from '~/components/providers/ability-provider'
import { useWebsiteSettings, useUpdateWebsiteSettings } from '~/hooks/api/use-website-settings'
import { useModulesList, useToggleModule } from '~/hooks/api/use-modules'

/** Core sidebar groups the user may hide. Dashboard + Settings always stay. */
const HIDEABLE_NAV = [
  'Analytics',
  'UI',
  'Media',
  'Collections',
  'Plugins',
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
            sidebar group.
          </p>
        </div>
        {modules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No modules installed.</p>
        ) : (
          <div className="space-y-2">
            {modules.map((m) => (
              <ToggleRow
                key={m.name}
                title={m.label}
                description={m.description}
                checked={m.enabled}
                disabled={toggleModule.isPending}
                onChange={(enabled) => toggleModule.mutate({ name: m.name, enabled })}
              />
            ))}
          </div>
        )}
      </section>
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

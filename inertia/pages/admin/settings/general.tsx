import { useMemo } from 'react'
import { Switch } from '~/components/ui/switch'
import { BackButton } from '~/components/admin/back-button'
import { PageHeader } from '~/components/admin/page-header'
import { Can } from '~/components/providers/ability-provider'
import { useWebsiteSettings, useUpdateWebsiteSettings } from '~/hooks/api/use-website-settings'

/**
 * Core sidebar groups the user may hide. Dashboard and Settings always stay —
 * hiding Settings would remove the only way back to this page.
 *
 * Kept in step by hand with `navEntries` in `~/components/admin/sidebar.tsx`
 * and `PATH_NAV` in `app/middleware/nav_enabled_middleware.ts`; all three key
 * on the same title strings, so a group listed here and missing from either of
 * the others is a toggle that does nothing.
 *
 * `Integrations` was removed along with its sidebar entry: it is reached from
 * the Settings hub now, so there is no menu to hide. A stored `Integrations`
 * value left over in `hidden_nav` is inert — it matches no entry.
 */
const HIDEABLE_NAV = ['Analytics', 'UI', 'Media', 'Collections', 'User Management']

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

/**
 * Both sections write to the same `app_config` settings section through one
 * mutation, which is why they are not split into panel components: doing so
 * would mean either two copies of the mutation hook or prop-drilling `patch`
 * and `update.isPending` through a boundary that buys nothing.
 */
function GeneralSettings() {
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
                /**
                 * Unhiding everything writes an empty string, which
                 * `applyPatches` treats as "drop the override row" — the same
                 * state as never having set it.
                 */
                patch('hidden_nav', Array.from(next).join(','))
              }}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

export default function GeneralSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BackButton href="/admin/settings" label="Back to settings" />
        <PageHeader
          title="General"
          subtitle="Turn the public site on or off, and choose which sidebar menus appear."
          className="flex-1"
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
        <GeneralSettings />
      </Can>
    </div>
  )
}

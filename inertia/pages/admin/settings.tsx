import { Link } from '@inertiajs/react'
import { type ReactNode } from 'react'
import {
  BookOpen,
  ChevronRight,
  ExternalLink,
  FileJson,
  Globe,
  KeyRound,
  Mail,
  Package,
  Palette,
  Plug2,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { PageHeader } from '~/components/admin/page-header'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Can, useAbility } from '~/components/providers/ability-provider'

/**
 * The Settings hub — links only.
 *
 * It used to be a hub *and* an editor: two live forms sat above the link cards,
 * inside a tab set whose labels hid what was in them (the 404/500 overrides
 * were filed under "Login & register"). Every form now lives on its own page,
 * so this screen has exactly one job and every card reads the same way.
 */
export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        subtitle="Appearance, the public site, email, modules, integrations and developer access."
      />

      <Can permission="settings:manage">
        <div className="space-y-8">
          <SettingsSection
            title="Look & feel"
            description="How the admin shell and the built-in public screens appear."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsLinkCard
                icon={Palette}
                title="Appearance"
                description="Admin panel name and logo, the sign-in screens, and which of your pages replace the built-in login, register and error pages."
                href="/admin/settings/appearance"
              />
            </div>
          </SettingsSection>

          <SettingsSection
            title="Site & content"
            description="Public-facing configuration, managed on dedicated pages."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsLinkCard
                icon={SlidersHorizontal}
                title="General"
                description="Turn the public site on or off, and choose which sidebar menus appear."
                href="/admin/settings/general"
              />
              <SettingsLinkCard
                icon={Globe}
                title="Website settings"
                description="Public site title, favicon, site-wide SEO meta, and global custom CSS/JS."
                href="/admin/website-settings"
              />
              <SettingsLinkCard
                icon={Package}
                title="Modules"
                description="Install, enable and remove apps and plugins under modules/."
                href="/admin/settings/application"
              />
              <SettingsLinkCard
                icon={Mail}
                title="Email"
                description="SMTP credentials, which emails send, editable copy, and a delivery log."
                href="/admin/settings/email"
              />
            </div>
          </SettingsSection>

          <SettingsSection title="Integrations" description="Connect external services.">
            <SettingsLinkCard
              icon={Plug2}
              title="Integrations"
              description="Google OAuth, CAPTCHA, Google Analytics 4, and Microsoft Clarity."
              href="/admin/integrations"
            />
          </SettingsSection>

          <SettingsSection
            title="Developer & API"
            description="Programmatic access to your content via the external API."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsLinkCard
                icon={KeyRound}
                title="API tokens"
                description="Personal access tokens for the /api/v1 API — scoped abilities, expiry, one-time reveal."
                href="/admin/settings/api-tokens"
              />
              {import.meta.env.DEV ? (
                <>
                  <SettingsLinkCard
                    external
                    badge="Dev only"
                    icon={BookOpen}
                    title="Interactive API docs"
                    description="Scalar UI for the JSON API (/api/docs). Not available in production."
                    href="/api/docs"
                  />
                  <SettingsLinkCard
                    external
                    badge="Dev only"
                    icon={FileJson}
                    title="OpenAPI spec"
                    description="Raw OpenAPI 3.0 JSON (/api/openapi). Not available in production."
                    href="/api/openapi"
                  />
                </>
              ) : null}
            </div>
          </SettingsSection>
        </div>
      </Can>

      <SettingsDeniedCard />
    </div>
  )
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

/**
 * A jump-off card linking to another settings surface. Internal targets use the
 * Inertia Link; `external` targets (e.g. the dev-only API docs) use a plain
 * anchor that opens in a new tab.
 */
function SettingsLinkCard({
  icon: Icon,
  title,
  description,
  href,
  external = false,
  badge,
}: {
  icon: LucideIcon
  title: string
  description: string
  href: string
  external?: boolean
  badge?: string
}) {
  const inner = (
    <Card className="h-full transition-colors hover:bg-accent/40">
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{title}</span>
            {badge ? (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {badge}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {external ? (
          <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </CardContent>
    </Card>
  )

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block">
        {inner}
      </a>
    )
  }
  return (
    <Link href={href} className="block">
      {inner}
    </Link>
  )
}

function SettingsDeniedCard() {
  const { permissions } = useAbility()
  if (permissions.has('settings:manage')) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Settings</CardTitle>
        <CardDescription>
          You need the <code className="rounded bg-muted px-1 text-xs">settings:manage</code>{' '}
          permission to edit website name, logo, and integrations.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

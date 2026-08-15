import { Link } from '@inertiajs/react'
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  ChevronRight,
  ExternalLink,
  FileJson,
  Globe,
  KeyRound,
  Mail,
  Package,
  Plug2,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from '~/hooks/use-inertia-url'
import { mergeSearchParamsLive, replaceUrlIfChanged } from '~/lib/table-url-params'
import { WEBSITE_SETTING_SECTIONS } from '~/types/api'
import { ImageSettingControl } from '~/components/admin/image-setting-control'
import { WebsiteLogoDropzone } from '~/components/admin/website-logo-dropzone'
import { PageHeader } from '~/components/admin/page-header'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { Can, useAbility } from '~/components/providers/ability-provider'
import { useUpdateWebsiteSettings, useWebsiteSettings } from '~/hooks/api/use-website-settings'

const AUTH_DEFAULT_BG = '/bg-login.webp'
const AUTH_DEFAULT_LOGO = '/logo-text.svg'

export default function SettingsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Active tab lives in `?tab=` so each section is linkable. `admin-sidebar` is
  // the default and is omitted from the URL.
  const tab = useMemo(() => {
    const t = searchParams.get('tab')
    return t === 'auth-pages' ? t : 'admin-sidebar'
  }, [searchParams])
  const onTabChange = (value: string) => {
    const merged = mergeSearchParamsLive(searchParams, {
      tab: value === 'admin-sidebar' ? undefined : value,
    })
    replaceUrlIfChanged(pathname, router, merged, { scroll: false })
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        subtitle="Admin appearance, login pages, integrations, and developer access."
      />

      <Can permission="settings:manage">
        <div className="space-y-8">
          <SettingsSection
            title="Appearance"
            description="How the admin shell and the sign-in pages look."
          >
            <Tabs value={tab} onValueChange={(value) => onTabChange(value as string)}>
              <TabsList className="grid h-auto grid-cols-1 gap-1 sm:grid-cols-2">
                <TabsTrigger value="admin-sidebar">Admin sidebar</TabsTrigger>
                <TabsTrigger value="auth-pages">Login &amp; register</TabsTrigger>
              </TabsList>

              <TabsContent value="admin-sidebar" className="mt-4">
                <AdminSidebarSection />
              </TabsContent>
              <TabsContent value="auth-pages" className="mt-4">
                <AuthPagesSection />
              </TabsContent>
            </Tabs>
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
                description="SMTP credentials for transactional email — order receipts, resets. Send a test message."
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

function AdminSidebarSection() {
  const { data, isPending } = useWebsiteSettings()
  const update = useUpdateWebsiteSettings()
  const ab = data?.sections?.[WEBSITE_SETTING_SECTIONS.ADMIN_BRANDING]
  const [projectName, setProjectName] = useState('Driftless')
  const [projectTagline, setProjectTagline] = useState('CMS Admin')
  const [logoUrl, setLogoUrl] = useState('/logo.svg')
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!ab) return
    setProjectName(ab.project_name ?? 'Driftless')
    setProjectTagline(ab.project_tagline ?? 'CMS Admin')
    setLogoUrl(ab.logo_url ?? '/logo.svg')
  }, [ab])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    try {
      await update.mutateAsync({
        patches: [
          {
            section: WEBSITE_SETTING_SECTIONS.ADMIN_BRANDING,
            key: 'project_name',
            value: projectName.trim() || 'Driftless',
          },
          {
            section: WEBSITE_SETTING_SECTIONS.ADMIN_BRANDING,
            key: 'project_tagline',
            value: projectTagline.trim(),
          },
          {
            section: WEBSITE_SETTING_SECTIONS.ADMIN_BRANDING,
            key: 'logo_url',
            value: logoUrl.trim() || '/logo.svg',
          },
        ],
      })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardDescription>
            Name, tagline, and logo in the admin shell (stored as key–value rows in the database).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <WebsiteLogoDropzone value={logoUrl} onChange={setLogoUrl} disabled={isPending} />
          <div className="space-y-2">
            <Label htmlFor="projectName">Website name</Label>
            <Input
              id="projectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Driftless"
              autoComplete="off"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="projectTagline">Sidebar tagline</Label>
            <Input
              id="projectTagline"
              value={projectTagline}
              onChange={(e) => setProjectTagline(e.target.value)}
              placeholder="CMS Admin"
              autoComplete="off"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Short line under the website name in the sidebar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending || update.isPending}>
              Save admin sidebar
            </Button>
          </div>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          {saved ? (
            <p className="text-sm text-green-600 dark:text-green-500" role="status">
              Admin sidebar saved.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </form>
  )
}

function AuthPagesSection() {
  const { data, isPending } = useWebsiteSettings()
  const update = useUpdateWebsiteSettings()
  const ap = data?.sections?.[WEBSITE_SETTING_SECTIONS.AUTH_PAGES]
  const [backgroundUrl, setBackgroundUrl] = useState(AUTH_DEFAULT_BG)
  const [logoUrl, setLogoUrl] = useState(AUTH_DEFAULT_LOGO)
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!ap) return
    setBackgroundUrl(ap.background_url ?? AUTH_DEFAULT_BG)
    setLogoUrl(ap.logo_url ?? AUTH_DEFAULT_LOGO)
  }, [ap])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    try {
      await update.mutateAsync({
        patches: [
          {
            section: WEBSITE_SETTING_SECTIONS.AUTH_PAGES,
            key: 'background_url',
            value: backgroundUrl.trim() || AUTH_DEFAULT_BG,
          },
          {
            section: WEBSITE_SETTING_SECTIONS.AUTH_PAGES,
            key: 'logo_url',
            value: logoUrl.trim() || AUTH_DEFAULT_LOGO,
          },
        ],
      })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardDescription>
            Left panel on sign-in and sign-up: background image and logo. Uses the same layout for
            both pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ImageSettingControl
            label="Background image"
            value={backgroundUrl}
            onChange={setBackgroundUrl}
            defaultAsset={AUTH_DEFAULT_BG}
            resetLabel="Use default background"
            disabled={isPending}
            preview="wide"
          />
          <ImageSettingControl
            label="Panel logo"
            value={logoUrl}
            onChange={setLogoUrl}
            defaultAsset={AUTH_DEFAULT_LOGO}
            resetLabel="Use default logo"
            disabled={isPending}
            preview="square"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending || update.isPending}>
              Save login &amp; register
            </Button>
          </div>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          {saved ? (
            <p className="text-sm text-green-600 dark:text-green-500" role="status">
              Login &amp; register appearance saved.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </form>
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

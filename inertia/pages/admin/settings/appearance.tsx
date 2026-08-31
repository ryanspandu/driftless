import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from '@inertiajs/react'
import { PAGE_ROLE_SLOTS, WEBSITE_SETTING_SECTIONS } from '~/types/api'
import { ImageSettingControl } from '~/components/admin/image-setting-control'
import { WebsiteLogoDropzone } from '~/components/admin/website-logo-dropzone'
import { BackButton } from '~/components/admin/back-button'
import { PageHeader } from '~/components/admin/page-header'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { AppSelect, type AppSelectOption } from '~/components/ui/app-select'
import { Can } from '~/components/providers/ability-provider'
import { useUpdateWebsiteSettings, useWebsiteSettings } from '~/hooks/api/use-website-settings'
import { usePagesList } from '~/hooks/api/use-pages'

const AUTH_DEFAULT_BG = '/bg-login.webp'
const AUTH_DEFAULT_LOGO = '/logo-text.svg'

/**
 * Appearance — how the admin shell and the built-in public screens look.
 *
 * Split out of the Settings hub, which was simultaneously a hub and an editor:
 * two live forms sat above four link cards, and the forms were buried in a
 * tab set whose labels ("Admin sidebar" / "Login & register") hid the fact that
 * the 404 and 500 overrides were in there too.
 *
 * Three stacked cards rather than three tabs. One card per group is not enough
 * content to justify hiding two thirds of it behind a control.
 */
export default function AppearanceSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BackButton href="/admin/settings" label="Back to settings" />
        <PageHeader
          title="Appearance"
          subtitle="Admin shell branding, the sign-in screens, and which of your pages replace the built-in ones."
          className="flex-1"
        />
      </div>

      <Can
        permission="settings:manage"
        fallback={
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to edit appearance settings.
          </p>
        }
      >
        <div className="space-y-6">
          <AdminPanelSection />
          <AuthPagesSection />
          <PageOverridesSection />
        </div>
      </Can>
    </div>
  )
}

function AdminPanelSection() {
  const { data, isPending } = useWebsiteSettings()
  const update = useUpdateWebsiteSettings()
  const ab = data?.sections?.[WEBSITE_SETTING_SECTIONS.ADMIN_BRANDING]
  const [projectName, setProjectName] = useState('Driftless')
  const [projectTagline, setProjectTagline] = useState('Admin panel')
  const [logoUrl, setLogoUrl] = useState('/logo.svg')
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!ab) return
    setProjectName(ab.project_name ?? 'Driftless')
    setProjectTagline(ab.project_tagline ?? 'Admin panel')
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

/**
 * Which builder page stands in for each built-in screen — including the front
 * page (`/`). The slot list is shared with the resolver and the Pages dashboard
 * (`PAGE_ROLE_SLOTS` in `~/types/api`) so the two surfaces never drift. An empty
 * value means the built-in screen, and because `applyPatches` deletes rows whose
 * value is empty, choosing "Default" genuinely resets rather than storing a
 * sentinel.
 */
const PAGE_OVERRIDE_SLOTS = PAGE_ROLE_SLOTS

function PageOverridesSection() {
  const { data, isPending } = useWebsiteSettings()
  const pages = usePagesList()
  const update = useUpdateWebsiteSettings()
  const [values, setValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!data?.sections) return
    const next: Record<string, string> = {}
    for (const slot of PAGE_OVERRIDE_SLOTS) {
      next[slot.key] = data.sections[slot.section]?.[slot.key] ?? ''
    }
    setValues(next)
  }, [data])

  /**
   * Only Published builder pages are offered. A Draft would resolve to the
   * built-in screen anyway, so listing one would be an option that silently
   * does nothing.
   */
  const options = useMemo(
    () => (pages.data ?? []).filter((p) => p.status === 'PUBLISHED' && p.kind === 'BUILDER'),
    [pages.data]
  )

  /** Built once and shared by all six pickers rather than re-mapped in each. */
  const pageOptions = useMemo<AppSelectOption[]>(
    () => [
      { value: '', label: 'Default (built-in)' },
      ...options.map((p) => ({ value: p.id, label: `${p.title} — /${p.path}` })),
    ],
    [options]
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    try {
      await update.mutateAsync({
        patches: PAGE_OVERRIDE_SLOTS.map((slot) => ({
          section: slot.section,
          key: slot.key,
          value: values[slot.key] ?? '',
        })),
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
          <CardTitle className="text-base">Replace built-in pages</CardTitle>
          <CardDescription>
            Point a screen at a page you built in the page builder. Add a{' '}
            <strong>Login form</strong> or <strong>Sign-up form</strong> block to it so the form
            actually works. Leave a row on <em>Default</em> to keep the built-in screen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {options.length === 0 && !pages.isPending ? (
            <p className="text-sm text-muted-foreground">
              No published pages yet.{' '}
              <Link href="/admin/pages" className="font-medium text-primary hover:underline">
                Build one first
              </Link>
              .
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {PAGE_OVERRIDE_SLOTS.map((slot) => (
              <div key={slot.key} className="space-y-2">
                <Label htmlFor={slot.key}>{slot.label}</Label>
                <AppSelect
                  id={slot.key}
                  value={values[slot.key] ?? ''}
                  onChange={(value) => setValues((v) => ({ ...v, [slot.key]: value }))}
                  options={pageOptions}
                  disabled={isPending || pages.isPending}
                />
                <p className="text-xs text-muted-foreground">{slot.hint}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending || update.isPending}>
              Save page overrides
            </Button>
          </div>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          {saved ? (
            <p className="text-sm text-green-600 dark:text-green-500" role="status">
              Page overrides saved.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </form>
  )
}


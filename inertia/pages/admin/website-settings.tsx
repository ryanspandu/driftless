import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from '~/hooks/use-inertia-url'
import { mergeSearchParamsLive, replaceUrlIfChanged } from '~/lib/table-url-params'
import { WEBSITE_SETTING_SECTIONS } from '~/types/api'
import { BackButton } from '~/components/admin/back-button'
import { ImageSettingControl } from '~/components/admin/image-setting-control'
import { MetaTagsEditor, type MetaTag } from '~/components/admin/meta-tags-editor'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { AppSelect } from '~/components/ui/app-select'
import { Textarea } from '~/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { Can, useAbility } from '~/components/providers/ability-provider'
import { useUpdateWebsiteSettings, useWebsiteSettings } from '~/hooks/api/use-website-settings'
import { GlobalCodePanel } from '~/puck/global-code-panel'

const SITE_DEFAULT_FAVICON = '/logo.svg'
const SITE_DEFAULT_DESCRIPTION =
  'Driftless — a fast, modern content hub. Discover published articles and updates.'

/**
 * Public website settings — distinct from the admin-shell settings at
 * `/admin/settings`. Houses everything that affects the published website: site
 * title/description, favicon, site-wide meta tags, and site-wide custom code.
 */
export default function WebsiteSettingsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Active tab lives in `?tab=` so each section is linkable. `site-meta` is the
  // default and is omitted from the URL.
  const tab = useMemo(() => {
    const t = searchParams.get('tab')
    return t === 'custom-code' || t === 'appearance' || t === 'forms' ? t : 'site-meta'
  }, [searchParams])
  const onTabChange = (value: string) => {
    const merged = mergeSearchParamsLive(searchParams, {
      tab: value === 'site-meta' ? undefined : value,
    })
    replaceUrlIfChanged(pathname, router, merged, { scroll: false })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BackButton href="/admin/settings" label="Back to settings" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Website settings</h1>
          <p className="text-sm text-muted-foreground">
            Public site title, SEO, favicon, and custom code applied across your published pages.
          </p>
        </div>
      </div>

      <Can permission="settings:manage">
        <Tabs value={tab} onValueChange={(value) => onTabChange(value as string)}>
          <TabsList>
            <TabsTrigger value="site-meta">Site &amp; SEO</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="forms">Forms</TabsTrigger>
            <TabsTrigger value="custom-code">Custom code</TabsTrigger>
          </TabsList>

          <TabsContent value="site-meta" className="mt-4">
            <SiteMetaSection />
          </TabsContent>
          <TabsContent value="appearance" className="mt-4">
            <AppearanceSection />
          </TabsContent>
          <TabsContent value="forms" className="mt-4">
            <FormsSection />
          </TabsContent>
          <TabsContent value="custom-code" className="mt-4">
            <div className="h-[600px] overflow-hidden rounded-lg border bg-card">
              <GlobalCodePanel />
            </div>
          </TabsContent>
        </Tabs>
      </Can>

      <SettingsDeniedCard />
    </div>
  )
}

function SiteMetaSection() {
  const { data, isPending } = useWebsiteSettings()
  const update = useUpdateWebsiteSettings()
  const sm = data?.sections?.[WEBSITE_SETTING_SECTIONS.SITE_META]
  const [siteTitle, setSiteTitle] = useState('Driftless')
  const [siteDescription, setSiteDescription] = useState(SITE_DEFAULT_DESCRIPTION)
  const [faviconUrl, setFaviconUrl] = useState(SITE_DEFAULT_FAVICON)
  const [metaTags, setMetaTags] = useState<MetaTag[]>([])
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!sm) return
    setSiteTitle(sm.site_title ?? 'Driftless')
    setSiteDescription(sm.site_description ?? SITE_DEFAULT_DESCRIPTION)
    setFaviconUrl(sm.favicon_url ?? SITE_DEFAULT_FAVICON)
    try {
      const v = JSON.parse(sm.meta ?? '[]')
      setMetaTags(Array.isArray(v) ? v : [])
    } catch {
      setMetaTags([])
    }
  }, [sm])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    try {
      await update.mutateAsync({
        patches: [
          {
            section: WEBSITE_SETTING_SECTIONS.SITE_META,
            key: 'site_title',
            value: siteTitle.trim() || 'Driftless',
          },
          {
            section: WEBSITE_SETTING_SECTIONS.SITE_META,
            key: 'site_description',
            value: siteDescription.trim(),
          },
          {
            section: WEBSITE_SETTING_SECTIONS.SITE_META,
            key: 'favicon_url',
            value: faviconUrl.trim() || SITE_DEFAULT_FAVICON,
          },
          {
            section: WEBSITE_SETTING_SECTIONS.SITE_META,
            key: 'meta',
            value: JSON.stringify(metaTags),
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
            Default browser title, description, favicon, and site-wide custom meta tags. Applied on
            every public page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="siteTitle">Site title</Label>
            <Input
              id="siteTitle"
              value={siteTitle}
              onChange={(e) => setSiteTitle(e.target.value)}
              placeholder="Driftless"
              autoComplete="off"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="siteDescription">Meta description</Label>
            <Textarea
              id="siteDescription"
              value={siteDescription}
              onChange={(e) => setSiteDescription(e.target.value)}
              placeholder="Short description for search and sharing."
              rows={3}
              disabled={isPending}
            />
          </div>
          <ImageSettingControl
            label="Favicon"
            value={faviconUrl}
            onChange={setFaviconUrl}
            defaultAsset={SITE_DEFAULT_FAVICON}
            resetLabel="Use default favicon"
            disabled={isPending}
            preview="square"
          />

          <div className="border-t pt-4">
            <MetaTagsEditor tags={metaTags} onChange={setMetaTags} label="Global meta tags" />
            <p className="mt-2 text-xs text-muted-foreground">
              Injected into <code>&lt;head&gt;</code> on every published page (e.g.{' '}
              <code>theme-color</code>,<code>twitter:site</code>).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save site & SEO'}
            </Button>
          </div>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          {saved ? (
            <p className="text-sm text-green-600 dark:text-green-500" role="status">
              Site settings saved.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </form>
  )
}

function FormsSection() {
  const { data, isPending } = useWebsiteSettings()
  const update = useUpdateWebsiteSettings()
  const forms = data?.sections?.[WEBSITE_SETTING_SECTIONS.FORMS]
  const [webhookUrl, setWebhookUrl] = useState('')
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!forms) return
    setWebhookUrl(forms.webhook_url ?? '')
  }, [forms])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const url = webhookUrl.trim()
    if (url && !/^https:\/\//i.test(url)) {
      setFormError('Webhook URL must start with https://')
      return
    }
    try {
      await update.mutateAsync({
        patches: [{ section: WEBSITE_SETTING_SECTIONS.FORMS, key: 'webhook_url', value: url }],
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
            Where “Collect submissions” forms are delivered. Every submission is always saved to the
            Forms inbox; a webhook is an optional extra notification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="formsWebhook">Webhook URL (optional)</Label>
            <Input
              id="formsWebhook"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.example.com/…"
              autoComplete="off"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              On each non-spam submission we POST JSON{' '}
              <code>{'{ form, page, email, data, at }'}</code> here (5s timeout, fire-and-forget).
              Leave empty to disable.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save form settings'}
            </Button>
          </div>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          {saved ? (
            <p className="text-sm text-green-600 dark:text-green-500" role="status">
              Form settings saved.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </form>
  )
}

/** A curated set of Google Fonts (label → family + stylesheet href). */
const FONT_OPTIONS: { label: string; family: string; url: string }[] = [
  { label: 'System default', family: '', url: '' },
  {
    label: 'Inter',
    family: 'Inter',
    url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
  {
    label: 'Roboto',
    family: 'Roboto',
    url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
  },
  {
    label: 'Open Sans',
    family: 'Open Sans',
    url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap',
  },
  {
    label: 'Poppins',
    family: 'Poppins',
    url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
  },
  {
    label: 'Montserrat',
    family: 'Montserrat',
    url: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap',
  },
  {
    label: 'Lato',
    family: 'Lato',
    url: 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap',
  },
  {
    label: 'Playfair Display',
    family: 'Playfair Display',
    url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap',
  },
]

/** Read the CSRF token the app sets as a cookie, for the raw font upload fetch. */
function readXsrf(): string {
  const m = typeof document !== 'undefined' && document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return m ? decodeURIComponent(m[1]!) : ''
}

/** `rgb(r, g, b)` → `#rrggbb`. Empty string when it can't be parsed. */
function rgbToHex(rgb: string): string {
  const m = rgb.match(/\d+(\.\d+)?/g)
  if (!m || m.length < 3) return ''
  return (
    '#' +
    m
      .slice(0, 3)
      .map((n) => Math.round(Number(n)).toString(16).padStart(2, '0'))
      .join('')
  )
}

/**
 * Read the real public-theme default colours (from the `.theme-light` scope) as
 * hex, so the swatches show what's actually in use rather than black. The tokens
 * are authored in `oklch()`, which a color input can't take — resolving them via
 * a probe element's computed `color` converts them to rgb we can hex-encode.
 */
function readThemeDefaults(): { primary: string; secondary: string; accent: string } {
  const fallback = { primary: '#5225e6', secondary: '#f1f5f9', accent: '#f1f5f9' }
  if (typeof document === 'undefined') return fallback
  const host = document.createElement('div')
  host.className = 'theme-light'
  host.setAttribute('style', 'position:absolute;opacity:0;pointer-events:none;left:-9999px')
  host.innerHTML = '<span></span><span></span><span></span>'
  const spans = host.querySelectorAll('span')
  ;(spans[0] as HTMLElement).style.color = 'var(--primary)'
  ;(spans[1] as HTMLElement).style.color = 'var(--secondary)'
  ;(spans[2] as HTMLElement).style.color = 'var(--accent)'
  document.body.appendChild(host)
  const read = (el: Element) => rgbToHex(getComputedStyle(el).color)
  const out = {
    primary: read(spans[0]!) || fallback.primary,
    secondary: read(spans[1]!) || fallback.secondary,
    accent: read(spans[2]!) || fallback.accent,
  }
  document.body.removeChild(host)
  return out
}

function ColorField({
  label,
  value,
  defaultColor,
  onChange,
}: {
  label: string
  value: string
  /** The real theme default, shown in the swatch + placeholder while unset. */
  defaultColor: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || defaultColor || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent"
          aria-label={`${label} colour picker`}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={defaultColor || 'Default'}
          className="font-mono"
        />
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function AppearanceSection() {
  const { data, isPending } = useWebsiteSettings()
  const update = useUpdateWebsiteSettings()
  const theme = data?.sections?.[WEBSITE_SETTING_SECTIONS.THEME]

  const [fontUrl, setFontUrl] = useState('')
  const [fontFamily, setFontFamily] = useState('')
  const [fontFaceUrl, setFontFaceUrl] = useState('')
  const [fontCustomName, setFontCustomName] = useState('')
  const [primary, setPrimary] = useState('')
  const [secondary, setSecondary] = useState('')
  const [accent, setAccent] = useState('')
  const [defaults, setDefaults] = useState({
    primary: '#5225e6',
    secondary: '#f1f5f9',
    accent: '#f1f5f9',
  })
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // The real defaults are the public `.theme-light` values, not the dashboard's.
  useEffect(() => setDefaults(readThemeDefaults()), [])

  useEffect(() => {
    if (!theme) return
    setFontFamily(theme.font_family ?? '')
    setFontUrl(theme.font_css_url ?? '')
    setFontFaceUrl(theme.font_face_url ?? '')
    setFontCustomName(theme.font_custom_name ?? '')
    setPrimary(theme.primary_color ?? '')
    setSecondary(theme.secondary_color ?? '')
    setAccent(theme.accent_color ?? '')
  }, [theme])

  const hasCustomFont = Boolean(fontFaceUrl && fontCustomName)
  const customActive = hasCustomFont && fontFamily === fontCustomName

  const selectedFont = customActive
    ? fontCustomName
    : (FONT_OPTIONS.find((f) => f.family === fontFamily)?.label ?? 'System default')

  const fontOptions = [
    ...FONT_OPTIONS.map((f) => ({ value: f.label, label: f.label })),
    ...(hasCustomFont
      ? [
          {
            value: fontCustomName,
            label: fontCustomName,
            icon: (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Custom
              </span>
            ),
          },
        ]
      : []),
  ]

  function pickFont(value: string) {
    if (hasCustomFont && value === fontCustomName) {
      setFontFamily(fontCustomName)
      setFontUrl('')
      return
    }
    const opt = FONT_OPTIONS.find((f) => f.label === value) ?? FONT_OPTIONS[0]!
    setFontFamily(opt.family)
    setFontUrl(opt.url)
  }

  async function onUploadFont(file: File) {
    setFormError(null)
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/admin/media', {
        method: 'POST',
        body,
        credentials: 'same-origin',
        headers: { 'X-XSRF-TOKEN': readXsrf() },
      })
      if (!res.ok) throw new Error('Upload failed. Use a .woff2, .woff, .ttf or .otf file.')
      const media = (await res.json()) as { url: string }
      setFontFaceUrl(media.url)
      // Name the font from the file if it doesn't have one yet, then make it active.
      const name =
        fontCustomName ||
        file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9 _-]/g, ' ')
          .trim()
          .slice(0, 40) ||
        'Custom'
      setFontCustomName(name)
      setFontFamily(name)
      setFontUrl('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  function removeCustomFont() {
    if (customActive) {
      setFontFamily('')
      setFontUrl('')
    }
    setFontFaceUrl('')
    setFontCustomName('')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const section = WEBSITE_SETTING_SECTIONS.THEME
    try {
      await update.mutateAsync({
        patches: [
          { section, key: 'font_family', value: fontFamily.trim() },
          { section, key: 'font_css_url', value: fontUrl.trim() },
          { section, key: 'font_face_url', value: fontFaceUrl.trim() },
          { section, key: 'font_custom_name', value: fontCustomName.trim() },
          { section, key: 'primary_color', value: primary.trim() },
          { section, key: 'secondary_color', value: secondary.trim() },
          { section, key: 'accent_color', value: accent.trim() },
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
            Default font and colour palette for the public site and storefront. These do not affect
            the dashboard. A font set on an individual page-builder block still overrides the
            default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Default font</Label>
            <AppSelect
              value={selectedFont}
              onChange={pickFont}
              options={fontOptions}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Google Fonts load on public pages only. Upload your own below to add it here.
            </p>
          </div>

          {/* Custom font — uploaded separately, then selectable above with a Custom badge. */}
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <Label>Custom font</Label>
              {hasCustomFont ? (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Custom
                </span>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="custom-font-name" className="text-xs text-muted-foreground">
                Font name
              </Label>
              <Input
                id="custom-font-name"
                value={fontCustomName}
                onChange={(e) => {
                  const v = e.target.value
                  // Renaming the active custom font keeps it selected.
                  if (customActive) setFontFamily(v)
                  setFontCustomName(v)
                }}
                placeholder="My Brand Font"
                disabled={!hasCustomFont && !uploading}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center rounded-md border border-input bg-transparent px-3 py-1.5 text-sm font-medium hover:bg-muted">
                {uploading
                  ? 'Uploading…'
                  : hasCustomFont
                    ? 'Replace font file'
                    : 'Upload font file'}
                <input
                  type="file"
                  accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void onUploadFont(f)
                    e.target.value = ''
                  }}
                />
              </label>
              {hasCustomFont ? (
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="max-w-[220px] truncate font-mono">{fontFaceUrl}</span>
                  <button
                    type="button"
                    onClick={removeCustomFont}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Remove
                  </button>
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              .woff2, .woff, .ttf or .otf, up to 10MB. Once uploaded, pick it in the Default font
              list above.
            </p>
          </div>

          {/* Load the custom font into this page so the preview below is accurate. */}
          {hasCustomFont ? (
            <style
              dangerouslySetInnerHTML={{
                __html: `@font-face{font-family:'${fontCustomName}';src:url('${fontFaceUrl}');font-display:swap}`,
              }}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <ColorField
              label="Primary"
              value={primary}
              defaultColor={defaults.primary}
              onChange={setPrimary}
            />
            <ColorField
              label="Secondary"
              value={secondary}
              defaultColor={defaults.secondary}
              onChange={setSecondary}
            />
            <ColorField
              label="Accent"
              value={accent}
              defaultColor={defaults.accent}
              onChange={setAccent}
            />
          </div>

          {/* Live preview */}
          <div
            className="rounded-lg border p-4"
            style={{
              ...(fontFamily ? { fontFamily: `'${fontFamily}', sans-serif` } : {}),
            }}
          >
            <p className="mb-2 text-sm text-muted-foreground">Preview</p>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: primary || defaults.primary }}
              >
                Primary button
              </span>
              <span
                className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium"
                style={{ backgroundColor: secondary || defaults.secondary, color: '#0f172a' }}
              >
                Secondary
              </span>
              <span
                className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium"
                style={{ backgroundColor: accent || defaults.accent, color: '#0f172a' }}
              >
                Accent
              </span>
              <span className="text-lg font-semibold">The quick brown fox</span>
            </div>
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save appearance'}
            </Button>
            {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
          </div>
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
        <CardTitle className="text-base">Website settings</CardTitle>
        <CardDescription>
          You need the <code className="rounded bg-muted px-1 text-xs">settings:manage</code>{' '}
          permission to edit website metadata and custom code.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

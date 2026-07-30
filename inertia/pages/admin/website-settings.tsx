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
    return t === 'custom-code' ? t : 'site-meta'
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
          <TabsList className="grid h-auto grid-cols-1 gap-1 sm:grid-cols-2">
            <TabsTrigger value="site-meta">Site &amp; SEO</TabsTrigger>
            <TabsTrigger value="custom-code">Custom code</TabsTrigger>
          </TabsList>

          <TabsContent value="site-meta" className="mt-4">
            <SiteMetaSection />
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

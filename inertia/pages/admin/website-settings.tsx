import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from '~/hooks/use-inertia-url'
import { mergeSearchParamsLive, replaceUrlIfChanged } from '~/lib/table-url-params'
import { WEBSITE_SETTING_SECTIONS } from '~/types/api'
import { BackButton } from '~/components/admin/back-button'
import { ImageSettingControl } from '~/components/admin/image-setting-control'
import { MetaTagsEditor, type MetaTag } from '~/components/admin/meta-tags-editor'
import { ToggleRow } from '~/components/admin/toggle-row'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { Can, useAbility } from '~/components/providers/ability-provider'
import { useUpdateWebsiteSettings, useWebsiteSettings } from '~/hooks/api/use-website-settings'
import { GlobalCodePanel } from '~/puck/global-code-panel'
import { AppearancePanel } from '~/components/appearance-panel'

const SITE_DEFAULT_FAVICON = '/logo.svg'
// Must match the server default (`WEB_DEFAULTS.site_meta.site_description` in
// settings_service.ts), so the form shows the same default the public site uses.
const SITE_DEFAULT_DESCRIPTION = 'A modern CMS'

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
  const [discourageIndexing, setDiscourageIndexing] = useState(false)
  const [blockAiTraining, setBlockAiTraining] = useState(false)
  const [blockAiSearch, setBlockAiSearch] = useState(false)
  const [blockAiAgents, setBlockAiAgents] = useState(false)
  const [customRobotsTxt, setCustomRobotsTxt] = useState('')
  const [robotsPreviewLoaded, setRobotsPreviewLoaded] = useState(false)
  // Distinguishes "the operator actually edited/cleared this field" from the
  // textarea merely being pre-filled with a generated-file preview — without
  // this, saving the form for any OTHER reason (e.g. just flipping an
  // AI-crawler toggle) would silently persist that preview text as a
  // permanent robots.txt override.
  const [robotsTxtEdited, setRobotsTxtEdited] = useState(false)
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
    setDiscourageIndexing(sm.discourage_indexing === '1')
    setBlockAiTraining(sm.block_ai_training === '1')
    setBlockAiSearch(sm.block_ai_search === '1')
    setBlockAiAgents(sm.block_ai_agents === '1')
    setCustomRobotsTxt(sm.custom_robots_txt ?? '')
    setRobotsTxtEdited(false)
  }, [sm])

  // Pre-fill the raw-override textarea with the live generated robots.txt as
  // a starting point — a plain same-origin GET, always byte-accurate to what
  // the backend actually produces, so there's no need to duplicate the
  // generation logic client-side. Only when nothing is stored yet.
  useEffect(() => {
    if (!sm || robotsPreviewLoaded) return
    setRobotsPreviewLoaded(true)
    if ((sm.custom_robots_txt ?? '') !== '') return
    fetch('/robots.txt')
      .then((r) => (r.ok ? r.text() : ''))
      .then((text) => {
        if (text) setCustomRobotsTxt(text)
      })
      .catch(() => {})
  }, [sm, robotsPreviewLoaded])

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
          {
            section: WEBSITE_SETTING_SECTIONS.SITE_META,
            key: 'discourage_indexing',
            value: discourageIndexing ? '1' : '0',
          },
          {
            section: WEBSITE_SETTING_SECTIONS.SITE_META,
            key: 'block_ai_training',
            value: blockAiTraining ? '1' : '0',
          },
          {
            section: WEBSITE_SETTING_SECTIONS.SITE_META,
            key: 'block_ai_search',
            value: blockAiSearch ? '1' : '0',
          },
          {
            section: WEBSITE_SETTING_SECTIONS.SITE_META,
            key: 'block_ai_agents',
            value: blockAiAgents ? '1' : '0',
          },
          {
            section: WEBSITE_SETTING_SECTIONS.SITE_META,
            key: 'custom_robots_txt',
            // Only ever persist a value the operator actually chose — an
            // untouched pre-filled preview must never become a stored override.
            value: robotsTxtEdited ? customRobotsTxt.trim() : (sm?.custom_robots_txt ?? ''),
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

          <div className="space-y-3 border-t pt-4">
            <div>
              <h3 className="text-sm font-medium">Search engine indexing</h3>
              <p className="text-xs text-muted-foreground">
                Controls whether search engines are told to index this site. This is separate
                from robots.txt below — crawling stays allowed either way, only indexing is
                discouraged.
              </p>
            </div>
            <ToggleRow
              title="Discourage search engines from indexing"
              description="Adds noindex,nofollow to every public page (overriding any page's own SEO setting) and sends the X-Robots-Tag header. robots.txt is left untouched — blocking crawl access there would stop search engines from ever seeing this tag."
              checked={discourageIndexing}
              disabled={isPending}
              onChange={setDiscourageIndexing}
            />
          </div>

          <div className="space-y-3 border-t pt-4">
            <div>
              <h3 className="text-sm font-medium">AI crawlers</h3>
              <p className="text-xs text-muted-foreground">
                Adds Disallow rules to robots.txt for known AI bots, grouped by purpose. Each is
                independent and off by default. Ignored while the raw override below is active.
              </p>
            </div>
            <ToggleRow
              title="Block AI training crawlers"
              description="GPTBot, CCBot, ClaudeBot, Google-Extended, Bytespider, and others that scrape content to train models."
              checked={blockAiTraining}
              disabled={isPending}
              onChange={setBlockAiTraining}
            />
            <ToggleRow
              title="Block AI search/answer crawlers"
              description="OAI-SearchBot, PerplexityBot, Claude-SearchBot — crawlers that power AI search/answer products. Blocking these removes this site from AI search results/citations."
              checked={blockAiSearch}
              disabled={isPending}
              onChange={setBlockAiSearch}
            />
            <ToggleRow
              title="Block AI user-triggered agents"
              description="ChatGPT-User, Claude-User, Perplexity-User — fetches made live on behalf of someone's own prompt."
              checked={blockAiAgents}
              disabled={isPending}
              onChange={setBlockAiAgents}
            />
          </div>

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="customRobotsTxt">robots.txt full raw override</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCustomRobotsTxt('')
                  setRobotsTxtEdited(true)
                }}
                disabled={isPending}
              >
                Reset to default
              </Button>
            </div>
            <Textarea
              id="customRobotsTxt"
              value={customRobotsTxt}
              onChange={(e) => {
                setCustomRobotsTxt(e.target.value)
                setRobotsTxtEdited(true)
              }}
              rows={10}
              className="font-mono text-xs"
              disabled={isPending}
            />
            {sm?.custom_robots_txt ? (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                A raw override is active — /robots.txt is served exactly as written above, and
                the indexing/AI-crawler toggles no longer take effect. Click "Reset to default"
                and Save to go back to auto-generated output.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pre-filled with the current auto-generated robots.txt as a starting point. Leave
                it as generated to keep using the toggles above; edit and save to take full
                manual control (save with this field empty to reset).
              </p>
            )}
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
  const [notifyEmail, setNotifyEmail] = useState('')
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!forms) return
    setWebhookUrl(forms.webhook_url ?? '')
    setNotifyEmail(forms.notify_email ?? '')
  }, [forms])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const url = webhookUrl.trim()
    if (url && !/^https:\/\//i.test(url)) {
      setFormError('Webhook URL must start with https://')
      return
    }
    const email = notifyEmail.trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('Notification email is not a valid address.')
      return
    }
    try {
      await update.mutateAsync({
        patches: [
          { section: WEBSITE_SETTING_SECTIONS.FORMS, key: 'webhook_url', value: url },
          { section: WEBSITE_SETTING_SECTIONS.FORMS, key: 'notify_email', value: email },
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

          <div className="space-y-2">
            <Label htmlFor="formsNotifyEmail">Notification email (optional)</Label>
            <Input
              id="formsNotifyEmail"
              type="email"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              placeholder="team@example.com"
              autoComplete="off"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Emailed on each non-spam submission when email delivery is configured. Leave empty to
              disable.
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

function AppearanceSection() {
  return (
    <Card>
      <CardContent className="pt-6">
        <AppearancePanel />
      </CardContent>
    </Card>
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

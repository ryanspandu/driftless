import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, RefreshCw, Send, XCircle } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Badge } from '~/components/ui/badge'
import { BackButton } from '~/components/admin/back-button'
import { PageHeader } from '~/components/admin/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { Can } from '~/components/providers/ability-provider'
import { usePathname, useRouter, useSearchParams } from '~/hooks/use-inertia-url'
import { mergeSearchParamsLive, replaceUrlIfChanged } from '~/lib/table-url-params'
import {
  useMailDeliveries,
  useMailEvents,
  useMailSettings,
  useSendTestEmail,
  useUpdateMailEvent,
  useUpdateMailSettings,
  type MailEventDto,
  type UpdateMailSettingsRequest,
} from '~/hooks/api/use-mail-settings'
import { apiErrorMessage } from '~/lib/api-client'
import { cn } from '~/lib/utils'
import { useTemplatesList } from '~/hooks/api/use-templates'
import {
  useUpdateWebsiteSettings,
  useWebsiteSettings,
} from '~/hooks/api/use-website-settings'
import { AppSelect } from '~/components/ui/app-select'
import {
  SMTP_DEFAULT_PRESET,
  SMTP_PRESETS,
  SMTP_PRESET_CUSTOM,
  detectSmtpPreset,
  findSmtpPreset,
} from '~/lib/smtp-presets'

function EmailSettings() {
  const query = useMailSettings()
  const update = useUpdateMailSettings()
  const sendTest = useSendTestEmail()

  const [enabled, setEnabled] = useState(false)
  const [preset, setPreset] = useState<string>(SMTP_DEFAULT_PRESET)
  const [host, setHost] = useState('')
  const [port, setPort] = useState('587')
  const [secure, setSecure] = useState(false)
  const [username, setUsername] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [fromName, setFromName] = useState('')

  /**
   * Held separately from the rest of the form: the stored password is never
   * sent to the browser, only a mask. An untouched field must leave the stored
   * value alone, so `null` here means "not edited" and is omitted from the
   * request entirely.
   */
  const [password, setPassword] = useState<string | null>(null)

  const [testTo, setTestTo] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const data = query.data

  useEffect(() => {
    if (!data) return
    setEnabled(data.enabled)
    setPreset(detectSmtpPreset(data.host))
    setHost(data.host ?? '')
    setPort(data.port ? String(data.port) : '587')
    setSecure(data.secure)
    setUsername(data.username ?? '')
    setFromAddress(data.fromAddress ?? '')
    setFromName(data.fromName ?? '')
    setPassword(null)
  }, [data])

  /**
   * Fill in everything that belongs to the provider rather than the account.
   *
   * `username` is only overwritten when the preset fixes it (Resend uses the
   * literal string `resend` for everyone). For providers where it is
   * per-account, whatever was typed is left alone — retyping it after switching
   * ports would be a pointless loss.
   */
  function applyPreset(id: string) {
    setPreset(id)
    const p = findSmtpPreset(id)
    if (!p) return
    setHost(p.host)
    setPort(String(p.port))
    setSecure(p.secure)
    if (p.username) setUsername(p.username)
  }

  const activePreset = findSmtpPreset(preset)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSaved(false)

    const body: UpdateMailSettingsRequest = {
      enabled,
      host: host.trim() || null,
      port: port.trim() ? Number(port) : null,
      secure,
      username: username.trim() || null,
      fromAddress: fromAddress.trim() || null,
      fromName: fromName.trim() || null,
    }
    // Only include the password when it was actually edited.
    if (password !== null) body.password = password

    try {
      await update.mutateAsync(body)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setFormError(apiErrorMessage(err, 'Failed to save email settings'))
    }
  }

  async function onSendTest() {
    setFormError(null)
    try {
      const result = await sendTest.mutateAsync(testTo.trim())
      if (!result.ok) setFormError(result.message ?? 'Failed to send')
    } catch (err) {
      setFormError(apiErrorMessage(err, 'Failed to send test email'))
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>SMTP</CardTitle>
          <CardDescription>
            Used for every transactional message — order receipts, download links, password resets.
            Credentials are encrypted before they are stored.
            {data?.envFallbackConfigured ? (
              <>
                {' '}
                Environment variables are configured and will be used whenever this is switched off.
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Use these settings</p>
                <p className="text-xs text-muted-foreground">
                  When off, Driftless falls back to the SMTP environment variables.
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mail-preset">Provider</Label>
              <AppSelect
                id="mail-preset"
                value={preset}
                onChange={applyPreset}
                options={[
                  ...SMTP_PRESETS.map((p) => ({ value: p.id, label: p.label })),
                  { value: SMTP_PRESET_CUSTOM, label: 'Custom SMTP' },
                ]}
                isSearchable={false}
              />
              {activePreset ? (
                <p className="text-xs text-muted-foreground">
                  {activePreset.note}
                  {activePreset.docsUrl ? (
                    <>
                      {' '}
                      <a
                        href={activePreset.docsUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-medium text-primary hover:underline"
                      >
                        Setup guide
                      </a>
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Enter the host, port and credentials your provider gave you.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="mail-host">Host</Label>
                <Input
                  id="mail-host"
                  value={host}
                  onChange={(e) => {
                    setHost(e.target.value)
                    // Typing a host by hand re-labels the picker rather than
                    // leaving it claiming a provider these settings no longer
                    // point at.
                    setPreset(detectSmtpPreset(e.target.value))
                  }}
                  placeholder="smtp.example.com"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mail-port">Port</Label>
                <Input
                  id="mail-port"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  inputMode="numeric"
                  placeholder="587"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Implicit TLS</p>
                <p className="text-xs text-muted-foreground">
                  On for port 465. Port 587 upgrades with STARTTLS automatically — leave this off.
                </p>
              </div>
              <Switch checked={secure} onCheckedChange={setSecure} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mail-username">Username</Label>
                <Input
                  id="mail-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mail-password">Password</Label>
                <Input
                  id="mail-password"
                  type="password"
                  value={password ?? ''}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={data?.hasPasswordInDb ? (data.passwordMasked ?? '••••••••') : ''}
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  {data?.hasPasswordInDb
                    ? 'Leave blank to keep the stored password.'
                    : (activePreset?.passwordHint ?? 'No password stored yet.')}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mail-from-address">From address</Label>
                <Input
                  id="mail-from-address"
                  value={fromAddress}
                  onChange={(e) => setFromAddress(e.target.value)}
                  placeholder="no-reply@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mail-from-name">From name</Label>
                <Input
                  id="mail-from-name"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Your store"
                />
              </div>
            </div>

            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            {saved ? (
              <p className="text-sm text-green-600 dark:text-green-500" role="status">
                Saved.
              </p>
            ) : null}

            <div className="flex justify-end border-t pt-4">
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Send a test</CardTitle>
          <CardDescription>
            Delivers a real message using the settings above, and waits for the result — so a
            failure here is the actual failure your customers would hit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
              type="email"
              className="sm:max-w-sm"
            />
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={sendTest.isPending || !testTo.trim()}
              onClick={onSendTest}
            >
              <Send className="size-4" aria-hidden />
              {sendTest.isPending ? 'Sending…' : 'Send test email'}
            </Button>
          </div>

          {data?.lastTestedAt ? (
            <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              {data.lastTestOk ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="font-medium">
                  {data.lastTestOk ? 'Last test succeeded' : 'Last test failed'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(data.lastTestedAt).toLocaleString()}
                  {data.lastTestError ? ` — ${data.lastTestError}` : ''}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not tested yet.</p>
          )}
        </CardContent>
      </Card>

      <EmailBranding />
    </div>
  )
}

const TRIGGER_LABEL: Record<MailEventDto['trigger'], string> = {
  admin: 'Sent by an admin action',
  webhook: 'Sent by a payment webhook',
  cron: 'Sent by the maintenance cron',
  visitor: 'Sent by a visitor action',
}

/**
 * Which emails this installation can send, and whether each is on.
 *
 * The list is whatever is *declared* at runtime — core plus every enabled
 * module — so disabling a module removes its rows rather than leaving dead
 * toggles behind.
 */
const COPY_FIELDS = [
  { key: 'subject', label: 'Subject', multiline: false },
  { key: 'heading', label: 'Heading', multiline: false },
  { key: 'intro', label: 'Opening paragraph', multiline: true },
  { key: 'buttonLabel', label: 'Button label', multiline: false },
  { key: 'outro', label: 'Closing note', multiline: true },
] as const

/**
 * The editable copy for one email.
 *
 * Empty inputs show the shipped wording as a placeholder, so "not overridden"
 * is visible rather than looking like an email with no subject. Saving an empty
 * field restores the default; the parts that make the email work — the reset
 * link, the order table, the tracking number — are not editable here at all.
 */
function EventCopyEditor({ event }: { event: MailEventDto }) {
  const update = useUpdateMailEvent()
  // Only EMAIL templates: anything else would render flex layout and Tailwind
  // classes into an inbox. The server refuses them too.
  const templates = useTemplatesList('EMAIL')
  const emailTemplates = templates.data ?? []
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft({
      subject: event.overrides.subject ?? '',
      heading: event.overrides.heading ?? '',
      intro: event.overrides.intro ?? '',
      buttonLabel: event.overrides.buttonLabel ?? '',
      outro: event.overrides.outro ?? '',
    })
  }, [event])

  async function save() {
    setError(null)
    try {
      await update.mutateAsync({
        key: event.key,
        // An emptied field means "back to the shipped wording", so it is sent
        // as null rather than as an empty string.
        ...Object.fromEntries(
          COPY_FIELDS.map((f) => [f.key, draft[f.key]?.trim() ? draft[f.key] : null])
        ),
      })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save'))
    }
  }

  return (
    <div className="mt-4 space-y-4 border-t pt-4">
      {COPY_FIELDS.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor={`${event.key}-${field.key}`} className="text-xs">
            {field.label}
          </Label>
          {field.multiline ? (
            <textarea
              id={`${event.key}-${field.key}`}
              rows={2}
              value={draft[field.key] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
              placeholder={event.defaults[field.key]}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          ) : (
            <Input
              id={`${event.key}-${field.key}`}
              value={draft[field.key] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
              placeholder={event.defaults[field.key]}
            />
          )}
        </div>
      ))}

      <div className="space-y-1.5">
        <Label htmlFor={`${event.key}-template`} className="text-xs">
          Design
        </Label>
        <AppSelect
          id={`${event.key}-template`}
          value={event.templateId ?? ''}
          onChange={(v) => void update.mutateAsync({ key: event.key, templateId: v || null })}
          options={[
            { value: '', label: 'Built-in layout' },
            ...emailTemplates.map((t) => ({ value: t.id, label: t.name })),
          ]}
          isSearchable={false}
        />
        <p className="text-xs text-muted-foreground">
          Design one under{' '}
          <a href="/admin/templates?tab=email" className="font-medium text-primary hover:underline">
            Templates → Emails
          </a>
          . Add an <strong>Order / details block</strong> where the order table or reset link
          should go — that part is filled in when the email is sent and cannot be edited.
        </p>
      </div>

      {event.variables.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Placeholders:{' '}
          {event.variables.map((v) => (
            <code key={v} className="mr-1 rounded bg-muted px-1 text-[11px]">
              {`{{${v}}}`}
            </code>
          ))}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={() => void save()} disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save content'}
        </Button>
        {saved ? (
          <span className="text-xs text-green-600 dark:text-green-500" role="status">
            Saved.
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">Empty fields use the wording shown.</span>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function NotificationSettings() {
  const events = useMailEvents()
  const update = useUpdateMailEvent()
  const [error, setError] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)

  async function toggle(key: string, enabled: boolean) {
    setError(null)
    try {
      await update.mutateAsync({ key, enabled })
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not change that setting'))
    }
  }

  const list = events.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Every email this site can send. Switching one off stops it being sent at all — it is not
          queued for later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No emails are declared.</p>
        ) : (
          list.map((event) => (
            <div key={event.key} className="rounded-lg border border-border px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{event.label}</p>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {event.owner}
                    </Badge>
                    {event.category === 'marketing' ? (
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        Marketing
                      </Badge>
                    ) : null}
                    {event.customised ? (
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        Edited
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{event.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {TRIGGER_LABEL[event.trigger]}
                    {!event.canDisable ? ' · always on' : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpenKey((k) => (k === event.key ? null : event.key))}
                  >
                    {openKey === event.key ? 'Close' : 'Edit content'}
                  </Button>
                  <Switch
                    checked={event.enabled}
                    disabled={!event.canDisable || update.isPending}
                    onCheckedChange={(value) => void toggle(event.key, value)}
                    aria-label={`Send ${event.label}`}
                  />
                </div>
              </div>

              {openKey === event.key ? <EventCopyEditor event={event} /> : null}
            </div>
          ))
        )}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * Logo, accent colour and footer note, shared by every email.
 *
 * Site-wide rather than per-email on purpose: a logo that differs between the
 * receipt and the password reset reads as one of them being forged.
 */
function EmailBranding() {
  const { data, isPending } = useWebsiteSettings()
  const update = useUpdateWebsiteSettings()
  const section = data?.sections?.email_branding
  const [logoUrl, setLogoUrl] = useState('')
  const [accentColor, setAccentColor] = useState('#4f39f6')
  const [footerNote, setFooterNote] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!section) return
    setLogoUrl(section.logo_url ?? '')
    setAccentColor(section.accent_color || '#4f39f6')
    setFooterNote(section.footer_note ?? '')
  }, [section])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await update.mutateAsync({
        patches: [
          { section: 'email_branding', key: 'logo_url', value: logoUrl.trim() },
          { section: 'email_branding', key: 'accent_color', value: accentColor.trim() },
          { section: 'email_branding', key: 'footer_note', value: footerNote.trim() },
        ],
      })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save.'))
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Email branding</CardTitle>
          <CardDescription>
            Applied to every message. The logo must be an <strong>absolute URL</strong> — an email
            has no site to be relative to — and many clients block remote images by default, so it
            is a nicety rather than something to depend on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email-logo">Logo URL</Label>
              <Input
                id="email-logo"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-accent">Button colour</Label>
              <div className="flex items-center gap-2">
                <input
                  id="email-accent"
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#4f39f6'}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
                />
                <Input
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#4f39f6"
                  className="font-mono"
                />
              </div>
              {/* Hex only: email clients do not resolve oklch() or CSS variables. */}
              <p className="text-xs text-muted-foreground">Use a plain hex colour.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-footer">Footer note</Label>
            <Input
              id="email-footer"
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
              placeholder="Sent by Example Ltd · 1 Example Street"
              disabled={isPending}
            />
          </div>

          <div className="flex items-center gap-3 border-t pt-4">
            <Button type="submit" disabled={isPending || update.isPending}>
              Save branding
            </Button>
            {saved ? (
              <span className="text-sm text-green-600 dark:text-green-500" role="status">
                Saved.
              </span>
            ) : null}
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </form>
  )
}

const STATUS_STYLE: Record<string, string> = {
  sent: 'text-emerald-600 dark:text-emerald-500',
  failed: 'text-destructive',
  queued: 'text-amber-600 dark:text-amber-500',
}

/**
 * What actually went out.
 *
 * Both transactional senders swallow their errors on purpose, so without this
 * a dead relay was a console line in a process nobody watches. `queued` is not
 * success — a row stuck there means the worker never picked the job up.
 */
function DeliveryLog() {
  const deliveries = useMailDeliveries(50)
  const rows = deliveries.data ?? []

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="min-w-0 space-y-1.5">
          <CardTitle>Recent deliveries</CardTitle>
          <CardDescription>
            The last 50 attempts. <strong>Queued</strong> means the job was accepted but no worker
            has finished it — if rows stay there, <code className="text-xs">npm run worker</code> is
            not running. Message bodies are never stored.
          </CardDescription>
        </div>
        {/* A log goes stale while you read it; the worker closes rows out of band. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-2"
          disabled={deliveries.isFetching}
          onClick={() => void deliveries.refetch()}
        >
          <RefreshCw className={cn('size-4', deliveries.isFetching && 'animate-spin')} aria-hidden />
          {deliveries.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent>
        {deliveries.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">When</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">To</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 align-top">
                    <td className="whitespace-nowrap py-2 pr-4 text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">{row.eventLabel ?? row.subject ?? '—'}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{row.toAddress}</td>
                    <td className="py-2">
                      <span className={STATUS_STYLE[row.status] ?? ''}>{row.status}</span>
                      {row.error ? (
                        <p className="mt-0.5 max-w-sm text-xs text-muted-foreground">{row.error}</p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

type EmailTab = 'settings' | 'notifications' | 'log'

const EMAIL_TABS: { value: EmailTab; label: string }[] = [
  { value: 'settings', label: 'Settings' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'log', label: 'Log' },
]

export default function EmailSettingsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  /**
   * Active tab lives in `?tab=` so each section is linkable — the copy editor
   * links to `?tab=email` on Templates for the same reason. `settings` is the
   * default and stays out of the URL.
   */
  const tab = useMemo<EmailTab>(() => {
    const t = searchParams.get('tab')
    return t === 'notifications' || t === 'log' ? t : 'settings'
  }, [searchParams])

  const onTabChange = (value: EmailTab) => {
    const merged = mergeSearchParamsLive(searchParams, {
      tab: value === 'settings' ? undefined : value,
    })
    replaceUrlIfChanged(pathname, router, merged, { scroll: false })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BackButton href="/admin/settings" label="Back to settings" />
        <PageHeader
          title="Email"
          subtitle="Outgoing transactional email — credentials, which messages send, and what went out."
          className="flex-1"
        />
      </div>
      <Can
        permission="settings:manage"
        fallback={
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to manage email settings.
          </p>
        }
      >
        <Tabs value={tab} onValueChange={(value) => onTabChange(value as EmailTab)}>
          <TabsList>
            {EMAIL_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/*
            Only the active panel is mounted, so opening the page does not fetch
            the delivery log or the event list until they are asked for.
          */}
          <TabsContent value="settings" className="mt-4">
            <EmailSettings />
          </TabsContent>
          <TabsContent value="notifications" className="mt-4">
            <NotificationSettings />
          </TabsContent>
          <TabsContent value="log" className="mt-4">
            <DeliveryLog />
          </TabsContent>
        </Tabs>
      </Can>
    </div>
  )
}

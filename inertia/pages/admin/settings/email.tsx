import { useEffect, useState, type FormEvent } from 'react'
import { Link } from '@inertiajs/react'
import { ArrowLeft, CheckCircle2, Send, XCircle } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { PageHeader } from '~/components/admin/page-header'
import { Can } from '~/components/providers/ability-provider'
import {
  useMailSettings,
  useSendTestEmail,
  useUpdateMailSettings,
  type UpdateMailSettingsRequest,
} from '~/hooks/api/use-mail-settings'
import { apiErrorMessage } from '~/lib/api-client'

function EmailSettings() {
  const query = useMailSettings()
  const update = useUpdateMailSettings()
  const sendTest = useSendTestEmail()

  const [enabled, setEnabled] = useState(false)
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
    setHost(data.host ?? '')
    setPort(data.port ? String(data.port) : '587')
    setSecure(data.secure)
    setUsername(data.username ?? '')
    setFromAddress(data.fromAddress ?? '')
    setFromName(data.fromName ?? '')
    setPassword(null)
  }, [data])

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

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="mail-host">Host</Label>
                <Input
                  id="mail-host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
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
                    : 'No password stored yet.'}
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
    </div>
  )
}

export default function EmailSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          render={<Link href="/admin/settings" />}
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span className="sr-only">Back to settings</span>
        </Button>
        <PageHeader
          title="Email"
          subtitle="SMTP credentials for outgoing transactional email."
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
        <EmailSettings />
      </Can>
    </div>
  )
}

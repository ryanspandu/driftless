import { Link } from '@inertiajs/react'
import { type FormEvent, useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import type { CaptchaProviderId } from '~/types/api'
import { CAPTCHA_PROVIDER_OPTIONS } from '~/types/api'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Separator } from '~/components/ui/separator'
import { Switch } from '~/components/ui/switch'
import { AppSelect } from '~/components/ui/app-select'
import { BackButton } from '~/components/admin/back-button'
import { Can } from '~/components/providers/ability-provider'
import {
  useIntegrationSettings,
  useUpdateIntegrationSettings,
} from '~/hooks/api/use-integration-settings'

function normalizeCaptchaProvider(p: string | null): CaptchaProviderId {
  if (p === 'hcaptcha' || p === 'recaptcha' || p === 'turnstile') return p
  return 'turnstile'
}

const CAPTCHA_SELECT_OPTIONS = CAPTCHA_PROVIDER_OPTIONS.map((o) => ({
  value: o.id,
  label: o.label,
}))

export default function CaptchaIntegrationPage() {
  const query = useIntegrationSettings()
  const update = useUpdateIntegrationSettings()

  const [captchaEnabled, setCaptchaEnabled] = useState(false)
  const [captchaProvider, setCaptchaProvider] = useState<CaptchaProviderId>('turnstile')
  const [captchaSiteKey, setCaptchaSiteKey] = useState('')
  const [captchaSecretNew, setCaptchaSecretNew] = useState('')
  const [clearCaptchaSecret, setClearCaptchaSecret] = useState(false)
  const [captchaOnLogin, setCaptchaOnLogin] = useState(false)
  const [captchaOnRegister, setCaptchaOnRegister] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!query.data) return
    const d = query.data
    setCaptchaEnabled(d.captchaEnabled)
    setCaptchaProvider(normalizeCaptchaProvider(d.captchaProvider))
    setCaptchaSiteKey(d.captchaSiteKey ?? '')
    setCaptchaSecretNew('')
    setClearCaptchaSecret(false)
    setCaptchaOnLogin(d.captchaOnLogin)
    setCaptchaOnRegister(d.captchaOnRegister)
  }, [query.data])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    try {
      await update.mutateAsync({
        captchaEnabled,
        captchaProvider: captchaEnabled ? captchaProvider : null,
        captchaSiteKey: captchaSiteKey.trim() || null,
        ...(clearCaptchaSecret
          ? { captchaSecret: '' }
          : captchaSecretNew.trim()
            ? { captchaSecret: captchaSecretNew.trim() }
            : {}),
        captchaOnLogin,
        captchaOnRegister,
      })
      setCaptchaSecretNew('')
      setClearCaptchaSecret(false)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  return (
    <Can permission="settings:manage" fallback={<NoAccess />}>
      <div className="w-full max-w-none space-y-6">
        <div className="flex items-center gap-3">
          <BackButton href="/admin/integrations" label="Back to integrations" />
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
              <Shield className="size-7 text-foreground" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">CAPTCHA</h1>
              <p className="text-sm text-muted-foreground">
                Bot protection for email login and registration.
              </p>
            </div>
          </div>
        </div>

        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : query.error ? (
          <p className="text-sm text-destructive">{(query.error as Error).message}</p>
        ) : (
          <form className="space-y-6" onSubmit={onSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>Provider &amp; keys</CardTitle>
                <CardDescription>
                  Env fallbacks: Turnstile{' '}
                  <code className="rounded bg-muted px-1 text-xs">TURNSTILE_SITE_KEY</code> /{' '}
                  <code className="rounded bg-muted px-1 text-xs">TURNSTILE_SECRET_KEY</code>;
                  hCaptcha <code className="rounded bg-muted px-1 text-xs">HCAPTCHA_*</code>;
                  reCAPTCHA <code className="rounded bg-muted px-1 text-xs">RECAPTCHA_*</code> or{' '}
                  <code className="rounded bg-muted px-1 text-xs">GOOGLE_RECAPTCHA_*</code>.
                  {query.data?.envCaptchaFallback ? (
                    <span className="mt-2 block text-xs text-amber-600 dark:text-amber-500">
                      Some keys are set via environment; DB overrides when present.
                    </span>
                  ) : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="captchaEnabled" className="font-normal">
                    Enable CAPTCHA
                  </Label>
                  <Switch
                    id="captchaEnabled"
                    checked={captchaEnabled}
                    onCheckedChange={(v) => setCaptchaEnabled(v)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="captchaProvider">Provider</Label>
                  <AppSelect
                    id="captchaProvider"
                    value={captchaProvider}
                    onChange={(v) => setCaptchaProvider(v as CaptchaProviderId)}
                    options={CAPTCHA_SELECT_OPTIONS}
                    isSearchable
                    disabled={!captchaEnabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="captchaSiteKey">Site key</Label>
                  <Input
                    id="captchaSiteKey"
                    value={captchaSiteKey}
                    onChange={(e) => setCaptchaSiteKey(e.target.value)}
                    autoComplete="off"
                    placeholder={
                      captchaProvider === 'turnstile'
                        ? 'Turnstile site key (e.g. 0x4AAA…)'
                        : captchaProvider === 'hcaptcha'
                          ? 'hCaptcha site key'
                          : 'reCAPTCHA site key'
                    }
                    className="font-mono text-sm"
                    disabled={!captchaEnabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="captchaSecret">Secret key</Label>
                  <Input
                    id="captchaSecret"
                    type="password"
                    value={captchaSecretNew}
                    onChange={(e) => {
                      setCaptchaSecretNew(e.target.value)
                      setClearCaptchaSecret(false)
                    }}
                    autoComplete="new-password"
                    placeholder={
                      query.data?.hasCaptchaSecretInDb
                        ? 'Leave blank to keep stored secret'
                        : 'Enter secret key'
                    }
                    className="font-mono text-sm"
                    disabled={!captchaEnabled}
                  />
                  {query.data?.captchaSecretMasked ? (
                    <p className="text-xs text-muted-foreground">
                      Stored: {query.data.captchaSecretMasked}
                    </p>
                  ) : null}
                  {query.data?.hasCaptchaSecretInDb ? (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="clearCaptchaSecret"
                        checked={clearCaptchaSecret}
                        onCheckedChange={(v) => {
                          setClearCaptchaSecret(!!v)
                          if (v) setCaptchaSecretNew('')
                        }}
                      />
                      <Label htmlFor="clearCaptchaSecret" className="font-normal">
                        Remove stored secret (use env only, if configured)
                      </Label>
                    </div>
                  ) : null}
                </div>
                <Separator />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                  <div className="flex flex-1 flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                    <Label
                      htmlFor="captchaOnLogin"
                      className={`font-normal ${!captchaEnabled ? 'text-muted-foreground' : ''}`}
                    >
                      Require on email login
                    </Label>
                    <Switch
                      id="captchaOnLogin"
                      checked={captchaOnLogin}
                      onCheckedChange={(v) => setCaptchaOnLogin(v)}
                      disabled={!captchaEnabled}
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                    <Label
                      htmlFor="captchaOnRegister"
                      className={`font-normal ${!captchaEnabled ? 'text-muted-foreground' : ''}`}
                    >
                      Require on registration
                    </Label>
                    <Switch
                      id="captchaOnRegister"
                      checked={captchaOnRegister}
                      onCheckedChange={(v) => setCaptchaOnRegister(v)}
                      disabled={!captchaEnabled}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {saved ? (
              <p className="text-sm text-green-600 dark:text-green-500">CAPTCHA settings saved.</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save'}
              </Button>
              <Button type="button" variant="outline" render={<Link href="/admin/integrations" />}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </Can>
  )
}

function NoAccess() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">CAPTCHA</h1>
      <p className="text-sm text-muted-foreground">
        You need <code className="rounded bg-muted px-1">settings:manage</code>.
      </p>
      <Button variant="outline" render={<Link href="/admin/dashboard" />}>
        Back to dashboard
      </Button>
    </div>
  )
}

import { Link } from '@inertiajs/react'
import { type FormEvent, useEffect, useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { BackButton } from '~/components/admin/back-button'
import { ToggleRow } from '~/components/admin/toggle-row'
import { Can } from '~/components/providers/ability-provider'
import { reportSuccess } from '~/lib/notify'
import {
  useIntegrationSettings,
  useUpdateIntegrationSettings,
} from '~/hooks/api/use-integration-settings'

export default function GoogleIntegrationPage() {
  const query = useIntegrationSettings()
  const update = useUpdateIntegrationSettings()

  const [googleAuthEnabled, setGoogleAuthEnabled] = useState(false)
  const [googleAuthEnabledForShop, setGoogleAuthEnabledForShop] = useState(false)
  const [googleClientId, setGoogleClientId] = useState('')
  const [googleClientSecretNew, setGoogleClientSecretNew] = useState('')
  const [clearGoogleSecret, setClearGoogleSecret] = useState(false)

  useEffect(() => {
    if (!query.data) return
    const d = query.data
    setGoogleAuthEnabled(d.googleAuthEnabled)
    setGoogleAuthEnabledForShop(d.googleAuthEnabledForShop)
    setGoogleClientId(d.googleClientId ?? '')
    setGoogleClientSecretNew('')
    setClearGoogleSecret(false)
  }, [query.data])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await update.mutateAsync({
        googleAuthEnabled,
        googleAuthEnabledForShop,
        googleClientId: googleClientId.trim() || null,
        ...(clearGoogleSecret
          ? { googleClientSecret: '' }
          : googleClientSecretNew.trim()
            ? { googleClientSecret: googleClientSecretNew.trim() }
            : {}),
      })
      setGoogleClientSecretNew('')
      setClearGoogleSecret(false)
      reportSuccess('Google settings saved')
    } catch {
      // Reported by the mutation handler.
    }
  }

  return (
    <Can permission="settings:manage" fallback={<NoAccess />}>
      <div className="w-full max-w-none space-y-6">
        <div className="flex items-center gap-3">
          <BackButton href="/admin/integrations" label="Back to integrations" />
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
              <FcGoogle className="size-7" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Google sign-in</h1>
              <p className="text-sm text-muted-foreground">
                OAuth 2.0 client for &quot;Sign in with Google&quot;.
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
                <CardTitle>Credentials</CardTitle>
                <CardDescription>
                  From Google Cloud Console → APIs &amp; Services → Credentials. Redirect URIs must
                  include:{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    {query.data?.googleRedirectUriHint}
                  </code>
                  {query.data?.googleAuthEnabledForShop ? (
                    <>
                      {' '}
                      and{' '}
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">
                        {query.data?.googleRedirectUriHintForShop}
                      </code>
                    </>
                  ) : null}
                  {query.data?.envGoogleOAuthFallback ? (
                    <span className="mt-2 block text-xs text-amber-600 dark:text-amber-500">
                      Environment variables also supply OAuth credentials; DB values override when
                      set.
                    </span>
                  ) : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ToggleRow
                  title='Enable "Sign in with Google" (admin)'
                  description="Lets admin users sign in to /login with Google."
                  checked={googleAuthEnabled}
                  onChange={setGoogleAuthEnabled}
                />
                <ToggleRow
                  title="Enable for storefront customer accounts"
                  description="Lets shoppers sign in / sign up with Google at /shop/account/login and /shop/account/register — a separate toggle from admin sign-in above."
                  checked={googleAuthEnabledForShop}
                  onChange={setGoogleAuthEnabledForShop}
                />
                <div className="space-y-2">
                  <Label htmlFor="googleClientId">OAuth 2.0 Client ID</Label>
                  <Input
                    id="googleClientId"
                    value={googleClientId}
                    onChange={(e) => setGoogleClientId(e.target.value)}
                    autoComplete="off"
                    placeholder="xxxxx.apps.googleusercontent.com"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="googleClientSecret">Client secret</Label>
                  <Input
                    id="googleClientSecret"
                    type="password"
                    value={googleClientSecretNew}
                    onChange={(e) => {
                      setGoogleClientSecretNew(e.target.value)
                      setClearGoogleSecret(false)
                    }}
                    autoComplete="new-password"
                    placeholder={
                      query.data?.hasGoogleClientSecretInDb
                        ? 'Leave blank to keep stored secret'
                        : 'Enter client secret'
                    }
                    className="font-mono text-sm"
                  />
                  {query.data?.googleClientSecretMasked ? (
                    <p className="text-xs text-muted-foreground">
                      Stored: {query.data.googleClientSecretMasked}
                    </p>
                  ) : null}
                  {query.data?.googleClientSecretUnreadable ? (
                    <p className="text-xs text-destructive">
                      A secret is stored but can’t be decrypted (the app key may have changed).
                      Re-enter it to fix.
                    </p>
                  ) : null}
                  {query.data?.hasGoogleClientSecretInDb ? (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="clearGoogleSecret"
                        checked={clearGoogleSecret}
                        onCheckedChange={(v) => {
                          setClearGoogleSecret(!!v)
                          if (v) setGoogleClientSecretNew('')
                        }}
                      />
                      <Label htmlFor="clearGoogleSecret" className="font-normal">
                        Remove stored secret (use env only, if configured)
                      </Label>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex flex-wrap items-center gap-2 pt-6">
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  render={<Link href="/admin/integrations" />}
                >
                  Cancel
                </Button>
              </CardContent>
            </Card>
          </form>
        )}
      </div>
    </Can>
  )
}

function NoAccess() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Google</h1>
      <p className="text-sm text-muted-foreground">
        You need <code className="rounded bg-muted px-1">settings:manage</code>.
      </p>
      <Button variant="outline" render={<Link href="/admin/dashboard" />}>
        Back to dashboard
      </Button>
    </div>
  )
}

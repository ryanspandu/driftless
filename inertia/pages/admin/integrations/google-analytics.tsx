import { Link } from '@inertiajs/react'
import { type FormEvent, useEffect, useState } from 'react'
import { GoogleAnalyticsBrandImg } from '~/components/brand-icons/integration-brand-images'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
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

export default function GoogleAnalyticsIntegrationPage() {
  const query = useIntegrationSettings()
  const update = useUpdateIntegrationSettings()

  const [ga4Enabled, setGa4Enabled] = useState(false)
  const [ga4MeasurementId, setGa4MeasurementId] = useState('')

  useEffect(() => {
    if (!query.data) return
    const d = query.data
    setGa4Enabled(d.ga4Enabled)
    setGa4MeasurementId(d.ga4MeasurementId ?? '')
  }, [query.data])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await update.mutateAsync({
        ga4Enabled,
        ga4MeasurementId: ga4MeasurementId.trim() || null,
      })
      reportSuccess('Google Analytics settings saved')
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
              <GoogleAnalyticsBrandImg className="size-7" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Google Analytics</h1>
              <p className="text-sm text-muted-foreground">
                GA4 measurement ID for this site (gtag.js).
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
                <CardTitle>Measurement ID</CardTitle>
                <CardDescription>
                  From Google Analytics → Admin → Data streams → your web stream. The ID looks like{' '}
                  <code className="rounded bg-muted px-1 text-xs">G-XXXXXXXXXX</code>. You can also
                  set <code className="rounded bg-muted px-1 text-xs">GA4_MEASUREMENT_ID</code> on
                  the API server as a fallback when the DB field is empty.
                  {query.data?.envGa4Fallback ? (
                    <span className="mt-2 block text-xs text-amber-600 dark:text-amber-500">
                      Environment supplies a measurement ID; DB value overrides when set.
                    </span>
                  ) : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ToggleRow
                  title="Enable Google Analytics (GA4)"
                  checked={ga4Enabled}
                  onChange={setGa4Enabled}
                />
                <div className="space-y-2">
                  <Label htmlFor="ga4MeasurementId">Measurement ID</Label>
                  <Input
                    id="ga4MeasurementId"
                    value={ga4MeasurementId}
                    onChange={(e) => setGa4MeasurementId(e.target.value)}
                    autoComplete="off"
                    placeholder="G-XXXXXXXXXX"
                    className="font-mono text-sm"
                    disabled={!ga4Enabled}
                  />
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
      <h1 className="text-2xl font-semibold tracking-tight">Google Analytics</h1>
      <p className="text-sm text-muted-foreground">
        You need <code className="rounded bg-muted px-1">settings:manage</code>.
      </p>
      <Button variant="outline" render={<Link href="/admin/dashboard" />}>
        Back to dashboard
      </Button>
    </div>
  )
}

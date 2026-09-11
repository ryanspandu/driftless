import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, Plug, XCircle } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs'
import { cn } from '~/lib/utils'
import { apiErrorMessage } from '~/lib/api-client'
import { useGateways, useUpdateGateway, useVerifyGateway, type GatewayCredentialDto } from '../_api'

type GatewayKey = 'stripe' | 'paypal' | 'lemonsqueezy'

/** One card per gateway; a Dev/Live toggle switches which mode's form is shown. */
const GATEWAYS = [
  { key: 'stripe', label: 'Stripe' },
  { key: 'paypal', label: 'PayPal' },
  { key: 'lemonsqueezy', label: 'Lemon Squeezy' },
] as const

const MODES = ['test', 'live'] as const

/** Field labels differ per gateway — PayPal has no signing secret. */
const LABELS = {
  stripe: {
    public: 'Publishable key',
    publicHint: 'pk_test_… / pk_live_…',
    secret: 'Secret key',
    secretHint: 'sk_test_… / sk_live_…',
    webhook: 'Webhook signing secret',
    webhookHint: 'whsec_… from the Stripe dashboard. Required to accept webhooks.',
  },
  paypal: {
    public: 'Client ID',
    publicHint: 'From your PayPal app credentials',
    secret: 'Client secret',
    secretHint: 'From your PayPal app credentials',
    webhook: 'Webhook ID',
    webhookHint:
      'PayPal signs with a rotating certificate rather than a shared secret; verification quotes this ID.',
  },
  lemonsqueezy: {
    public: 'Store ID',
    publicHint: '',
    secret: 'API key',
    secretHint: 'From Lemon Squeezy → Settings → API.',
    webhook: 'Webhook signing secret',
    webhookHint:
      'The signing secret of the webhook you create in Lemon Squeezy → Settings → Webhooks (subscribe to “order_created”).',
  },
} as const

/** The credential form for one (gateway, mode). Chrome lives in GatewaySection. */
function GatewayForm({
  gateway,
  mode,
  credential,
}: {
  gateway: GatewayKey
  mode: 'test' | 'live'
  credential: GatewayCredentialDto | undefined
}) {
  const update = useUpdateGateway()
  const verify = useVerifyGateway()
  const labels = LABELS[gateway]
  // Lemon Squeezy has no publishable key — it needs a store id + variant id (the
  // catch-all product a custom-priced checkout is created against) instead.
  const isLemon = gateway === 'lemonsqueezy'

  const [enabled, setEnabled] = useState(false)
  const [publicKey, setPublicKey] = useState('')
  const [storeId, setStoreId] = useState('')
  const [variantId, setVariantId] = useState('')
  /**
   * `null` means "not edited". Stored secrets never reach the browser — only a
   * mask — so an untouched field must leave the stored value alone, and the
   * request omits the key entirely.
   */
  const [secretKey, setSecretKey] = useState<string | null>(null)
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setEnabled(credential?.enabled ?? false)
    setPublicKey(credential?.publicKey ?? '')
    setStoreId(credential?.config?.storeId ?? '')
    setVariantId(credential?.config?.variantId ?? '')
    setSecretKey(null)
    setWebhookSecret(null)
  }, [credential])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    const input: Record<string, unknown> = { enabled }
    if (isLemon) {
      input.config = { storeId: storeId.trim(), variantId: variantId.trim() }
    } else {
      input.publicKey = publicKey.trim() || null
    }
    if (secretKey !== null) input.secretKey = secretKey
    if (webhookSecret !== null) input.webhookSecret = webhookSecret

    try {
      await update.mutateAsync({ gateway, mode, input })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save credentials'))
    }
  }

  async function onVerify() {
    setError(null)
    try {
      const result = await verify.mutateAsync({ gateway, mode })
      if (!result.ok) setError(result.message ?? 'Verification failed')
    } catch (err) {
      setError(apiErrorMessage(err, 'Verification failed'))
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {isLemon ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor={`${gateway}-${mode}-store`}>Store ID</Label>
              <Input
                id={`${gateway}-${mode}-store`}
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                placeholder="e.g. 12345"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${gateway}-${mode}-variant`}>Variant ID</Label>
              <Input
                id={`${gateway}-${mode}-variant`}
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                placeholder="Your catch-all product’s variant"
                autoComplete="off"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Create one “catch-all” product with a single variant in Lemon Squeezy (set the store to
            tax-inclusive pricing). Every order is charged as a custom price against that variant.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor={`${gateway}-${mode}-public`}>{labels.public}</Label>
          <Input
            id={`${gateway}-${mode}-public`}
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder={labels.publicHint}
            autoComplete="off"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${gateway}-${mode}-secret`}>{labels.secret}</Label>
        <Input
          id={`${gateway}-${mode}-secret`}
          type="password"
          value={secretKey ?? ''}
          onChange={(e) => setSecretKey(e.target.value)}
          placeholder={credential?.secretKeyMasked ?? labels.secretHint}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">
          {credential?.hasSecretKey
            ? 'Stored and encrypted. Leave blank to keep it.'
            : labels.secretHint}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${gateway}-${mode}-webhook`}>{labels.webhook}</Label>
        <Input
          id={`${gateway}-${mode}-webhook`}
          type="password"
          value={webhookSecret ?? ''}
          onChange={(e) => setWebhookSecret(e.target.value)}
          placeholder={credential?.hasWebhookSecret ? '••••••••' : ''}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">{labels.webhookHint}</p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Accept payments</p>
          <p className="text-xs text-muted-foreground">
            Requires a secret key. Only one mode per gateway should be active.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {credential?.lastVerifiedAt ? (
        <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
          {credential.lastVerifyError ? (
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="font-medium">
              {credential.lastVerifyError ? 'Last check failed' : 'Credentials verified'}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(credential.lastVerifiedAt).toLocaleString()}
              {credential.lastVerifyError ? ` — ${credential.lastVerifyError}` : ''}
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="text-sm text-green-600 dark:text-green-500" role="status">
          Saved.
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={verify.isPending || !credential?.hasSecretKey}
          onClick={onVerify}
        >
          <Plug className="size-4" aria-hidden />
          {verify.isPending ? 'Checking…' : 'Test connection'}
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

/** One full-width gateway card with a Dev/Live toggle in its header. */
function GatewaySection({
  gateway,
  credentials,
}: {
  gateway: GatewayKey
  credentials: GatewayCredentialDto[]
}) {
  const cred = (m: 'test' | 'live') =>
    credentials.find((c) => c.gateway === gateway && c.mode === m)
  // Default to the enabled mode if there is one, otherwise start in Dev.
  const [mode, setMode] = useState<'test' | 'live'>(
    () => MODES.find((m) => cred(m)?.enabled) ?? 'test'
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {/* The gateway is named by the tab; the title states the current mode. */}
            <CardTitle className="flex items-center gap-2">
              {mode === 'live' ? 'Live mode' : 'Dev mode'}
              {cred(mode)?.enabled ? <Badge variant="success">Active</Badge> : null}
            </CardTitle>
            <CardDescription>
              Checkout is hosted by {gateway} — card details never reach this server.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-1.5">
            <span
              className={cn(
                'text-xs font-medium',
                mode === 'test' ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              Dev
            </span>
            <Switch
              checked={mode === 'live'}
              onCheckedChange={(c) => setMode(c ? 'live' : 'test')}
              aria-label="Switch between dev and live mode"
            />
            <span
              className={cn(
                'text-xs font-medium',
                mode === 'live' ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              Live
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Keyed by mode so the form remounts and re-seeds on toggle. */}
        <GatewayForm key={mode} gateway={gateway} mode={mode} credential={cred(mode)} />
      </CardContent>
    </Card>
  )
}

export default function GatewaysPage() {
  const query = useGateways()
  const credentials = query.data ?? []
  const [tab, setTab] = useState<(typeof GATEWAYS)[number]['key']>('stripe')

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
        <p className="font-medium">Keys are encrypted before they are stored</p>
        <p className="text-xs text-muted-foreground">
          Secrets never leave this server — the API returns only a masked form. Test and live keys
          are kept apart so a test key can never settle a live payment. Point your gateway&apos;s
          webhook at <code>/api/webhooks/stripe</code>, <code>/api/webhooks/paypal</code> or{' '}
          <code>/api/webhooks/lemonsqueezy</code>.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof GATEWAYS)[number]['key'])}>
        <TabsList>
          {GATEWAYS.map((g) => {
            const active = MODES.some(
              (m) => credentials.find((c) => c.gateway === g.key && c.mode === m)?.enabled
            )
            return (
              <TabsTrigger key={g.key} value={g.key} className="gap-2">
                {g.label}
                {active ? <Badge variant="success">Active</Badge> : null}
              </TabsTrigger>
            )
          })}
        </TabsList>

        {GATEWAYS.map((g) => (
          <TabsContent key={g.key} value={g.key} className="mt-4">
            <GatewaySection gateway={g.key} credentials={credentials} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

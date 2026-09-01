import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { AppSelect } from '~/components/ui/app-select'
import { CityInput } from '../../components/city-input'
import { CountrySelect } from '../../components/country-select'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { PageHeader } from '~/components/admin/page-header'
import { Can } from '~/components/providers/ability-provider'
import { useUrlState } from '~/hooks/use-url-state'
import { apiErrorMessage } from '~/lib/api-client'
import { currencyOptions } from '../../lib/currencies'
import { useStoreSettings, useUpdateStoreSettings, type StoreSettingsDto } from '../_api'
import GatewaysPage from './gateways'
import CurrenciesPanel from './currencies'
import ProductPagePanel from './product-page'
import StorefrontScreensPanel from './storefront-screens'
import ShippingPanel from './shipping'

function StoreDetailsPanel() {
  const query = useStoreSettings()
  const update = useUpdateStoreSettings()

  const [form, setForm] = useState<StoreSettingsDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (query.data) setForm(query.data)
  }, [query.data])

  function set<K extends keyof StoreSettingsDto>(key: K, value: StoreSettingsDto[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setError(null)
    setSaved(false)

    try {
      await update.mutateAsync(form)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save store settings'))
    }
  }

  if (!form) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Store</CardTitle>
          <CardDescription>Shown on receipts and in transactional email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="store-name">Store name</Label>
              <Input
                id="store-name"
                value={form.storeName ?? ''}
                onChange={(e) => set('storeName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-email">Store email</Label>
              <Input
                id="store-email"
                type="email"
                value={form.storeEmail ?? ''}
                onChange={(e) => set('storeEmail', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="store-address1">Address</Label>
            <Input
              id="store-address1"
              value={form.addressLine1 ?? ''}
              onChange={(e) => set('addressLine1', e.target.value)}
              placeholder="Line 1"
            />
            <Input
              value={form.addressLine2 ?? ''}
              onChange={(e) => set('addressLine2', e.target.value)}
              placeholder="Line 2"
            />
          </div>

          {/*
            Country leads the row because the city field below reads from it —
            with nothing chosen the city menu can only say "Choose a country
            first", and it used to say that while pointing at a control two
            cells to its right.
          */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="store-country">Country</Label>
              {/*
                Clearable, unlike the country on a customer address: the store's
                own address is optional, so an operator who picked one by
                mistake needs a way back to unset. The picker reports that as
                '', which the DTO stores as null.
              */}
              <CountrySelect
                id="store-country"
                value={form.country ?? ''}
                onChange={(value) => set('country', value || null)}
                clearable
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="store-city">City</Label>
              {/*
                Suggested, never restricted — the opposite of the country field
                beside it. The city list stops at settlements of 1,000 people,
                so a seller working out of a village would find their own
                address unenterable if this validated against it.
              */}
              <CityInput
                id="store-city"
                value={form.city ?? ''}
                onChange={(value) => set('city', value)}
                country={form.country ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-postal">Postcode</Label>
              <Input
                id="store-postal"
                value={form.postalCode ?? ''}
                onChange={(e) => set('postalCode', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Currency &amp; tax</CardTitle>
          <CardDescription>
            Currency is fixed once the first order exists — historical orders keep the currency they
            were charged in, so changing it later would make totals ambiguous.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="store-currency">Currency</Label>
              {/*
                A picker, not free text — and this is the field where a typo
                costs most: every product price is stored in the base currency,
                so a bad code prices the whole catalogue in something nobody can
                pay in.
              */}
              <AppSelect
                id="store-currency"
                value={form.currency}
                onChange={(value) => set('currency', value)}
                options={currencyOptions()}
                placeholder="Search a currency…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-tax-rate">Tax rate (%)</Label>
              <Input
                id="store-tax-rate"
                inputMode="decimal"
                value={String(form.taxRatePercent)}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  set('taxRatePercent', Number.isFinite(next) ? next : 0)
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-tax-label">Tax label</Label>
              <Input
                id="store-tax-label"
                value={form.taxLabel}
                onChange={(e) => set('taxLabel', e.target.value)}
                placeholder="VAT"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Prices include tax</p>
              <p className="text-xs text-muted-foreground">
                When on, the listed price already contains tax and it is shown broken out rather
                than added at checkout.
              </p>
            </div>
            <Switch checked={form.taxInclusive} onCheckedChange={(v) => set('taxInclusive', v)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checkout</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="store-ttl">Checkout window (minutes)</Label>
            <Input
              id="store-ttl"
              inputMode="numeric"
              value={String(form.checkoutTtlMinutes)}
              onChange={(e) => set('checkoutTtlMinutes', Number(e.target.value) || 60)}
            />
            <p className="text-xs text-muted-foreground">
              How long an unpaid order holds its stock.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="store-refund-window">Refund window (days)</Label>
            <Input
              id="store-refund-window"
              inputMode="numeric"
              value={String(form.refundWindowDays)}
              onChange={(e) => set('refundWindowDays', Number(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Affiliate commissions stay pending until this passes.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="store-order-prefix">Order number prefix</Label>
            <Input
              id="store-order-prefix"
              value={form.orderNumberPrefix}
              onChange={(e) => set('orderNumberPrefix', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

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

      <div className="flex justify-end">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  )
}

const TABS = ['store', 'shipping', 'currencies', 'payments'] as const

/**
 * Settings is split in two because the audiences differ: anyone with
 * `ecommerce:settings:manage` configures the store, but payment credentials sit
 * behind `ecommerce:gateways:manage` — holding the API keys is control of
 * payment processing, which is not the same job as setting a tax rate.
 */
export default function StoreSettingsPage() {
  /**
   * The tab lives in the URL so "the shipping settings" is a link someone can
   * paste, and a reload after saving comes back to the panel you were on.
   * Derived, not mirrored into state — a `useState` copy shows the old tab for
   * a frame after a back-button navigation.
   */
  const url = useUrlState()
  const tab = url.one('tab', TABS, 'store')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Store settings"
        subtitle="Store details, currency, tax, checkout behaviour and payment gateways."
      />

      <Tabs
        value={tab}
        onValueChange={(value) =>
          // 'store' is the default, so it stays out of the URL entirely.
          url.set({ tab: value === 'store' ? undefined : value })
        }
      >
        <TabsList>
          <TabsTrigger value="store">Store</TabsTrigger>
          <TabsTrigger value="shipping">Shipping</TabsTrigger>
          <TabsTrigger value="currencies">Currencies</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="store" className="pt-4 space-y-6">
          <StoreDetailsPanel />
          <ProductPagePanel />
          <StorefrontScreensPanel />
        </TabsContent>

        <TabsContent value="shipping" className="pt-4">
          <ShippingPanel />
        </TabsContent>

        <TabsContent value="currencies" className="pt-4">
          <CurrenciesPanel />
        </TabsContent>

        <TabsContent value="payments" className="pt-4">
          <Can
            permission="ecommerce:gateways:manage"
            fallback={
              <p className="text-sm text-muted-foreground">
                You don&apos;t have permission to manage payment credentials.
              </p>
            }
          >
            <GatewaysPage />
          </Can>
        </TabsContent>
      </Tabs>
    </div>
  )
}

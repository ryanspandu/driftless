import { useEffect, useState } from 'react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { AppSelect } from '~/components/ui/app-select'
import { usePagesList } from '~/hooks/api/use-pages'
import { apiErrorMessage } from '~/lib/api-client'
import { useStoreSettings, useUpdateStoreSettings } from '../_api'

/**
 * "Use as page" overrides for the storefront application screens.
 *
 * Basket, checkout, order status and the account page are fixed, per-visitor
 * screens by default. Assigning a published builder page here makes that page
 * render at the screen's URL instead — the operator drops the matching Commerce
 * block (Basket / Checkout / Order Status / Account) onto their page to keep the
 * working UI, then designs everything around it. Leaving a slot on the default
 * serves the built-in screen exactly as before.
 */

interface Slot {
  key:
    | 'cartPageId'
    | 'checkoutPageId'
    | 'orderPageId'
    | 'accountPageId'
    | 'loginPageId'
    | 'registerPageId'
  label: string
  url: string
  block: string
}

const SLOTS: Slot[] = [
  { key: 'cartPageId', label: 'Basket', url: '/shop/cart', block: 'Basket' },
  { key: 'checkoutPageId', label: 'Checkout', url: '/shop/checkout', block: 'Checkout' },
  { key: 'orderPageId', label: 'Order status', url: '/shop/order', block: 'Order Status' },
  { key: 'accountPageId', label: 'Account', url: '/shop/account', block: 'Account' },
  { key: 'loginPageId', label: 'Sign in', url: '/shop/account/login', block: 'Sign in' },
  {
    key: 'registerPageId',
    label: 'Sign up',
    url: '/shop/account/register',
    block: 'Sign up',
  },
]

export default function StorefrontScreensPanel() {
  const settings = useStoreSettings()
  const pages = usePagesList()
  const update = useUpdateStoreSettings()

  const [values, setValues] = useState<Record<Slot['key'], string>>({
    cartPageId: '',
    checkoutPageId: '',
    orderPageId: '',
    accountPageId: '',
    loginPageId: '',
    registerPageId: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!settings.data) return
    const data = settings.data
    setValues((prev) => {
      const next = { ...prev }
      for (const slot of SLOTS) next[slot.key] = data[slot.key] ?? ''
      return next
    })
  }, [settings.data])

  /** Only published pages are eligible — a draft would fall back to the fixed screen. */
  const options = [
    { value: '', label: 'Default (built-in screen)' },
    ...(pages.data ?? [])
      .filter((page) => page.status === 'PUBLISHED')
      .map((page) => ({ value: page.id, label: `${page.title} · /${page.path}` })),
  ]

  async function onSave() {
    setError(null)
    setSaved(false)
    try {
      await update.mutateAsync({
        cartPageId: values.cartPageId || null,
        checkoutPageId: values.checkoutPageId || null,
        orderPageId: values.orderPageId || null,
        accountPageId: values.accountPageId || null,
        loginPageId: values.loginPageId || null,
        registerPageId: values.registerPageId || null,
      })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2_000)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Storefront screens</CardTitle>
        <CardDescription>
          Basket, checkout, order status and the account page use built-in screens by default. Point
          any of them at a builder page to design your own — drop the matching Commerce block on the
          page to keep the working UI.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {SLOTS.map((slot) => (
          <div key={slot.key} className="space-y-1.5">
            <Label htmlFor={`slot-${slot.key}`}>{slot.label}</Label>
            <AppSelect
              id={`slot-${slot.key}`}
              value={values[slot.key]}
              onChange={(value) => setValues((prev) => ({ ...prev, [slot.key]: value }))}
              options={options}
              placeholder={pages.isLoading ? 'Loading…' : 'Choose a page…'}
            />
            <p className="text-xs text-muted-foreground">
              Served at <code>{slot.url}</code>. Add the <strong>{slot.block}</strong> block to your
              page.
            </p>
          </div>
        ))}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex items-center gap-3">
          <Button type="button" disabled={update.isPending} onClick={onSave}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
          {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}

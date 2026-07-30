import { useMemo, useState, type FormEvent } from 'react'
import { Link, router } from '@inertiajs/react'
import { Check, Copy, Package, Plus, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { MoneyInput } from '../../components/money-input'
import { AppSelect } from '~/components/ui/app-select'
import { CityInput } from '../../components/city-input'
import { CountrySelect } from '../../components/country-select'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { PageHeader } from '~/components/admin/page-header'
import { apiErrorMessage } from '~/lib/api-client'
import { formatMoney } from '../../lib/money'
import {
  useCreateManualOrder,
  useProducts,
  useStoreSettings,
  type ManualOrderResult,
  type VariantDto,
} from '../_api'

interface DraftLine {
  variantId: string
  quantity: number
}

/**
 * Product thumbnail for the picker.
 *
 * The placeholder is deliberately the same size as the image rather than
 * nothing: a list where some rows have a thumbnail and others do not would have
 * its titles start at two different offsets, which is harder to scan than no
 * images at all. Matches the treatment in the products table.
 */
function ProductThumb({ src }: { src: string | null }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <Package className="size-4 text-muted-foreground" aria-hidden />
      )}
    </span>
  )
}

export default function NewOrderPage() {
  const settings = useStoreSettings()
  const create = useCreateManualOrder()

  /**
   * The whole catalogue in one page. A manual order is typed by someone on the
   * phone, so a searchable list of everything beats pagination they would have
   * to navigate mid-call.
   */
  const catalogue = useProducts({ page: 1, pageSize: 100, status: 'active' })

  const [lines, setLines] = useState<DraftLine[]>([])
  const [email, setEmail] = useState('')
  const [shippingAmount, setShippingAmount] = useState<number | null>(0)
  const [discountAmount, setDiscountAmount] = useState<number | null>(0)
  const [markPaid, setMarkPaid] = useState(false)
  const [paymentReference, setPaymentReference] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [address, setAddress] = useState({
    firstName: '',
    lastName: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    phone: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<ManualOrderResult | null>(null)
  const [copied, setCopied] = useState(false)

  const currency = settings.data?.currency ?? 'USD'
  const locale = settings.data?.locale ?? undefined

  /**
   * What the picker says about stock — and it has to say something.
   *
   * Nothing here used to, so an item with none left looked identical to one in
   * stock, and the only sign was the order being refused *after* the whole form
   * had been filled in. The refusal is correct — the server is the authority on
   * stock and stays that way — but finding out at the end is a dead end.
   *
   * Deliberately a label, not a disabled option: staff take orders for things
   * that are on their way in, and the server already refuses what it must.
   */
  function stockNote(variant: VariantDto): string {
    if (!variant.trackInventory || variant.allowBackorder) return ''
    if (variant.available === null) return ''
    if (variant.available <= 0) return ' · out of stock'
    if (variant.available <= 5) return ` · ${variant.available} left`
    return ''
  }

  /** Every sellable variant, flattened, labelled for the picker. */
  const variantOptions = useMemo(() => {
    const products = catalogue.data?.items ?? []
    return products.flatMap((product) =>
      product.variants.map((variant) => ({
        value: variant.id,
        label: `${product.title}${variant.title && variant.title !== 'Default' ? ` — ${variant.title}` : ''} · ${variant.price.formatted}${stockNote(variant)}`,
        price: variant.price.amount,
        /**
         * The variant's own photo first, then the product's.
         *
         * A variant that has been photographed separately is usually the one
         * that differs visually — a colour, a finish — which is exactly what
         * someone picking from a list of near-identical titles is looking at.
         */
        icon: (
          <ProductThumb src={variant.imageUrl ?? product.images[0]?.mediaUrl ?? null} />
        ),
      }))
    )
  }, [catalogue.data])

  const priceOf = (variantId: string) =>
    variantOptions.find((option) => option.value === variantId)?.price ?? 0

  /**
   * A preview only, and clearly labelled as one.
   *
   * The server re-derives every figure from the database when the order is
   * created — this exists so whoever is on the phone can read a number out
   * loud, not to decide what anyone is charged. Tax is deliberately absent:
   * guessing it here would produce a total that quietly disagrees with the
   * order.
   */
  const previewSubtotal = lines.reduce(
    (sum, line) => sum + priceOf(line.variantId) * line.quantity,
    0
  )
  const previewTotal = Math.max(previewSubtotal - (discountAmount ?? 0) + (shippingAmount ?? 0), 0)

  function addLine() {
    setLines((prev) => [...prev, { variantId: '', quantity: 1 }])
  }

  function setLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const usable = lines.filter((line) => line.variantId && line.quantity > 0)
    if (usable.length === 0) {
      setError('Add at least one item.')
      return
    }

    const hasAddress = address.line1.trim() && address.city.trim() && address.country.trim()

    try {
      const result = await create.mutateAsync({
        lines: usable,
        email: email.trim(),
        shippingAddress: hasAddress
          ? {
              firstName: address.firstName.trim() || null,
              lastName: address.lastName.trim() || null,
              line1: address.line1.trim(),
              line2: address.line2.trim() || null,
              city: address.city.trim(),
              state: address.state.trim() || null,
              postalCode: address.postalCode.trim() || null,
              country: address.country.trim().toUpperCase(),
              phone: address.phone.trim() || null,
            }
          : undefined,
        shippingAmount: shippingAmount ?? 0,
        discountAmount: discountAmount ?? 0,
        markPaid,
        paymentReference: paymentReference.trim() || null,
        internalNote: internalNote.trim() || null,
      })
      setCreated(result)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  /**
   * The success screen exists because of one fact: the access token is returned
   * exactly once and stored only as a hash. Navigating straight to the order
   * would lose the only copy of the buyer's link.
   */
  if (created) {
    const orderUrl = `${window.location.origin}/shop/order?token=${encodeURIComponent(created.accessToken)}`

    return (
      <div className="space-y-6">
        <PageHeader
          title={`Order ${created.orderNumber} created`}
          subtitle={
            created.paid
              ? 'Recorded as paid. Stock has been committed.'
              : 'Awaiting payment. Stock is reserved until the checkout window expires.'
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>Send this link to the buyer</CardTitle>
            <CardDescription>
              It is how they see their order — and reach any files they bought — without an account.
              This is the only time it is shown; it is stored as a hash and cannot be recovered.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Input readOnly value={orderUrl} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                className="shrink-0 gap-2"
                onClick={async () => {
                  await navigator.clipboard.writeText(orderUrl).catch(() => {})
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 2_000)
                }}
              >
                {copied ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Copy className="size-4" aria-hidden />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={() => router.visit(`/admin/ecommerce/orders/${created.orderId}`)}>
                Open the order
              </Button>
              <Button variant="ghost" render={<Link href="/admin/ecommerce/orders/new" />}>
                Create another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New order"
        subtitle="For a sale taken by phone, in person, or on an invoice."
        actions={
          <Button variant="ghost" render={<Link href="/admin/ecommerce/orders" />}>
            Cancel
          </Button>
        }
      />

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <CardDescription>
                Prices come from the catalogue. Staff choose what and how many — never what it
                costs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items yet.</p>
              ) : null}

              {lines.map((line, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor={`variant-${index}`}>Product</Label>
                    <AppSelect
                      id={`variant-${index}`}
                      value={line.variantId}
                      onChange={(value) => setLine(index, { variantId: value })}
                      options={variantOptions}
                      placeholder={catalogue.isLoading ? 'Loading…' : 'Choose a product…'}
                    />
                  </div>
                  <div className="w-24 space-y-1.5">
                    <Label htmlFor={`qty-${index}`}>Qty</Label>
                    <Input
                      id={`qty-${index}`}
                      type="number"
                      min={1}
                      max={999}
                      value={line.quantity}
                      onChange={(e) => setLine(index, { quantity: Number(e.target.value) })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mb-0.5 shrink-0"
                    onClick={() => removeLine(index)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    <span className="sr-only">Remove item {index + 1}</span>
                  </Button>
                </div>
              ))}

              <Button type="button" variant="outline" className="gap-2" onClick={addLine}>
                <Plus className="size-4" aria-hidden />
                Add item
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Buyer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Where the order link goes. No account is created.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={address.firstName}
                    onChange={(e) => setAddress({ ...address, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={address.lastName}
                    onChange={(e) => setAddress({ ...address, lastName: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="line1">Address</Label>
                <Input
                  id="line1"
                  value={address.line1}
                  onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                  placeholder="Street and number"
                />
                <Input
                  value={address.line2}
                  onChange={(e) => setAddress({ ...address, line2: e.target.value })}
                  placeholder="Apartment, suite (optional)"
                />
              </div>

              {/*
                Country leads the row: the city field reads from it for its
                suggestions, and a form filled top to bottom would otherwise
                reach the city with nothing to offer.
              */}
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="country">Country</Label>
                  {/*
                    Clearable because the address is optional in full: someone who
                    starts one and then learns the order is digital-only needs a way
                    back to blank, which is what `hasAddress` reads to drop it.
                  */}
                  <CountrySelect
                    id="country"
                    value={address.country}
                    onChange={(value) => setAddress({ ...address, country: value })}
                    clearable
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="city">City</Label>
                  {/*
                    Suggested from the country beside it, never restricted to the
                    list — the data stops at settlements of 1,000 people, so a
                    buyer in a village must still be able to type their own.
                  */}
                  <CityInput
                    id="city"
                    value={address.city}
                    onChange={(value) => setAddress({ ...address, city: value })}
                    country={address.country}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="postalCode">Postcode</Label>
                  <Input
                    id="postalCode"
                    value={address.postalCode}
                    onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                An address is optional — leave it blank for a digital-only order.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Charges</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="shipping">Shipping</Label>
                <MoneyInput
                  id="shipping"
                  value={shippingAmount}
                  currency={currency}
                  onChange={setShippingAmount}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="discount">Discount</Label>
                <MoneyInput
                  id="discount"
                  value={discountAmount}
                  currency={currency}
                  onChange={setDiscountAmount}
                />
                <p className="text-xs text-muted-foreground">
                  Never more than the items are worth.
                </p>
              </div>

              <div className="space-y-1 border-t pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Items</span>
                  <span className="tabular-nums">
                    {formatMoney(previewSubtotal, currency, locale)}
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Estimated total</span>
                  <span className="tabular-nums">
                    {formatMoney(previewTotal, currency, locale)}
                  </span>
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                  An estimate. The server prices the order from the catalogue and adds tax when it
                  is created.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="markPaid">Already paid</Label>
                  <p className="text-xs text-muted-foreground">
                    Cash, transfer or a terminal. Commits stock and releases any downloads.
                  </p>
                </div>
                <Switch id="markPaid" checked={markPaid} onCheckedChange={setMarkPaid} />
              </div>

              {markPaid ? (
                <div className="space-y-1.5">
                  <Label htmlFor="reference">Reference</Label>
                  <Input
                    id="reference"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="Bank transfer 8812"
                  />
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="internalNote">Internal note</Label>
                <Textarea
                  id="internalNote"
                  rows={3}
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  placeholder="Not shown to the buyer."
                />
              </div>
            </CardContent>
          </Card>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create order'}
          </Button>
        </div>
      </form>
    </div>
  )
}

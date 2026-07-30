import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Head, usePage } from '@inertiajs/react'
import { CityInput } from '../components/city-input'
import { CountrySelect } from '../components/country-select'
import {
  newIdempotencyKey,
  shopApi,
  shopFetch,
  type CartDto,
  type ShippingOptionDto,
} from './_api'

interface PageProps {
  /** Which gateways the store actually has credentials for. */
  gateways: ('stripe' | 'paypal')[]
  digitalOnly: boolean
}

const GATEWAY_LABEL: Record<string, string> = {
  stripe: 'Card',
  paypal: 'PayPal',
}

/**
 * Checkout.
 *
 * The form collects an address and an email; it never sends a price. The server
 * prices the basket from the database, and the response is a redirect to the
 * gateway's own hosted page — card details never touch this application.
 */
export default function CheckoutPage() {
  const { gateways, digitalOnly } = usePage<{ props: PageProps }>().props as unknown as PageProps

  const [cart, setCart] = useState<CartDto | null>(null)
  const [email, setEmail] = useState('')
  const [gateway, setGateway] = useState<'stripe' | 'paypal'>(gateways[0] ?? 'stripe')
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

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Delivery options for the address so far.
   *
   * Quoted by the server — the form sends a country, never a rate. `required`
   * is false for a downloads-only basket or a shop with no zones, and the
   * section then disappears entirely rather than asking for a choice that does
   * not exist.
   */
  const [shipping, setShipping] = useState<{
    required: boolean
    options: ShippingOptionDto[]
  }>({ required: false, options: [] })
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(null)

  /**
   * One key per form, minted on mount — not per submit.
   *
   * A double-click therefore replays the first response instead of creating a
   * second order. A fresh key is only issued when the shopper reloads and
   * genuinely starts over.
   */
  const idempotencyKey = useMemo(() => newIdempotencyKey(), [])

  useEffect(() => {
    let alive = true
    Promise.all([shopApi.cart(), shopApi.me()])
      .then(([basket, me]) => {
        if (!alive) return
        setCart(basket)
        if (me.customer) {
          setEmail(me.customer.email)
          setAddress((prev) => ({
            ...prev,
            firstName: me.customer!.firstName ?? prev.firstName,
            lastName: me.customer!.lastName ?? prev.lastName,
          }))
        }
      })
      .catch(() => alive && setError('Could not load your basket.'))
    return () => {
      alive = false
    }
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    /**
     * City and country are the two fields the browser will not police: it
     * enforces `required` on real form controls only, and both are now custom
     * widgets. Left unchecked they reach the server empty and come back as a
     * validation error with no field named, which reads as "Something went
     * wrong" — so the stop happens here instead, as it used to. The condition
     * mirrors the payload below: an address that is never sent has nothing to
     * check.
     */
    if (!digitalOnly && address.line1.trim() && (!address.city.trim() || !address.country)) {
      setError('Please tell us the city and country to deliver to.')
      return
    }

    setSubmitting(true)

    try {
      const result = await shopFetch<{ redirectUrl: string; paid: boolean }>('/api/shop/checkout', {
        method: 'POST',
        idempotencyKey,
        body: JSON.stringify({
          email: email.trim(),
          gateway,
          // A method id, never a rate — the server re-derives what it costs.
          shippingMethodId,
          // Digital-only baskets need no shipping address at all.
          ...(digitalOnly || !address.line1.trim()
            ? {}
            : {
                shippingAddress: {
                  firstName: address.firstName.trim() || null,
                  lastName: address.lastName.trim() || null,
                  line1: address.line1.trim(),
                  line2: address.line2.trim() || null,
                  city: address.city.trim(),
                  state: address.state.trim() || null,
                  postalCode: address.postalCode.trim() || null,
                  // No trim or case fix: the picker is the only writer of this
                  // field and it emits an ISO code or nothing.
                  country: address.country,
                  phone: address.phone.trim() || null,
                },
              }),
        }),
      })

      /**
       * One destination, two meanings: the gateway's hosted page for an order
       * with something to pay, or the buyer's own order page when a discount
       * took the basket to zero. The server decides which — the client just
       * follows, so a free checkout needs no special case here beyond the
       * wording above the button.
       */
      window.location.href = result.redirectUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed.')
      setSubmitting(false)
    }
  }

  /**
   * Re-quote whenever the destination changes. Still debounced: the country now
   * arrives in one piece from a picker, but the county/state beside it is a
   * text field and fires on every keystroke.
   *
   * The length guard is not dead. The picker emits a two-letter code or the
   * empty string, and the empty string is the case that matters — an untouched
   * or cleared country must drop the quote rather than ask the server about
   * nowhere.
   */
  useEffect(() => {
    const country = address.country.trim().toUpperCase()
    if (country.length !== 2) {
      setShipping({ required: false, options: [] })
      return
    }

    let alive = true
    const timer = window.setTimeout(() => {
      shopFetch<{ required: boolean; options: ShippingOptionDto[] }>(
        '/api/shop/shipping/options',
        { method: 'POST', body: JSON.stringify({ country, state: address.state.trim() || null }) }
      )
        .then((data) => {
          if (!alive) return
          setShipping(data)
          // Default to the cheapest, which is what the server would pick anyway.
          setShippingMethodId(data.options[0]?.methodId ?? null)
        })
        .catch(() => {
          if (alive) setShipping({ required: false, options: [] })
        })
    }, 400)

    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [address.country, address.state])

  if (!cart) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Head title="Checkout" />
        <p className="text-sm text-muted-foreground">{error ?? 'Loading…'}</p>
      </div>
    )
  }

  if (cart.lines.length === 0) {
    /**
     * Reached by opening checkout directly, or by going back after paying —
     * checkout empties the basket, so the second case is the common one. The
     * copy covers both without guessing which happened.
     */
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <Head title="Checkout" />

        <div className="mx-auto flex size-20 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-9 text-muted-foreground"
            aria-hidden
          >
            <path d="M5 8h14l-1.2 10.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" />
            <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
          </svg>
        </div>

        <h1 className="mt-7 text-3xl font-semibold tracking-tight text-balance">
          There is nothing to check out
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-pretty text-muted-foreground">
          Your basket is empty. If you have just paid, your order is confirmed — the link in
          your email opens it.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/shop"
            className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Browse the shop
          </a>
          <a
            href="/shop/cart"
            className="inline-flex h-11 items-center rounded-lg border border-border px-5 text-sm font-medium transition-colors hover:bg-accent/40"
          >
            View basket
          </a>
        </div>
      </div>
    )
  }

  const needsAddress = !digitalOnly && !cart.digitalOnly
  /**
   * A basket a discount already took to zero. The server decides this too — the
   * flag here only chooses the wording and lets a shop with no payment gateway
   * still complete the order.
   */
  const isFree = cart.total.amount === 0

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <Head title="Checkout" />
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-5">
        <form onSubmit={onSubmit} className="space-y-6 lg:col-span-3">
          <section className="space-y-3">
            <h2 className="text-sm font-medium">Contact</h2>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              // h-9 rather than py-2: this input shares grid rows with CityInput
        // and CountrySelect, which are both 36px, and py-2 made it 38.
        className="h-9 w-full rounded-lg border border-border px-3 py-1 text-sm"
              aria-label="Email"
            />
            <p className="text-xs text-muted-foreground">Your receipt and order updates go here.</p>
          </section>

          {needsAddress ? (
            <section className="space-y-3">
              <h2 className="text-sm font-medium">Delivery address</h2>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="First name"
                  value={address.firstName}
                  onChange={(v) => setAddress((a) => ({ ...a, firstName: v }))}
                />
                <Field
                  label="Last name"
                  value={address.lastName}
                  onChange={(v) => setAddress((a) => ({ ...a, lastName: v }))}
                />
              </div>

              <Field
                label="Address"
                required
                value={address.line1}
                onChange={(v) => setAddress((a) => ({ ...a, line1: v }))}
              />
              <Field
                label="Address line 2"
                value={address.line2}
                onChange={(v) => setAddress((a) => ({ ...a, line2: v }))}
              />

              {/*
                Country before the city row, not after it: the city field takes
                its suggestions from this one, so a buyer working down the form
                would otherwise reach the city with nothing to offer them.
              */}
              <FieldShell label="Country" htmlFor="checkout-country">
                <CountrySelect
                  id="checkout-country"
                  value={address.country}
                  onChange={(v) => setAddress((a) => ({ ...a, country: v }))}
                />
              </FieldShell>

              <div className="grid gap-3 sm:grid-cols-3">
                <FieldShell label="City" htmlFor="checkout-city">
                  <CityInput
                    id="checkout-city"
                    value={address.city}
                    onChange={(v) => setAddress((a) => ({ ...a, city: v }))}
                    country={address.country}
                  />
                </FieldShell>
                <Field
                  label="County / State"
                  value={address.state}
                  onChange={(v) => setAddress((a) => ({ ...a, state: v }))}
                />
                <Field
                  label="Postcode"
                  value={address.postalCode}
                  onChange={(v) => setAddress((a) => ({ ...a, postalCode: v }))}
                />
              </div>

            </section>
          ) : null}

          {shipping.required ? (
            <section className="space-y-3">
              <h2 className="text-sm font-medium">Delivery</h2>

              {shipping.options.length === 0 ? (
                <p className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
                  We do not deliver to that address yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {shipping.options.map((option) => (
                    <label
                      key={option.methodId}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm"
                    >
                      <input
                        type="radio"
                        name="shipping"
                        value={option.methodId}
                        checked={shippingMethodId === option.methodId}
                        onChange={() => setShippingMethodId(option.methodId)}
                      />
                      <span className="min-w-0 flex-1">
                        {option.name}
                        {option.minDeliveryDays && option.maxDeliveryDays ? (
                          <span className="text-muted-foreground">
                            {' '}
                            · {option.minDeliveryDays}–{option.maxDeliveryDays} days
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {option.free ? 'Free' : option.price.formatted}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-sm font-medium">Payment</h2>

            {isFree ? (
              <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                Nothing to pay — your discount covers this order in full.
              </p>
            ) : gateways.length === 0 ? (
              <p className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
                This shop is not accepting payments yet.
              </p>
            ) : (
              <div className="space-y-2">
                {gateways.map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm"
                  >
                    <input
                      type="radio"
                      name="gateway"
                      value={option}
                      checked={gateway === option}
                      onChange={() => setGateway(option)}
                    />
                    {GATEWAY_LABEL[option] ?? option}
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">
                  You will be taken to {GATEWAY_LABEL[gateway] ?? gateway} to pay securely. Your
                  card details never reach this site.
                </p>
              </div>
            )}
          </section>

          {error ? (
            <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            // A free order needs no gateway, so an unconfigured shop can still
            // hand over a download that costs nothing.
            disabled={submitting || (!isFree && gateways.length === 0)}
            className="w-full rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {submitting
              ? isFree
                ? 'Placing your order…'
                : 'Taking you to payment…'
              : isFree
                ? 'Place free order'
                : `Pay ${cart.total.formatted}`}
          </button>
        </form>

        <aside className="lg:col-span-2">
          <div className="rounded-xl border border-border p-5">
            <h2 className="text-sm font-medium">Order summary</h2>

            <ul className="mt-4 space-y-3">
              {cart.lines.map((line) => (
                <li key={line.variantId} className="flex gap-3 text-sm">
                  <div className="size-12 shrink-0 overflow-hidden rounded bg-muted">
                    {line.imageUrl ? (
                      <img src={line.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{line.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.variantTitle ? `${line.variantTitle} · ` : ''}
                      {line.quantity} ×
                    </p>
                  </div>
                  <span className="tabular-nums">{line.total.formatted}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{cart.subtotal.formatted}</span>
              </div>
              {cart.tax.amount > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="tabular-nums">{cart.tax.formatted}</span>
                </div>
              ) : null}
              <div className="flex justify-between font-medium">
                <span>Total</span>
                <span className="tabular-nums">{cart.total.formatted}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
    </label>
  )
}

/**
 * The shell of a {@link Field} without the wrapping `<label>`, for the two
 * fields that are widgets rather than a single input.
 *
 * A `<label>` claims every click inside it for the control it owns, so a
 * wrapped combobox or select loses its own menu the moment an option is
 * clicked, and a screen reader reads the whole widget out as the label text.
 * `htmlFor` says the same thing without swallowing the widget.
 */
function FieldShell({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="block space-y-1">
      <label htmlFor={htmlFor} className="block text-xs text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

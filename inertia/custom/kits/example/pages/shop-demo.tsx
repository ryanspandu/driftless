import { useEffect, useRef, useState } from 'react'
import type { CodePageProps } from '~/custom/types'
import { PageShell } from '../components/page_shell'
import {
  shop,
  isStoreOff,
  newIdempotencyKey,
  ShopError,
  type Product,
  type Cart,
  type CheckoutConfig,
} from '../components/shop_api'

/**
 * A full, DECOUPLED mini-storefront in a kit: catalogue → product detail →
 * add-to-cart → cart → checkout → gateway redirect — driven entirely by the
 * public `/api/shop/*` API through the kit-local `shop` client. It never imports
 * the e-commerce module.
 *
 * It is a reference/demo: a real checkout creates an order and redirects to the
 * payment gateway. Every step degrades to a "store unavailable" state when the
 * e-commerce module is disabled (the API returns 404). `/shop/*` is reserved, so
 * the whole flow lives under this one `/kit-example/` route via view state.
 */
export const path = 'kit-example/shop-demo'
export const title = 'Storefront in a kit'

type View = 'catalogue' | 'detail' | 'cart' | 'checkout'

function errMessage(err: unknown): string {
  return err instanceof ShopError ? err.message : 'Something went wrong.'
}

export default function ShopDemo({ header, footer }: CodePageProps) {
  const [view, setView] = useState<View>('catalogue')
  const [storeOff, setStoreOff] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const [product, setProduct] = useState<Product | null>(null)
  const [variantId, setVariantId] = useState<string | null>(null)

  const [cart, setCart] = useState<Cart | null>(null)

  const [config, setConfig] = useState<CheckoutConfig | null>(null)
  const [form, setForm] = useState({ email: '', gateway: '', line1: '', city: '', country: 'US' })
  const [placing, setPlacing] = useState(false)
  const idempotencyKey = useRef(newIdempotencyKey())

  function handle(err: unknown) {
    if (isStoreOff(err)) setStoreOff(true)
    else setError(errMessage(err))
  }

  useEffect(() => {
    let alive = true
    shop
      .getProducts({ pageSize: 12 })
      .then((page) => {
        if (!alive) return
        setProducts(page.items)
        setLoading(false)
      })
      .catch((err) => {
        if (!alive) return
        setLoading(false)
        handle(err)
      })
    return () => {
      alive = false
    }
  }, [])

  async function openProduct(slug: string) {
    setError(null)
    try {
      const p = await shop.getProduct(slug)
      setProduct(p)
      setVariantId(p.variants[0]?.id ?? null)
      setView('detail')
    } catch (err) {
      handle(err)
    }
  }

  async function addToCart() {
    if (!variantId) return
    setError(null)
    try {
      setCart(await shop.addToCart(variantId))
      setView('cart')
    } catch (err) {
      handle(err)
    }
  }

  async function refreshCart() {
    setError(null)
    try {
      setCart(await shop.getCart())
      setView('cart')
    } catch (err) {
      handle(err)
    }
  }

  async function setQty(vId: string, qty: number) {
    try {
      setCart(qty <= 0 ? await shop.removeLine(vId) : await shop.setQuantity(vId, qty))
    } catch (err) {
      handle(err)
    }
  }

  async function openCheckout() {
    setError(null)
    try {
      const cfg = await shop.getCheckoutConfig()
      setConfig(cfg)
      setForm((f) => ({ ...f, gateway: f.gateway || (cfg.gateways[0] ?? '') }))
      setView('checkout')
    } catch (err) {
      handle(err)
    }
  }

  async function placeOrder(event: React.FormEvent) {
    event.preventDefault()
    setPlacing(true)
    setError(null)
    try {
      const result = await shop.checkout(
        {
          email: form.email,
          gateway: form.gateway,
          ...(config?.digitalOnly
            ? {}
            : { shippingAddress: { line1: form.line1, city: form.city, country: form.country } }),
        },
        idempotencyKey.current
      )
      // Hosted gateway page, or the order page for a zero-total order.
      window.location.href = result.redirectUrl
    } catch (err) {
      setPlacing(false)
      handle(err)
    }
  }

  const body = (() => {
    if (storeOff) {
      return (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          The store is turned off. Enable the e-commerce module under Settings → Modules to see it.
        </p>
      )
    }
    if (loading) return <p className="text-sm text-muted-foreground">Loading the store…</p>

    if (view === 'detail' && product) {
      const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0]
      return (
        <div className="space-y-5">
          <button
            onClick={() => setView('catalogue')}
            className="text-sm text-primary hover:underline"
          >
            ← All products
          </button>
          <h2 className="text-2xl font-semibold tracking-tight">{product.title}</h2>
          {product.subtitle ? <p className="text-muted-foreground">{product.subtitle}</p> : null}
          {product.variants.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVariantId(v.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${v.id === variant?.id ? 'border-primary text-primary' : 'border-border text-foreground'}`}
                >
                  {v.title} · {v.price.formatted}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-lg font-medium">{variant?.price.formatted}</p>
          <button
            onClick={addToCart}
            disabled={!variant || variant.availability === 'out_of_stock'}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {variant?.availability === 'out_of_stock' ? 'Out of stock' : 'Add to cart'}
          </button>
        </div>
      )
    }

    if (view === 'cart') {
      return (
        <div className="space-y-5">
          <button
            onClick={() => setView('catalogue')}
            className="text-sm text-primary hover:underline"
          >
            ← Keep shopping
          </button>
          <h2 className="text-2xl font-semibold tracking-tight">Your cart</h2>
          {!cart || cart.lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your cart is empty.</p>
          ) : (
            <>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {cart.lines.map((line) => (
                  <li key={line.variantId} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{line.title}</p>
                      <p className="text-xs text-muted-foreground">{line.variantTitle}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setQty(line.variantId, line.quantity - 1)}
                        className="size-7 rounded border border-border"
                      >
                        −
                      </button>
                      <span className="tabular-nums">{line.quantity}</span>
                      <button
                        onClick={() => setQty(line.variantId, line.quantity + 1)}
                        className="size-7 rounded border border-border"
                      >
                        +
                      </button>
                      <span className="w-20 text-right text-sm tabular-nums">
                        {line.total.formatted}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-lg font-semibold tabular-nums">{cart.total.formatted}</span>
              </div>
              <button
                onClick={openCheckout}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Checkout
              </button>
            </>
          )}
        </div>
      )
    }

    if (view === 'checkout' && config) {
      return (
        <form onSubmit={placeOrder} className="max-w-md space-y-4">
          <button
            type="button"
            onClick={() => setView('cart')}
            className="text-sm text-primary hover:underline"
          >
            ← Back to cart
          </button>
          <h2 className="text-2xl font-semibold tracking-tight">Checkout</h2>
          <Field
            label="Email"
            value={form.email}
            onChange={(v) => setForm((f) => ({ ...f, email: v }))}
            type="email"
            required
          />
          {!config.digitalOnly ? (
            <>
              <Field
                label="Address"
                value={form.line1}
                onChange={(v) => setForm((f) => ({ ...f, line1: v }))}
                required
              />
              <Field
                label="City"
                value={form.city}
                onChange={(v) => setForm((f) => ({ ...f, city: v }))}
                required
              />
              <Field
                label="Country (ISO code)"
                value={form.country}
                onChange={(v) => setForm((f) => ({ ...f, country: v }))}
                required
              />
            </>
          ) : null}
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Pay with</span>
            <select
              value={form.gateway}
              onChange={(e) => setForm((f) => ({ ...f, gateway: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            >
              {config.gateways.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={placing || config.gateways.length === 0}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {placing ? 'Placing order…' : 'Place order → payment'}
          </button>
          {config.gateways.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No payment gateway is configured in the store.
            </p>
          ) : null}
        </form>
      )
    }

    // Catalogue
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{products.length} product(s)</p>
          <button onClick={refreshCart} className="text-sm text-primary hover:underline">
            View cart{cart ? ` (${cart.itemCount})` : ''}
          </button>
        </div>
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No products yet — add some under E-commerce.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => openProduct(p.slug)}
                className="flex flex-col rounded-xl border border-border bg-card p-5 text-left text-card-foreground transition-colors hover:border-foreground/30"
              >
                <span className="text-base font-semibold leading-snug">{p.title}</span>
                {p.subtitle ? (
                  <span className="mt-1 text-sm text-muted-foreground">{p.subtitle}</span>
                ) : null}
                {p.priceFrom ? (
                  <span className="mt-3 text-sm font-medium">{p.priceFrom.formatted}</span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  })()

  return (
    <PageShell
      header={header}
      footer={footer}
      eyebrow="Using the e-commerce module"
      title="A storefront, built in a kit"
      intro="Catalogue, cart and checkout — all driven by the public /api/shop/* API through a kit-local client, never importing the module. It's a reference: a real checkout creates an order and redirects to the gateway."
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {body}
    </PageShell>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
    </label>
  )
}

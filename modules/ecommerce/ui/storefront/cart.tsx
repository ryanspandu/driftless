import { useEffect, useState } from 'react'
import { Head } from '@inertiajs/react'
import { shopApi, type CartDto } from './_api'
import { StorefrontLayout } from './_layout'
import { EmptyBasket } from './_empty-basket'

/**
 * The basket.
 *
 * A module UI page, so it renders inside `PublicLayout` (the `layout-shell`
 * regex only routes `modules/*​/admin/*` to the admin chrome). CSR is fine here
 * — a basket is per-visitor and must never be cached or server-rendered into a
 * shared snapshot.
 *
 * Every amount shown comes from the server's `formatted` string. This page does
 * no money arithmetic of its own, so the total a shopper sees is by
 * construction the one the checkout computes.
 */
/**
 * The basket UI.
 *
 * Exported as a component (not just the page default) so the same screen can be
 * dropped onto a builder page via the `CartBlock`, letting an operator override
 * `/shop/cart` with a designed page. `embedded` drops the `<Head>` because on an
 * override page the page itself owns the document title/SEO.
 */
export function CartScreen({ embedded }: { embedded?: boolean } = {}) {
  const [cart, setCart] = useState<CartDto | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    shopApi
      .cart()
      .then((data) => alive && setCart(data))
      .catch(() => alive && setError('Could not load your basket.'))
    return () => {
      alive = false
    }
  }, [])

  async function run(variantId: string, action: () => Promise<CartDto>) {
    setBusy(variantId)
    setError(null)
    try {
      setCart(await action())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your basket.')
    } finally {
      setBusy(null)
    }
  }

  if (!cart) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        {!embedded && <Head title="Basket" />}
        <p className="text-sm text-muted-foreground">{error ?? 'Loading…'}</p>
      </div>
    )
  }

  if (cart.lines.length === 0) {
    return (
      <>
        {!embedded && <Head title="Basket" />}
        <EmptyBasket />
      </>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {!embedded && <Head title="Basket" />}
      <h1 className="text-2xl font-semibold tracking-tight">Basket</h1>

      {error ? (
        <p
          className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <ul className="mt-8 divide-y divide-border">
        {cart.lines.map((line) => (
          <li key={line.variantId} className="flex gap-4 py-5">
            <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
              {line.imageUrl ? (
                <img src={line.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              <a href={`/shop/p/${line.slug}`} className="font-medium hover:underline">
                {line.title}
              </a>
              {line.variantTitle ? (
                <p className="text-sm text-muted-foreground">{line.variantTitle}</p>
              ) : null}
              <p className="text-sm text-muted-foreground">{line.unit.formatted} each</p>

              {line.unavailable ? (
                <p className="mt-1 text-sm font-medium text-amber-600">
                  No longer available in this quantity
                </p>
              ) : null}

              <div className="mt-2 flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={line.quantity}
                  disabled={busy === line.variantId}
                  aria-label={`Quantity for ${line.title}`}
                  onChange={(e) => {
                    const next = Math.max(0, Math.min(99, Number(e.target.value) || 0))
                    void run(line.variantId, () => shopApi.setQuantity(line.variantId, next))
                  }}
                  className="w-20 rounded-lg border border-border px-2 py-1 text-sm tabular-nums"
                />
                <button
                  type="button"
                  disabled={busy === line.variantId}
                  onClick={() => void run(line.variantId, () => shopApi.removeLine(line.variantId))}
                  className="text-sm text-muted-foreground underline hover:text-foreground"
                >
                  Remove
                </button>
              </div>
            </div>

            <p className="shrink-0 tabular-nums">{line.total.formatted}</p>
          </li>
        ))}
      </ul>

      <div className="mt-6 space-y-2 border-t border-border pt-6">
        <Row label="Subtotal" value={cart.subtotal.formatted} />
        {cart.discount.amount > 0 ? (
          <Row label="Discount" value={`−${cart.discount.formatted}`} />
        ) : null}
        {cart.tax.amount > 0 ? <Row label="Tax" value={cart.tax.formatted} /> : null}
        <Row label="Total" value={cart.total.formatted} bold />
        <p className="text-xs text-muted-foreground">Shipping is calculated at checkout.</p>
      </div>

      <a
        href="/shop/checkout"
        className="mt-6 block rounded-lg bg-primary px-5 py-3 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Checkout
      </a>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={bold ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-medium' : ''}`}>{value}</span>
    </div>
  )
}

/** The fixed `/shop/cart` screen (default when no override page is assigned). */
export default function CartPage() {
  return (
    <StorefrontLayout title="Basket">
      <CartScreen embedded />
    </StorefrontLayout>
  )
}

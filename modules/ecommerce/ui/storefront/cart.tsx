import { useEffect, useState } from 'react'
import { Head } from '@inertiajs/react'
import { shopApi, type CartDto } from './_api'

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
export default function CartPage() {
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
        <Head title="Basket" />
        <p className="text-sm text-muted-foreground">{error ?? 'Loading…'}</p>
      </div>
    )
  }

  if (cart.lines.length === 0) {
    return (
      <div className="relative overflow-hidden px-4 py-24">
        <Head title="Basket" />

        {/*
          The same treatment as the error pages, drawn in CSS rather than
          shipped as an asset. `aria-hidden` because none of it means anything —
          a screen reader should hear the heading, not the scenery.
        */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                'linear-gradient(to right, var(--color-border) 1px, transparent 1px),' +
                'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              maskImage:
                'radial-gradient(ellipse 65% 60% at 50% 40%, black 25%, transparent 100%)',
              WebkitMaskImage:
                'radial-gradient(ellipse 65% 60% at 50% 40%, black 25%, transparent 100%)',
            }}
          />
          <div className="absolute top-1/2 left-1/2 size-[30rem] -translate-x-1/2 -translate-y-[65%] rounded-full bg-primary/[0.06] blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-lg text-center">
          {/*
            An outlined basket rather than a filled one: the illustration should
            read as "nothing in it", and a solid icon says the opposite.
          */}
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

          <h1 className="mt-7 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Your basket is empty
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-pretty text-muted-foreground">
            Nothing in it yet. Anything you add is kept here while you look around.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="/shop"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
                aria-hidden
              >
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
              Browse the shop
            </a>
            <a
              href="/"
              className="inline-flex h-11 items-center rounded-lg border border-border px-5 text-sm font-medium transition-colors hover:bg-accent/40"
            >
              Back home
            </a>
          </div>

          {/*
            Only shown to someone who might actually have an order to find.
            Telling a first-time visitor about "your previous orders" is noise.
          */}
          <p className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
            Bought something already? The link in your confirmation email opens that order —
            no account needed.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Head title="Basket" />
      <h1 className="text-2xl font-semibold tracking-tight">Basket</h1>

      {error ? (
        <p className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
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

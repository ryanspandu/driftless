import { useEffect, useMemo, useState } from 'react'
import {
  addToCart,
  availabilityLabel,
  shopKeys,
  useBinding,
  useBlockData,
  useLiveAvailability,
  type ShopProduct,
  type ShopVariant,
} from './shop-data'

/**
 * Commerce blocks for the page builder.
 *
 * All SSR-safe: no `window` or `document` at module scope, and every fetch is
 * inside an effect. Data comes from `BlockDataContext` when the server resolved
 * it, so an SSR page renders products in the initial HTML.
 */

export interface ProductSource {
  categorySlug?: string
  featured?: boolean
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'title'
}

const COLUMN_CLASS: Record<string, string> = {
  '2': 'sm:grid-cols-2',
  '3': 'sm:grid-cols-2 lg:grid-cols-3',
  '4': 'sm:grid-cols-2 lg:grid-cols-4',
}

function AvailabilityBadge({ variant, live }: { variant: ShopVariant; live?: string }) {
  const availability = (live ?? variant.availability) as ShopVariant['availability']
  const label = availabilityLabel(availability, variant.remaining)
  if (!label) return null

  return (
    <span
      className={
        availability === 'out_of_stock'
          ? 'text-xs font-medium text-red-600'
          : 'text-xs font-medium text-amber-600'
      }
    >
      {label}
    </span>
  )
}

/** One product tile. Links to its own page; the price comes from the server. */
export function ProductCard({
  product,
  liveAvailability,
}: {
  product: ShopProduct
  liveAvailability?: Record<string, string>
}) {
  const image = product.images[0]?.url ?? product.variants[0]?.imageUrl ?? null
  const first = product.variants[0]
  // The strikethrough must belong to the SAME variant as the displayed "from"
  // price (the cheapest), not variants[0] — otherwise a card can show "from £8"
  // struck through against a pricier variant's "£25". Only show it when it is a
  // genuine discount on that variant.
  const cheapest = product.variants.reduce<(typeof product.variants)[number] | undefined>(
    (min, v) => (!min || v.price.amount < min.price.amount ? v : min),
    undefined
  )
  const compareAt =
    cheapest?.compareAt && cheapest.compareAt.amount > cheapest.price.amount
      ? cheapest.compareAt
      : null

  return (
    // Must match the route in `modules/ecommerce/routes.ts`; a card linking to
    // `/shop/<slug>` would 404 on every product.
    <a href={`/shop/p/${product.slug}`} className="group block">
      <div className="aspect-square overflow-hidden rounded-lg bg-muted">
        {image ? (
          <img
            src={image}
            alt={product.images[0]?.alt ?? product.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : null}
      </div>

      <div className="mt-3 space-y-1">
        <p className="text-sm font-medium leading-snug">{product.title}</p>
        {product.subtitle ? (
          <p className="text-xs text-muted-foreground">{product.subtitle}</p>
        ) : null}

        <div className="flex items-baseline gap-2">
          {product.priceFrom ? (
            <span className="text-sm tabular-nums">{product.priceFrom.formatted}</span>
          ) : null}
          {compareAt ? (
            <span className="text-xs tabular-nums text-muted-foreground line-through">
              {compareAt.formatted}
            </span>
          ) : null}
        </div>

        {/*
          Stock means nothing for something sold elsewhere — the shop does not
          hold any. Say where it comes from instead.
        */}
        {product.cta?.mode === 'external' ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3"
              aria-hidden
            >
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
            {product.cta.label || 'From a partner'}
          </span>
        ) : first ? (
          <AvailabilityBadge variant={first} live={liveAvailability?.[first.id]} />
        ) : null}
      </div>
    </a>
  )
}

/** A grid of products, optionally filtered to a category or the featured set. */
export function ProductList({
  source,
  limit,
  columns,
  heading,
}: {
  source?: ProductSource
  limit?: number
  columns?: string
  heading?: string
}) {
  const resolved = useMemo(
    () => ({
      categorySlug: source?.categorySlug || null,
      limit: Math.min(Math.max(Number(limit) || 8, 1), 24),
      featured: Boolean(source?.featured),
      sort: source?.sort || null,
    }),
    [source?.categorySlug, source?.featured, source?.sort, limit]
  )

  const key = shopKeys.productList(resolved)

  const { data, loading } = useBlockData<ShopProduct[]>(key, async () => {
    const params = new URLSearchParams({ pageSize: String(resolved.limit) })
    if (resolved.categorySlug) params.set('category', resolved.categorySlug)
    if (resolved.featured) params.set('featured', '1')
    if (resolved.sort) params.set('sort', resolved.sort)

    const response = await fetch(`/api/shop/products?${params}`, {
      headers: { Accept: 'application/json' },
    })
    const body = (await response.json()) as { items?: ShopProduct[] }
    return body.items ?? []
  })

  const products = data ?? []

  /**
   * Refresh stock after mount. On an SSG page the server withheld it
   * deliberately, so this is what stops a cached snapshot advertising stock
   * that has since sold out.
   */
  const live = useLiveAvailability(
    products.flatMap((product) => product.variants.map((variant) => variant.id))
  )

  if (loading && products.length === 0) {
    return (
      <div className={`grid grid-cols-1 gap-6 ${COLUMN_CLASS[columns ?? '3']}`}>
        {Array.from({ length: resolved.limit > 4 ? 4 : resolved.limit }).map((_, i) => (
          <div key={i} className="animate-pulse space-y-3">
            <div className="aspect-square rounded-lg bg-muted" />
            <div className="h-3 w-2/3 rounded bg-muted" />
          </div>
        ))}
      </div>
    )
  }

  if (products.length === 0) {
    /**
     * Shown on the seeded shop front before anything is published, so it is the
     * first thing an operator sees. It says what to do next rather than just
     * reporting emptiness.
     */
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mx-auto size-8 text-muted-foreground"
          aria-hidden
        >
          <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" />
          <path d="M3.5 7.5 12 12m0 0 8.5-4.5M12 12v9" />
        </svg>
        <p className="mt-4 text-sm font-medium">Nothing to show yet</p>
        <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
          Products appear here once they are published.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {heading ? <h2 className="text-xl font-semibold tracking-tight">{heading}</h2> : null}
      <div className={`grid grid-cols-1 gap-6 ${COLUMN_CLASS[columns ?? '3']}`}>
        {products.map((product) => (
          <ProductCard key={product.id} product={product} liveAvailability={live} />
        ))}
      </div>
    </div>
  )
}

/**
 * One product, with variant selection and an add-to-basket button.
 *
 * The variant picker sends only an id and a quantity — never a price. There is
 * no field here a tampered request could use to influence what is charged.
 */
export function ProductDetail({ slug, editing }: { slug?: string; editing?: boolean }) {
  /**
   * The block's own slug wins; a blank one inherits the route's.
   *
   * Mirrors the server-side resolver exactly — both must agree, or an SSR page
   * would resolve one product and the client would fetch another.
   */
  const bound = useBinding('slug')
  const target = (slug ?? '').trim() || bound
  const key = target ? shopKeys.productDetail(target) : null

  const { data: product, loading } = useBlockData<ShopProduct | null>(key, async () => {
    const response = await fetch(`/api/shop/products/${encodeURIComponent(target)}`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    return (await response.json()) as ShopProduct
  })

  const [variantId, setVariantId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [status, setStatus] = useState<'idle' | 'adding' | 'added' | 'error'>('idle')

  const live = useLiveAvailability((product?.variants ?? []).map((variant) => variant.id))

  /**
   * Nothing to resolve: no slug on the block and no `:slug` in the URL. That is
   * the normal state of a product *template* in the builder, so say what will
   * happen rather than "no longer available" — which reads as a broken page and
   * is what the seeded product template showed on every open. On a public page
   * with no binding there is genuinely nothing to draw, so render nothing.
   */
  if (!target) {
    if (!editing) return null
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Bound to the product URL — each product renders here on <code>/shop/p/:slug</code>. Set a
        slug in the Element panel to pin this block to one product.
      </div>
    )
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!product) {
    return <p className="text-sm text-muted-foreground">This product is no longer available.</p>
  }

  const selected =
    product.variants.find((variant) => variant.id === variantId) ?? product.variants[0]
  const availability = (live[selected?.id ?? ''] ?? selected?.availability) as
    | ShopVariant['availability']
    | undefined
  const soldOut = availability === 'out_of_stock'

  /**
   * The two modes the shop sells in. `external` never reaches here — it renders
   * a link instead, and the server refuses the add anyway.
   */
  const external = product.cta?.mode === 'external'
  const buyNow = product.cta?.mode === 'buy_now'

  async function onAdd() {
    if (!selected || soldOut) return
    setStatus('adding')

    const count = await addToCart(selected.id, quantity)
    if (count === null) {
      setStatus('error')
      return
    }

    /**
     * "Buy now" is still an ordinary add followed by a redirect, not a second
     * checkout path. One route to an order means one place where stock,
     * discounts and idempotency are handled.
     */
    if (buyNow) {
      window.location.href = '/shop/checkout'
      return
    }

    setStatus('added')
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="aspect-square overflow-hidden rounded-xl bg-muted">
          {product.images[0] ? (
            <img
              src={product.images[0].url}
              alt={product.images[0].alt ?? product.title}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        {product.images.length > 1 ? (
          <div className="grid grid-cols-4 gap-2">
            {product.images.slice(1, 5).map((image) => (
              <div key={image.url} className="aspect-square overflow-hidden rounded-lg bg-muted">
                <img src={image.url} alt={image.alt ?? ''} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{product.title}</h1>
          {product.subtitle ? <p className="text-muted-foreground">{product.subtitle}</p> : null}
        </div>

        <div className="flex items-baseline gap-3">
          <span className="text-xl tabular-nums">{selected?.price.formatted}</span>
          {selected?.compareAt ? (
            <span className="tabular-nums text-muted-foreground line-through">
              {selected.compareAt.formatted}
            </span>
          ) : null}
        </div>

        {selected ? <AvailabilityBadge variant={selected} live={live[selected.id]} /> : null}

        {product.variants.length > 1 ? (
          <div className="space-y-2">
            <label htmlFor="variant" className="text-sm font-medium">
              Option
            </label>
            <select
              id="variant"
              value={selected?.id}
              onChange={(e) => setVariantId(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            >
              {product.variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.title}
                  {(live[variant.id] ?? variant.availability) === 'out_of_stock'
                    ? ' — sold out'
                    : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {external ? (
          /**
           * The shop does not sell this — the button leaves. No quantity, no
           * stock, no basket: none of them mean anything for something bought
           * somewhere else.
           *
           * `rel` carries **sponsored** as well as nofollow. An affiliate link
           * is a paid link, and Google asks for it to say so; leaving it off is
           * the kind of quiet omission that costs a site its rankings.
           */
          <a
            href={product.cta.url ?? '#'}
            target="_blank"
            rel="nofollow sponsored noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {product.cta.label || 'Buy from our partner'}
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
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
          </a>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={99}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, Math.min(99, Number(e.target.value) || 1)))
                }
                className="w-20 rounded-lg border border-border px-3 py-2 text-sm tabular-nums"
                aria-label="Quantity"
              />
              <button
                type="button"
                onClick={onAdd}
                disabled={soldOut || status === 'adding'}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                {soldOut
                  ? 'Sold out'
                  : status === 'adding'
                    ? buyNow
                      ? 'Taking you to checkout…'
                      : 'Adding…'
                    : status === 'added'
                      ? 'Added to basket'
                      : buyNow
                        ? 'Buy now'
                        : 'Add to basket'}
              </button>
            </div>

            {status === 'added' && !buyNow ? (
              <a href="/shop/cart" className="inline-block text-sm underline">
                View basket
              </a>
            ) : null}
            {status === 'error' ? (
              <p className="text-sm text-destructive">Could not add that to your basket.</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * A compact "N items" link for a header.
 *
 * Always client-fetched, never server-resolved: a basket is per-visitor, so
 * putting one in an SSR payload — let alone an SSG snapshot — would show one
 * shopper's count to everybody.
 */
export function CartWidget({ label }: { label?: string }) {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let alive = true

    fetch('/api/shop/cart', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((cart: { itemCount?: number } | null) => {
        if (alive && cart) setCount(cart.itemCount ?? 0)
      })
      .catch(() => {})

    return () => {
      alive = false
    }
  }, [])

  return (
    <a href="/shop/cart" className="inline-flex items-center gap-2 text-sm">
      {label ?? 'Basket'}
      {count && count > 0 ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground tabular-nums">
          {count}
        </span>
      ) : null}
    </a>
  )
}

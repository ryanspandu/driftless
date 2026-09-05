import { useContext, useEffect, useState } from 'react'
import { BlockDataContext, BlockBindingsContext, useBinding } from '~/puck/block-data'

// Re-exported so the commerce blocks keep one import for all of this plumbing.
export { BlockDataContext, BlockBindingsContext, useBinding }

/**
 * Shared plumbing for the commerce blocks.
 *
 * Two ideas run through this file:
 *
 * 1. **Server-resolved data arrives through context**, keyed exactly as the
 *    server keyed it. The block reads its key from the context; only when the
 *    key is absent does it fetch. That is what makes SSR pages render products
 *    in the initial HTML with no client round trip.
 *
 * 2. **Volatile fields are never trusted from a snapshot.** On an SSG page the
 *    server deliberately withholds price and stock, so the block renders its
 *    shell and hydrates availability from the live endpoint. A cached page
 *    promising "in stock" for something sold out an hour ago is worse than one
 *    that says nothing.
 */

export interface MoneyDto {
  amount: number
  currency: string
  formatted: string
}

export type Availability = 'in_stock' | 'low_stock' | 'out_of_stock'

export interface ShopVariant {
  id: string
  title: string
  optionValues: Record<string, string>
  price: MoneyDto
  compareAt: MoneyDto | null
  imageUrl: string | null
  availability: Availability
  remaining: number | null
}

export interface ShopProduct {
  id: string
  slug: string
  title: string
  subtitle: string | null
  description: Record<string, unknown>
  type: 'physical' | 'digital'
  priceFrom: MoneyDto | null
  images: { url: string; alt: string | null }[]
  variants: ShopVariant[]
  /** Option axes (e.g. `{ name: 'Color', values: [...] }`) — drives the card swatches. */
  options: { name: string; values: string[] }[]
  categorySlugs: string[]
  featured: boolean
  /**
   * What the buy button does. `external` means the shop does not sell this and
   * the button is a link to whoever does — an affiliate listing. `url` is only
   * ever present for that mode, and only ever `http(s)`.
   */
  cta: {
    mode: 'add_to_cart' | 'buy_now' | 'external'
    url: string | null
    label: string | null
  }
}

/** Must match `blockKeys` in the module's `block_resolvers.ts`. */
export const shopKeys = {
  productList: (opts: {
    categorySlug: string | null
    limit: number
    featured: boolean
    sort: string | null
  }) =>
    `products:${opts.categorySlug ?? '*'}:${opts.limit}:${opts.featured ? 'featured' : 'all'}:${opts.sort ?? 'default'}`,
  productDetail: (slug: string) => `product:${slug}`,
}

/**
 * Read a key from the server-resolved data, falling back to a fetch.
 *
 * The fetch only runs when the key is missing, so an SSR page does no client
 * work and a CSR or preview page does exactly one request.
 */
export function useBlockData<T>(
  key: string | null,
  fetcher: () => Promise<T>
): {
  data: T | null
  loading: boolean
} {
  const preloaded = useContext(BlockDataContext)
  const fromServer = key ? (preloaded[key] as T | undefined) : undefined

  const [data, setData] = useState<T | null>(fromServer ?? null)
  // When there IS a key but no server-resolved value (a volatile block withheld
  // from the SSG snapshot, or a CSR/preview page), the data will be fetched — so
  // start in `loading`. Otherwise the server render bakes a block's negative
  // empty state ("Nothing to show" / "no longer available") into the cached
  // snapshot for a page that actually has products. A neutral skeleton is what
  // belongs in the snapshot until the client fills it in.
  const [loading, setLoading] = useState(key != null && fromServer === undefined)

  useEffect(() => {
    if (!key || fromServer !== undefined) {
      if (fromServer !== undefined) setData(fromServer)
      return
    }

    let alive = true
    setLoading(true)

    fetcher()
      .then((result) => {
        if (alive) setData(result)
      })
      .catch(() => {
        // A block that cannot load its data renders empty rather than throwing
        // inside a render and taking the page with it.
        if (alive) setData(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
    // `fetcher` is recreated per render by design; the key is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fromServer])

  return { data, loading }
}

/**
 * Live availability for a set of variants.
 *
 * The one thing an SSG snapshot must never carry. Runs after mount, so a
 * statically served page shows accurate stock a moment after it paints rather
 * than a stale badge forever.
 */
export function useLiveAvailability(variantIds: string[]): Record<string, Availability> {
  const [live, setLive] = useState<Record<string, Availability>>({})
  const key = variantIds.slice().sort().join(',')

  useEffect(() => {
    if (!key) return
    let alive = true

    fetch('/api/shop/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ ids: key.split(',') }),
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => {
        if (alive) setLive(d as Record<string, Availability>)
      })
      .catch(() => {})

    return () => {
      alive = false
    }
  }, [key])

  return live
}

/** Add to the basket. Returns the updated item count, or null on failure. */
export async function addToCart(variantId: string, quantity = 1): Promise<number | null> {
  try {
    const response = await fetch('/api/shop/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ variantId, quantity }),
    })
    if (!response.ok) return null
    const cart = (await response.json()) as { itemCount?: number }
    return cart.itemCount ?? null
  } catch {
    return null
  }
}

/** Badge text for an availability bucket. Null when there is nothing to say. */
export function availabilityLabel(
  availability: Availability,
  remaining: number | null
): string | null {
  if (availability === 'out_of_stock') return 'Out of stock'
  if (availability === 'low_stock') {
    return remaining ? `Only ${remaining} left` : 'Low stock'
  }
  return null
}

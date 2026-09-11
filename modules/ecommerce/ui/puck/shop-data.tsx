import { useEffect, useState } from 'react'
import { BlockDataContext, BlockBindingsContext, useBinding, useBlockData } from '~/puck/block-data'

// Re-exported so the commerce blocks keep one import for all of this plumbing.
// `useBlockData` now lives in core (its contexts always did); re-exported here so
// the commerce blocks' existing imports keep working.
export { BlockDataContext, BlockBindingsContext, useBinding, useBlockData }

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
  /** Tag slugs the product carries (added with storefront tag archives). */
  tagSlugs: string[]
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
    tagSlug: string | null
    limit: number
    featured: boolean
    sort: string | null
  }) =>
    `products:${opts.categorySlug ?? '*'}:${opts.tagSlug ?? '*'}:${opts.limit}:${opts.featured ? 'featured' : 'all'}:${opts.sort ?? 'default'}`,
  productDetail: (slug: string) => `product:${slug}`,
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

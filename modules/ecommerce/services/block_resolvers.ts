import { registerBlockResolver, type BlockDataRef } from '#services/block_data_resolvers'
import StorefrontCatalogService, {
  type PublicProductDto,
} from '#modules/ecommerce/services/storefront_catalog_service'

const catalog = new StorefrontCatalogService()

/**
 * Data resolvers for the commerce Puck blocks.
 *
 * Registered from the module's `boot(app)` hook rather than listed in core:
 * `docs/ai/modules.md` is explicit that core must never import a module, so the
 * dependency has to point this way.
 *
 * Every resolver here is **volatile**. Prices and stock are exactly the data
 * that must not be baked into an SSG snapshot — a cached page promising "in
 * stock" for something sold out an hour ago is worse than one that says
 * nothing. On SSG pages these blocks render their shell from the snapshot and
 * fetch the live figures on the client.
 */

interface ProductListRef extends BlockDataRef {
  categorySlug: string | null
  limit: number
  featured: boolean
  sort: string | null
  currency: string | null
}

interface ProductDetailRef extends BlockDataRef {
  slug: string
  currency: string | null
}

/** Key format is shared with the client component — change both together. */
function productListKey(ref: {
  categorySlug: string | null
  limit: number
  featured: boolean
  sort: string | null
}): string {
  return `products:${ref.categorySlug ?? '*'}:${ref.limit}:${ref.featured ? 'featured' : 'all'}:${ref.sort ?? 'default'}`
}

function productDetailKey(slug: string): string {
  return `product:${slug}`
}

/**
 * The shopper's currency for this render.
 *
 * Read from the query string or the currency cookie, both forwarded by
 * `PageRenderer` without core interpreting them. Deliberately **not** part of
 * the cache key: one render has exactly one currency, so the key stays the same
 * string the client computes, and nothing currency-specific is ever snapshotted
 * because these resolvers are volatile.
 */
function currencyFrom(context: { query?: Record<string, string>; cookies?: Record<string, string> }) {
  const raw = context.query?.currency ?? context.cookies?.dl_currency ?? ''
  const code = String(raw).trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}

/** Exported so the block components compute the identical key. */
export const blockKeys = { productList: productListKey, productDetail: productDetailKey }

export function registerEcommerceBlockResolvers(): void {
  registerBlockResolver('ProductList', {
    volatile: true,

    collect(props, context) {
      const source = (props.source ?? {}) as {
        categorySlug?: string
        featured?: boolean
        sort?: string
      }

      const ref = {
        categorySlug: source.categorySlug || null,
        // Bounded: a block's props are authored in the builder, but a hand-edited
        // page document should not be able to ask for the whole catalogue.
        limit: Math.min(Math.max(Number(props.limit) || 8, 1), 24),
        featured: Boolean(source.featured),
        sort: source.sort || null,
      }

      return { ...ref, currency: currencyFrom(context), key: productListKey(ref) }
    },

    async resolve(refs) {
      const out: Record<string, PublicProductDto[]> = {}

      for (const ref of refs as ProductListRef[]) {
        const result = await catalog.list(
          {
            pageSize: ref.limit,
            categorySlug: ref.categorySlug ?? undefined,
            featured: ref.featured || undefined,
            sort: (ref.sort as 'newest' | 'price_asc' | 'price_desc' | 'title') ?? undefined,
          },
          ref.currency
        )
        out[ref.key] = result.items
      }

      return out
    },
  })

  registerBlockResolver('ProductDetail', {
    volatile: true,

    collect(props, context) {
      /**
       * The block's own slug wins; a blank one inherits the route's.
       *
       * That fallback is what makes one builder page serve every product: the
       * operator drops the block on a template, leaves the field empty, and
       * `/shop/p/:slug` binds it per request. A block with an explicit slug
       * still pins to that product wherever it appears.
       */
      const own = typeof props.slug === 'string' ? props.slug.trim() : ''
      const slug = own || (context.params?.slug ?? '').trim()

      if (!slug) return null
      return { slug, currency: currencyFrom(context), key: productDetailKey(slug) }
    },

    async resolve(refs) {
      const out: Record<string, PublicProductDto | null> = {}

      for (const ref of refs as ProductDetailRef[]) {
        try {
          out[ref.key] = await catalog.findBySlug(ref.slug, ref.currency)
        } catch {
          // A block pointing at a deleted product renders empty rather than
          // taking the page down.
          out[ref.key] = null
        }
      }

      return out
    },
  })
}

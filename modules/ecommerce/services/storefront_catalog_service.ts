import db from '@adonisjs/lucid/services/db'
import Product from '#modules/ecommerce/models/product'
import Category from '#modules/ecommerce/models/category'
import { Money, type MoneyDto } from '#modules/ecommerce/services/money'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import { publicError } from '#exceptions/public_error'

/**
 * The catalogue as a shopper sees it.
 *
 * These DTOs are **built from scratch**, never derived by filtering the admin
 * ones. Omission by construction beats remembering to strip: `costAmount`,
 * `stockOnHand`, `stockReserved` and internal notes cannot leak from a shape
 * that was never given them.
 *
 * Availability is deliberately coarse. Exact stock is competitive intelligence,
 * and "only 3 left" is all a shopper needs — so the wire carries a bucket, not
 * a number, above the low-stock threshold.
 */

/** Above this, availability is reported as `in_stock` with no count. */
const LOW_STOCK_THRESHOLD = 5

export type Availability = 'in_stock' | 'low_stock' | 'out_of_stock'

export interface PublicVariantDto {
  id: string
  title: string
  optionValues: Record<string, string>
  price: MoneyDto
  compareAt: MoneyDto | null
  imageUrl: string | null
  availability: Availability
  /** Only present when `availability` is `low_stock`. */
  remaining: number | null
}

export interface PublicProductDto {
  id: string
  slug: string
  title: string
  subtitle: string | null
  description: Record<string, unknown>
  type: 'physical' | 'digital'
  priceFrom: MoneyDto | null
  images: { url: string; alt: string | null }[]
  variants: PublicVariantDto[]
  categorySlugs: string[]
  featured: boolean
  /**
   * What the buy button should do. `url` is present only for `external`, and
   * only ever an `http(s)` address — validated when it was stored.
   */
  cta: {
    mode: 'add_to_cart' | 'buy_now' | 'external'
    url: string | null
    label: string | null
  }
  seo: Record<string, unknown>
}

export interface PublicCategoryDto {
  slug: string
  name: string
  description: string | null
  imageUrl: string | null
}

export interface StorefrontQuery {
  page?: number
  pageSize?: number
  search?: string
  categorySlug?: string
  featured?: boolean
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'title'
}

const settings = new StoreSettingsService()

export default class StorefrontCatalogService {
  async list(
    query: StorefrontQuery,
    currency?: string | null
  ): Promise<{
    items: PublicProductDto[]
    total: number
    page: number
    pageSize: number
  }> {
    const page = Math.max(query.page ?? 1, 1)
    // Hard ceiling: an unauthenticated endpoint must not be able to ask for
    // the entire catalogue in one request.
    const pageSize = Math.min(Math.max(query.pageSize ?? 12, 1), 48)

    const store = await settings.getOrCreate()

    /** Only active, non-deleted products are ever visible. */
    const builder = Product.query().where('status', 'active').whereNull('deleted_at')

    if (query.featured) builder.where('featured', true)

    if (query.search?.trim()) {
      const term = `%${query.search.trim().toLowerCase().slice(0, 100)}%`
      builder.where((q) => {
        q.whereRaw('LOWER(title) LIKE ?', [term]).orWhereRaw('LOWER(subtitle) LIKE ?', [term])
      })
    }

    if (query.categorySlug) {
      builder.whereExists((q) => {
        q.from('ecommerce_product_categories')
          .join(
            'ecommerce_categories',
            'ecommerce_categories.id',
            'ecommerce_product_categories.category_id'
          )
          .whereRaw('ecommerce_product_categories.product_id = ecommerce_products.id')
          .where('ecommerce_categories.slug', query.categorySlug!)
          .whereNull('ecommerce_categories.deleted_at')
      })
    }

    switch (query.sort) {
      case 'price_asc':
        builder.orderBy('price_from_amount', 'asc')
        break
      case 'price_desc':
        builder.orderBy('price_from_amount', 'desc')
        break
      case 'title':
        builder.orderBy('title', 'asc')
        break
      default:
        builder.orderBy('position', 'asc').orderBy('created_at', 'desc')
    }

    const result = await builder
      .preload('variants', (q) => q.whereNull('deleted_at').orderBy('position', 'asc'))
      .preload('images', (q) => q.orderBy('position', 'asc'))
      .preload('categories')
      .paginate(page, pageSize)

    return {
      items: await this.toDtos(result.all(), store.locale, currency),
      total: result.total,
      page,
      pageSize,
    }
  }

  /** One product by slug. 404s for anything not active. */
  async findBySlug(slug: string, currency?: string | null): Promise<PublicProductDto> {
    const store = await settings.getOrCreate()

    const product = await Product.query()
      .where('slug', slug)
      .where('status', 'active')
      .whereNull('deleted_at')
      .preload('variants', (q) => q.whereNull('deleted_at').orderBy('position', 'asc'))
      .preload('images', (q) => q.orderBy('position', 'asc'))
      .preload('categories')
      .first()

    if (!product) throw publicError.notFound('Product not found.', 'product_not_found')

    return (await this.toDtos([product], store.locale, currency))[0]
  }

  /**
   * Live availability for a set of variants.
   *
   * Exists so a statically rendered page can hydrate the one thing that must
   * never be cached — an SSG snapshot showing "in stock" for something sold out
   * an hour ago is worse than no badge at all.
   */
  async availability(variantIds: string[]): Promise<Record<string, Availability>> {
    if (variantIds.length === 0) return {}

    const { default: ProductVariant } = await import('#modules/ecommerce/models/product_variant')
    const variants = await ProductVariant.query()
      .whereIn('id', variantIds.slice(0, 100))
      .whereNull('deleted_at')

    const out: Record<string, Availability> = {}
    for (const variant of variants) {
      out[variant.id] = this.availabilityOf(variant.availableStock)
    }
    return out
  }

  private availabilityOf(available: number): Availability {
    if (!Number.isFinite(available)) return 'in_stock'
    if (available <= 0) return 'out_of_stock'
    if (available <= LOW_STOCK_THRESHOLD) return 'low_stock'
    return 'in_stock'
  }

  /**
   * Products in the shopper's currency.
   *
   * Batched because the listed prices are one query for the whole page rather
   * than one per product. A variant with no price in the requested currency is
   * **omitted from the response** — it is not sold here, and showing it with a
   * base-currency price would be advertising a number nobody can be charged.
   */
  private async toDtos(
    products: Product[],
    locale: string,
    requested?: string | null
  ): Promise<PublicProductDto[]> {
    const base = (await settings.getOrCreate()).currency.toUpperCase()
    const currency = (requested ?? base).toUpperCase()

    const listed = new Map<string, { price: number; compareAt: number | null }>()
    if (currency !== base) {
      const variantIds = products.flatMap((p) => (p.variants ?? []).map((v) => v.id))
      if (variantIds.length > 0) {
        const rows = await db
          .from('ecommerce_variant_prices')
          .whereIn('variant_id', variantIds)
          .where('currency', currency)
          .select('variant_id', 'price_amount', 'compare_at_amount')

        for (const row of rows) {
          listed.set(String(row.variant_id), {
            price: Number(row.price_amount),
            compareAt: row.compare_at_amount === null ? null : Number(row.compare_at_amount),
          })
        }
      }
    }

    return products
      .map((product) => this.toDto(product, locale, currency, base, listed))
      .filter((dto): dto is PublicProductDto => dto !== null)
  }

  /**
   * Returns null when the product has nothing sellable in this currency —
   * every variant unpriced. A listing that shows it would let a shopper reach a
   * product page they cannot buy from.
   */
  private toDto(
    product: Product,
    locale: string,
    currency: string,
    base: string,
    listed: Map<string, { price: number; compareAt: number | null }>
  ): PublicProductDto | null {
    const priceOf = (variantId: string, basePrice: number, baseCompareAt: number | null) => {
      if (currency === base) return { price: basePrice, compareAt: baseCompareAt }
      return listed.get(variantId) ?? null
    }

    const variants = (product.variants ?? [])
      .map((variant) => ({
        variant,
        priced: priceOf(variant.id, variant.priceAmount, variant.compareAtAmount),
      }))
      .filter((entry) => entry.priced !== null)

    if (variants.length === 0) return null

    /**
     * "From" is derived from what is actually sellable here, not from the
     * product's stored `price_from_amount` — that column is in the base
     * currency and would be a different number entirely.
     */
    const priceFromAmount = Math.min(...variants.map((entry) => entry.priced!.price))

    return {
      id: product.id,
      slug: product.slug,
      title: product.title,
      subtitle: product.subtitle,
      description: product.description,
      type: product.type,
      priceFrom: Money.toDto(priceFromAmount, currency, locale),
      images: (product.images ?? []).map((image) => ({ url: image.mediaUrl, alt: image.alt })),
      variants: variants.map(({ variant, priced }) => {
        const available = variant.availableStock
        const availability = this.availabilityOf(available)

        return {
          id: variant.id,
          title: variant.title,
          optionValues: variant.optionValues,
          price: Money.toDto(priced!.price, currency, locale),
          compareAt:
            priced!.compareAt === null ? null : Money.toDto(priced!.compareAt, currency, locale),
          imageUrl: variant.imageUrl,
          availability,
          // A count only when it is low enough to be useful urgency.
          remaining: availability === 'low_stock' ? available : null,
        }
      }),
      categorySlugs: (product.categories ?? []).map((category) => category.slug),
      featured: product.featured,
      cta: {
        // Defaulted for the same reason as the admin DTO — see `catalog_service`.
        mode: product.ctaMode ?? 'add_to_cart',
        // Null for anything the shop sells itself — there is no link to give.
        url: product.ctaMode === 'external' ? product.externalUrl : null,
        label: product.ctaMode === 'external' ? product.externalLabel : null,
      },
      seo: product.seo,
    }
  }

  async categories(): Promise<PublicCategoryDto[]> {
    const rows = await Category.query()
      .whereNull('deleted_at')
      .orderBy('position', 'asc')
      .orderBy('name', 'asc')

    return rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      description: row.description,
      imageUrl: row.imageUrl,
    }))
  }
}

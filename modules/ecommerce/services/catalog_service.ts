import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { newUlid } from '#services/ulid_service'
import { publicError } from '#exceptions/public_error'
import Product from '#modules/ecommerce/models/product'
import type { ProductCtaMode } from '#modules/ecommerce/models/product'
import type { ProductOption, ProductStatus, ProductType } from '#modules/ecommerce/models/product'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import ProductImage from '#modules/ecommerce/models/product_image'
import Category from '#modules/ecommerce/models/category'
import { Money, type MoneyDto } from '#modules/ecommerce/services/money'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'

/**
 * Catalogue reads and writes for the admin.
 *
 * Two rules run through this file:
 *
 *  - **Amounts are integers.** Every price is minor units, and every DTO ships
 *    the raw integer alongside a preformatted string so no client ever does
 *    money arithmetic.
 *  - **Admin DTOs and storefront DTOs are different shapes.** `costAmount` and
 *    raw stock counts are margin and inventory data; they belong in the admin
 *    payload and nowhere else. The storefront builds its own DTOs rather than
 *    filtering these — omission by construction, not by remembering to strip.
 */

export interface VariantDto {
  id: string
  productId: string
  title: string
  sku: string | null
  price: MoneyDto
  compareAt: MoneyDto | null
  /** Admin-only: cost of goods. */
  cost: MoneyDto | null
  weightGrams: number | null
  optionValues: Record<string, string>
  stockOnHand: number
  stockReserved: number
  available: number | null
  trackInventory: boolean
  allowBackorder: boolean
  imageUrl: string | null
  position: number
}

export interface ProductImageDto {
  id: string
  mediaUrl: string
  alt: string | null
  position: number
}

export interface ProductDto {
  id: string
  slug: string
  title: string
  subtitle: string | null
  description: Record<string, unknown>
  type: ProductType
  status: ProductStatus
  currency: string
  priceFrom: MoneyDto | null
  seo: Record<string, unknown>
  options: ProductOption[]
  featured: boolean
  ctaMode: ProductCtaMode
  externalUrl: string | null
  externalLabel: string | null
  position: number
  variants: VariantDto[]
  images: ProductImageDto[]
  categoryIds: string[]
  /** Total sellable units across variants; null when nothing is tracked. */
  totalStock: number | null
  createdAt: string
  updatedAt: string
}

export interface CategoryDto {
  id: string
  slug: string
  name: string
  description: string | null
  imageUrl: string | null
  parentId: string | null
  position: number
  productCount: number
}

export interface ProductListQuery {
  page?: number
  pageSize?: number
  search?: string
  status?: ProductStatus | 'all'
  type?: ProductType | 'all'
  categoryId?: string
}

export interface VariantInput {
  title: string
  sku?: string | null
  priceAmount: number
  compareAtAmount?: number | null
  costAmount?: number | null
  weightGrams?: number | null
  optionValues?: Record<string, string>
  stockOnHand?: number
  trackInventory?: boolean
  allowBackorder?: boolean
  imageUrl?: string | null
  position?: number
}

export interface ProductInput {
  title: string
  slug?: string
  subtitle?: string | null
  description?: Record<string, unknown>
  type?: ProductType
  status?: ProductStatus
  seo?: Record<string, unknown>
  options?: ProductOption[]
  featured?: boolean
  ctaMode?: ProductCtaMode
  externalUrl?: string | null
  externalLabel?: string | null
  position?: number
  categoryIds?: string[]
  images?: { mediaUrl: string; alt?: string | null }[]
}

/** URL-safe slug. Falls back to a ULID fragment so a title of only symbols still works. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180)
  return base || newUlid().toLowerCase().slice(0, 12)
}


/**
 * The buy-button settings, made consistent before they are stored.
 *
 * `external` demands a link, and the link must be `http(s)`: it is rendered as
 * something a buyer clicks, so a `javascript:` value would be stored XSS. Any
 * other mode clears the link rather than keeping it — a stale URL on a product
 * switched back to "add to cart" is a trap for whoever edits it next.
 */
function normaliseCta(input: {
  ctaMode?: ProductCtaMode | null
  externalUrl?: string | null
  externalLabel?: string | null
}): { ctaMode: ProductCtaMode; externalUrl: string | null; externalLabel: string | null } {
  const mode = input.ctaMode ?? 'add_to_cart'

  if (mode !== 'external') {
    return { ctaMode: mode, externalUrl: null, externalLabel: null }
  }

  const url = (input.externalUrl ?? '').trim()
  if (!url) {
    throw publicError.unprocessable(
      'A product that links elsewhere needs the address to link to.',
      'external_url_required'
    )
  }
  if (!/^https?:\/\//i.test(url)) {
    throw publicError.unprocessable(
      'That link must start with http:// or https://.',
      'invalid_external_url'
    )
  }

  return {
    ctaMode: 'external',
    externalUrl: url.slice(0, 500),
    externalLabel: (input.externalLabel ?? '').trim().slice(0, 80) || null,
  }
}

export default class CatalogService {
  private settings = new StoreSettingsService()

  // ── Products ─────────────────────────────────────────────────────────────

  async list(query: ProductListQuery): Promise<{
    items: ProductDto[]
    total: number
    page: number
    pageSize: number
  }> {
    const page = Math.max(query.page ?? 1, 1)
    const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100)

    const builder = Product.query().whereNull('deleted_at')

    if (query.status && query.status !== 'all') builder.where('status', query.status)
    if (query.type && query.type !== 'all') builder.where('type', query.type)

    if (query.search?.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`
      builder.where((q) => {
        q.whereRaw('LOWER(title) LIKE ?', [term]).orWhereRaw('LOWER(slug) LIKE ?', [term])
      })
    }

    if (query.categoryId) {
      builder.whereExists((q) => {
        q.from('ecommerce_product_categories')
          .whereRaw('ecommerce_product_categories.product_id = ecommerce_products.id')
          .where('category_id', query.categoryId!)
      })
    }

    const result = await builder
      .preload('variants', (q) => q.whereNull('deleted_at').orderBy('position', 'asc'))
      .preload('images', (q) => q.orderBy('position', 'asc'))
      .preload('categories')
      .orderBy('position', 'asc')
      .orderBy('created_at', 'desc')
      .paginate(page, pageSize)

    const currency = (await this.settings.getOrCreate()).currency
    return {
      items: result.all().map((row) => this.toDto(row, currency)),
      total: result.total,
      page,
      pageSize,
    }
  }

  async find(id: string): Promise<ProductDto> {
    const row = await Product.query()
      .where('id', id)
      .whereNull('deleted_at')
      .preload('variants', (q) => q.whereNull('deleted_at').orderBy('position', 'asc'))
      .preload('images', (q) => q.orderBy('position', 'asc'))
      .preload('categories')
      .first()

    if (!row) throw publicError.notFound('Product not found.', 'product_not_found')

    const currency = (await this.settings.getOrCreate()).currency
    return this.toDto(row, currency)
  }

  async create(input: ProductInput, authorId: number | null): Promise<ProductDto> {
    const settings = await this.settings.getOrCreate()
    const slug = await this.uniqueSlug(input.slug?.trim() || slugify(input.title))

    const product = await db.transaction(async (trx) => {
      const row = await Product.create(
        {
          id: newUlid(),
          slug,
          title: input.title.trim(),
          subtitle: input.subtitle ?? null,
          description: input.description ?? {},
          type: input.type ?? 'physical',
          status: input.status ?? 'draft',
          currency: settings.currency,
          seo: input.seo ?? {},
          options: input.options ?? [],
          featured: input.featured ?? false,
          ...normaliseCta(input),
          position: input.position ?? 0,
          createdByUserId: authorId,
          // No variants yet, so there is no price to advertise.
          priceFromAmount: null,
        },
        { client: trx }
      )

      await this.syncImages(row.id, input.images ?? [], trx)
      await this.syncCategories(row.id, input.categoryIds ?? [], trx)
      return row
    })

    return this.find(product.id)
  }

  async update(id: string, input: Partial<ProductInput>): Promise<ProductDto> {
    const row = await Product.query().where('id', id).whereNull('deleted_at').first()
    if (!row) throw publicError.notFound('Product not found.', 'product_not_found')

    await db.transaction(async (trx) => {
      row.useTransaction(trx)

      if (input.title !== undefined) row.title = input.title.trim()
      if (input.slug !== undefined && input.slug.trim() && input.slug.trim() !== row.slug) {
        row.slug = await this.uniqueSlug(input.slug.trim(), row.id)
      }
      if (input.subtitle !== undefined) row.subtitle = input.subtitle ?? null
      if (input.description !== undefined) row.description = input.description
      if (input.type !== undefined) row.type = input.type
      if (input.status !== undefined) row.status = input.status
      if (input.seo !== undefined) row.seo = input.seo
      if (input.options !== undefined) row.options = input.options
      if (input.featured !== undefined) row.featured = input.featured
      if (
        input.ctaMode !== undefined ||
        input.externalUrl !== undefined ||
        input.externalLabel !== undefined
      ) {
        /**
         * Applied together. The mode and the URL are one decision — setting
         * `external` without a link, or leaving a stale link on a product
         * switched back to `add_to_cart`, are both states nothing downstream
         * knows how to render.
         */
        Object.assign(
          row,
          normaliseCta({
            ctaMode: input.ctaMode ?? row.ctaMode,
            externalUrl: input.externalUrl ?? row.externalUrl,
            externalLabel: input.externalLabel ?? row.externalLabel,
          })
        )
      }
      if (input.position !== undefined) row.position = input.position

      await row.save()

      if (input.images !== undefined) await this.syncImages(row.id, input.images, trx)
      if (input.categoryIds !== undefined) await this.syncCategories(row.id, input.categoryIds, trx)
    })

    await this.refreshPriceFrom(row.id)
    return this.find(row.id)
  }

  /**
   * Soft delete.
   *
   * Never a hard delete: order line items reference variants with
   * `ON DELETE SET NULL`, so removing the row would quietly blank the link
   * between an order and what was actually sold.
   */
  async remove(id: string): Promise<void> {
    const row = await Product.query().where('id', id).whereNull('deleted_at').first()
    if (!row) throw publicError.notFound('Product not found.', 'product_not_found')

    await db.transaction(async (trx) => {
      row.useTransaction(trx)
      row.deletedAt = DateTime.now()
      row.status = 'archived'
      await row.save()

      await ProductVariant.query({ client: trx })
        .where('product_id', id)
        .whereNull('deleted_at')
        .update({ deleted_at: DateTime.now().toSQL() })
    })
  }

  // ── Variants ─────────────────────────────────────────────────────────────

  async createVariant(productId: string, input: VariantInput): Promise<VariantDto> {
    const product = await Product.query().where('id', productId).whereNull('deleted_at').first()
    if (!product) throw publicError.notFound('Product not found.', 'product_not_found')

    this.assertVariantInput(input)
    await this.assertSkuAvailable(input.sku ?? null)

    const variant = await ProductVariant.create({
      id: newUlid(),
      productId,
      title: input.title.trim(),
      sku: input.sku?.trim() || null,
      priceAmount: input.priceAmount,
      compareAtAmount: input.compareAtAmount ?? null,
      costAmount: input.costAmount ?? null,
      weightGrams: input.weightGrams ?? null,
      optionValues: input.optionValues ?? {},
      stockOnHand: input.stockOnHand ?? 0,
      stockReserved: 0,
      trackInventory: input.trackInventory ?? true,
      allowBackorder: input.allowBackorder ?? false,
      imageUrl: input.imageUrl ?? null,
      position: input.position ?? 0,
    })

    await this.refreshPriceFrom(productId)
    return this.variantToDto(variant, product.currency)
  }

  async updateVariant(variantId: string, input: Partial<VariantInput>): Promise<VariantDto> {
    const variant = await ProductVariant.query()
      .where('id', variantId)
      .whereNull('deleted_at')
      .first()
    if (!variant) throw publicError.notFound('Variant not found.', 'variant_not_found')

    if (input.priceAmount !== undefined || input.compareAtAmount !== undefined) {
      this.assertVariantInput({
        title: input.title ?? variant.title,
        priceAmount: input.priceAmount ?? variant.priceAmount,
        compareAtAmount: input.compareAtAmount ?? variant.compareAtAmount,
        costAmount: input.costAmount ?? variant.costAmount,
      })
    }

    if (input.sku !== undefined && (input.sku?.trim() || null) !== variant.sku) {
      await this.assertSkuAvailable(input.sku?.trim() || null, variantId)
    }

    if (input.title !== undefined) variant.title = input.title.trim()
    if (input.sku !== undefined) variant.sku = input.sku?.trim() || null
    if (input.priceAmount !== undefined) variant.priceAmount = input.priceAmount
    if (input.compareAtAmount !== undefined) variant.compareAtAmount = input.compareAtAmount ?? null
    if (input.costAmount !== undefined) variant.costAmount = input.costAmount ?? null
    if (input.weightGrams !== undefined) variant.weightGrams = input.weightGrams ?? null
    if (input.optionValues !== undefined) variant.optionValues = input.optionValues
    if (input.trackInventory !== undefined) variant.trackInventory = input.trackInventory
    if (input.allowBackorder !== undefined) variant.allowBackorder = input.allowBackorder
    if (input.imageUrl !== undefined) variant.imageUrl = input.imageUrl ?? null
    if (input.position !== undefined) variant.position = input.position

    /**
     * Stock is set to an absolute figure here, which is fine for an admin
     * correcting a count. Checkout never goes through this path — it adjusts
     * stock with conditional UPDATEs under a row lock, because a read-modify-
     * write on inventory is exactly how two buyers get the last item.
     */
    if (input.stockOnHand !== undefined) {
      if (!Number.isInteger(input.stockOnHand) || input.stockOnHand < 0) {
        throw publicError.unprocessable('Stock must be a whole number of units.', 'invalid_stock')
      }
      variant.stockOnHand = input.stockOnHand
    }

    await variant.save()
    await this.refreshPriceFrom(variant.productId)

    const product = await Product.findOrFail(variant.productId)
    return this.variantToDto(variant, product.currency)
  }

  async removeVariant(variantId: string): Promise<void> {
    const variant = await ProductVariant.query()
      .where('id', variantId)
      .whereNull('deleted_at')
      .first()
    if (!variant) throw publicError.notFound('Variant not found.', 'variant_not_found')

    const siblings = await ProductVariant.query()
      .where('product_id', variant.productId)
      .whereNull('deleted_at')
      .count('* as total')
      .first()

    const total = Number(
      (siblings as unknown as { $extras: { total: string } })?.$extras?.total ?? 0
    )
    if (total <= 1) {
      throw publicError.unprocessable(
        'A product needs at least one variant. Delete the product instead.',
        'last_variant'
      )
    }

    variant.deletedAt = DateTime.now()
    await variant.save()
    await this.refreshPriceFrom(variant.productId)
  }

  // ── Categories ───────────────────────────────────────────────────────────

  async listCategories(): Promise<CategoryDto[]> {
    const rows = await Category.query()
      .whereNull('deleted_at')
      .orderBy('position', 'asc')
      .orderBy('name', 'asc')

    const counts = await db
      .from('ecommerce_product_categories')
      .select('category_id')
      .count('* as total')
      .groupBy('category_id')

    const byId = new Map(
      counts.map((c: { category_id: string; total: string | number }) => [
        c.category_id,
        Number(c.total),
      ])
    )

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      imageUrl: row.imageUrl,
      parentId: row.parentId,
      position: row.position,
      productCount: byId.get(row.id) ?? 0,
    }))
  }

  async createCategory(input: {
    name: string
    slug?: string
    description?: string | null
    imageUrl?: string | null
    parentId?: string | null
    position?: number
  }): Promise<CategoryDto> {
    const slug = await this.uniqueCategorySlug(input.slug?.trim() || slugify(input.name))

    await Category.create({
      id: newUlid(),
      slug,
      name: input.name.trim(),
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      parentId: input.parentId ?? null,
      position: input.position ?? 0,
    })

    const all = await this.listCategories()
    return all.find((c) => c.slug === slug)!
  }

  async updateCategory(
    id: string,
    input: Partial<{
      name: string
      slug: string
      description: string | null
      imageUrl: string | null
      parentId: string | null
      position: number
    }>
  ): Promise<CategoryDto> {
    const row = await Category.query().where('id', id).whereNull('deleted_at').first()
    if (!row) throw publicError.notFound('Category not found.', 'category_not_found')

    if (input.parentId !== undefined && input.parentId === id) {
      throw publicError.unprocessable('A category cannot be its own parent.', 'invalid_parent')
    }

    if (input.name !== undefined) row.name = input.name.trim()
    if (input.slug !== undefined && input.slug.trim() && input.slug.trim() !== row.slug) {
      row.slug = await this.uniqueCategorySlug(input.slug.trim(), id)
    }
    if (input.description !== undefined) row.description = input.description
    if (input.imageUrl !== undefined) row.imageUrl = input.imageUrl
    if (input.parentId !== undefined) row.parentId = input.parentId
    if (input.position !== undefined) row.position = input.position

    await row.save()
    const all = await this.listCategories()
    return all.find((c) => c.id === id)!
  }

  async removeCategory(id: string): Promise<void> {
    const row = await Category.query().where('id', id).whereNull('deleted_at').first()
    if (!row) throw publicError.notFound('Category not found.', 'category_not_found')

    await db.transaction(async (trx) => {
      row.useTransaction(trx)
      row.deletedAt = DateTime.now()
      await row.save()
      // Detach products so listings do not filter on a category that is gone.
      await trx.from('ecommerce_product_categories').where('category_id', id).delete()
    })
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private assertVariantInput(input: {
    title: string
    priceAmount: number
    compareAtAmount?: number | null
    costAmount?: number | null
  }): void {
    if (!input.title.trim()) {
      throw publicError.unprocessable('Variant needs a title.', 'variant_title_required')
    }
    for (const [label, value] of [
      ['Price', input.priceAmount],
      ['Compare-at price', input.compareAtAmount],
      ['Cost', input.costAmount],
    ] as const) {
      if (value === null || value === undefined) continue
      if (!Number.isSafeInteger(value) || value < 0) {
        throw publicError.unprocessable(
          `${label} must be a whole number of minor units (cents), and cannot be negative.`,
          'invalid_amount'
        )
      }
    }
  }

  /**
   * SKUs are unique at the database level; this produces a readable error
   * instead of a constraint violation. The constraint is still what actually
   * enforces it — this check alone is a race.
   */
  private async assertSkuAvailable(sku: string | null, exceptVariantId?: string): Promise<void> {
    if (!sku) return
    const query = ProductVariant.query().where('sku', sku).whereNull('deleted_at')
    if (exceptVariantId) query.whereNot('id', exceptVariantId)
    const existing = await query.first()
    if (existing) {
      throw publicError.conflict(`SKU "${sku}" is already used by another variant.`, 'sku_taken')
    }
  }

  private async uniqueSlug(base: string, exceptId?: string): Promise<string> {
    let candidate = slugify(base)
    let suffix = 1
    // Bounded so a pathological case cannot spin forever.
    while (suffix < 100) {
      const query = Product.query().where('slug', candidate)
      if (exceptId) query.whereNot('id', exceptId)
      const taken = await query.first()
      if (!taken) return candidate
      candidate = `${slugify(base)}-${++suffix}`
    }
    return `${slugify(base)}-${newUlid().toLowerCase().slice(-6)}`
  }

  private async uniqueCategorySlug(base: string, exceptId?: string): Promise<string> {
    let candidate = slugify(base)
    let suffix = 1
    while (suffix < 100) {
      const query = Category.query().where('slug', candidate)
      if (exceptId) query.whereNot('id', exceptId)
      const taken = await query.first()
      if (!taken) return candidate
      candidate = `${slugify(base)}-${++suffix}`
    }
    return `${slugify(base)}-${newUlid().toLowerCase().slice(-6)}`
  }

  private async syncImages(
    productId: string,
    images: { mediaUrl: string; alt?: string | null }[],
    trx: TransactionClientContract
  ): Promise<void> {
    await ProductImage.query({ client: trx }).where('product_id', productId).delete()
    if (images.length === 0) return

    await ProductImage.createMany(
      images.slice(0, 20).map((img, index) => ({
        id: newUlid(),
        productId,
        mediaUrl: img.mediaUrl,
        alt: img.alt ?? null,
        position: index,
      })),
      { client: trx }
    )
  }

  private async syncCategories(
    productId: string,
    categoryIds: string[],
    trx: TransactionClientContract
  ): Promise<void> {
    await trx.from('ecommerce_product_categories').where('product_id', productId).delete()
    if (categoryIds.length === 0) return

    await trx.table('ecommerce_product_categories').multiInsert(
      [...new Set(categoryIds)].map((categoryId) => ({
        product_id: productId,
        category_id: categoryId,
      }))
    )
  }

  /** Keep the denormalised "from" price in step with the cheapest live variant. */
  private async refreshPriceFrom(productId: string): Promise<void> {
    const cheapest = await ProductVariant.query()
      .where('product_id', productId)
      .whereNull('deleted_at')
      .orderBy('price_amount', 'asc')
      .first()

    await Product.query()
      .where('id', productId)
      .update({ price_from_amount: cheapest?.priceAmount ?? null })
  }

  private variantToDto(variant: ProductVariant, currency: string): VariantDto {
    return {
      id: variant.id,
      productId: variant.productId,
      title: variant.title,
      sku: variant.sku,
      price: Money.toDto(variant.priceAmount, currency),
      compareAt:
        variant.compareAtAmount === null ? null : Money.toDto(variant.compareAtAmount, currency),
      cost: variant.costAmount === null ? null : Money.toDto(variant.costAmount, currency),
      weightGrams: variant.weightGrams,
      optionValues: variant.optionValues,
      stockOnHand: variant.stockOnHand,
      stockReserved: variant.stockReserved,
      // `Infinity` does not survive JSON, so untracked stock is `null`.
      available: Number.isFinite(variant.availableStock) ? variant.availableStock : null,
      trackInventory: variant.trackInventory,
      allowBackorder: variant.allowBackorder,
      imageUrl: variant.imageUrl,
      position: variant.position,
    }
  }

  private toDto(row: Product, currency: string): ProductDto {
    const variants = (row.variants ?? []).map((v) => this.variantToDto(v, row.currency || currency))
    const tracked = (row.variants ?? []).filter((v) => v.trackInventory && !v.allowBackorder)

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle,
      description: row.description,
      type: row.type,
      status: row.status,
      currency: row.currency,
      priceFrom:
        row.priceFromAmount === null ? null : Money.toDto(row.priceFromAmount, row.currency),
      seo: row.seo,
      options: row.options,
      featured: row.featured,
      /**
       * Defaulted, not read raw. Lucid does not read a column's DB default back
       * into a model it just created, so a freshly built row holds `undefined`
       * here until it is refetched — and a DTO must never emit that for a field
       * the client treats as required.
       */
      ctaMode: row.ctaMode ?? 'add_to_cart',
      externalUrl: row.externalUrl,
      externalLabel: row.externalLabel,
      position: row.position,
      variants,
      images: (row.images ?? []).map((img) => ({
        id: img.id,
        mediaUrl: img.mediaUrl,
        alt: img.alt,
        position: img.position,
      })),
      categoryIds: (row.categories ?? []).map((c) => c.id),
      totalStock: tracked.length
        ? tracked.reduce((sum, v) => sum + Math.max(v.stockOnHand - v.stockReserved, 0), 0)
        : null,
      createdAt: row.createdAt.toISO()!,
      updatedAt: row.updatedAt.toISO()!,
    }
  }
}

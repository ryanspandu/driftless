import Product from '#modules/ecommerce/models/product'
import type { ProductCtaMode, ProductStatus, ProductType } from '#modules/ecommerce/models/product'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import CatalogService, {
  slugify,
  type ProductInput,
  type VariantInput,
} from '#modules/ecommerce/services/catalog_service'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import { csvParse } from '#modules/ecommerce/services/csv'
import { fromMajor } from '#modules/ecommerce/services/money'

/**
 * Bulk product import from CSV — the read-side counterpart of
 * `export_service.ts`, and the only way to create or update many products at
 * once. Every row is pushed through `CatalogService`, so an import goes through
 * exactly the same validation and side effects as saving one product in the
 * admin form (slug collisions, CTA rules, price refresh, SKU uniqueness).
 *
 * Three things shape the design:
 *
 *  - **One row per variant, grouped by product.** A product's rows share a key
 *    (its `slug`, or its title when no slug is given). The first row of a group
 *    carries the product-level fields; every row carries one variant. A
 *    single-variant or affiliate product is simply one row.
 *  - **Upsert.** A product is matched by `slug` and a variant by `sku`; a match
 *    updates, otherwise it creates. Re-importing an export is therefore
 *    idempotent rather than duplicating.
 *  - **Best-effort.** A row that fails is recorded and skipped; the rest still
 *    import. The caller gets counts plus a per-row error list.
 */

export interface ImportResult {
  created: number
  updated: number
  skipped: number
  errors: { row: number; message: string }[]
}

/** An upper bound so a pathological upload can't tie up a request indefinitely. */
const MAX_ROWS = 5000

const PRODUCT_TYPES: ProductType[] = ['physical', 'digital']
const PRODUCT_STATUSES: ProductStatus[] = ['draft', 'active', 'archived']
const CTA_MODES: ProductCtaMode[] = ['add_to_cart', 'buy_now', 'external']

/** A single CSV data row with its 1-based line number and a header-keyed reader. */
interface Row {
  line: number
  get: (...names: string[]) => string
}

export default class ProductImportService {
  private catalog = new CatalogService()
  private settings = new StoreSettingsService()

  async import(text: string, authorId: number | null): Promise<ImportResult> {
    const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] }

    const table = csvParse(text)
    if (table.length < 2) return result // header only, or empty

    const header = table[0].map((h) => h.trim().toLowerCase())
    const indexOf = (name: string) => header.indexOf(name)

    const dataRows: Row[] = table.slice(1, 1 + MAX_ROWS).map((cells, i) => ({
      line: i + 2, // +1 for the header, +1 for 1-based
      get: (...names: string[]) => {
        for (const name of names) {
          const idx = indexOf(name)
          if (idx !== -1) {
            const cell = (cells[idx] ?? '').trim()
            if (cell) return cell
          }
        }
        return ''
      },
    }))

    const settings = await this.settings.getOrCreate()
    const currency = settings.currency

    // Categories are resolved once, cached, and auto-created on first sight.
    const categoryIdByKey = new Map<string, string>()
    for (const c of await this.catalog.listCategories()) {
      categoryIdByKey.set(c.slug, c.id)
      categoryIdByKey.set(c.name.trim().toLowerCase(), c.id)
    }
    const resolveCategory = async (nameOrSlug: string): Promise<string> => {
      const key = nameOrSlug.trim()
      const slug = slugify(key)
      const hit = categoryIdByKey.get(slug) ?? categoryIdByKey.get(key.toLowerCase())
      if (hit) return hit
      const created = await this.catalog.createCategory({ name: key })
      categoryIdByKey.set(created.slug, created.id)
      categoryIdByKey.set(created.name.trim().toLowerCase(), created.id)
      return created.id
    }

    // Group rows into products. Rows needn't be contiguous — the key groups them.
    const groups = new Map<string, Row[]>()
    const order: string[] = []
    for (const row of dataRows) {
      const title = row.get('title', 'product')
      const slug = row.get('slug')
      if (!title && !slug) {
        result.skipped++
        result.errors.push({ row: row.line, message: 'Row has neither a title nor a slug.' })
        continue
      }
      const key = slug ? `slug:${slug.toLowerCase()}` : `title:${title.toLowerCase()}`
      if (!groups.has(key)) {
        groups.set(key, [])
        order.push(key)
      }
      groups.get(key)!.push(row)
    }

    for (const key of order) {
      const rows = groups.get(key)!
      try {
        await this.importGroup(rows, authorId, currency, resolveCategory, result)
      } catch (error) {
        // A product-level failure sinks the whole group.
        result.skipped++
        result.errors.push({ row: rows[0].line, message: messageOf(error) })
      }
    }

    return result
  }

  /**
   * Upsert one product and its variants. Throws only for a product-level
   * failure (the caller records that against the group); a variant-level
   * failure is recorded per row here and does not stop the sibling variants.
   */
  private async importGroup(
    rows: Row[],
    authorId: number | null,
    currency: string,
    resolveCategory: (nameOrSlug: string) => Promise<string>,
    result: ImportResult
  ): Promise<void> {
    const head = rows[0]
    const slug = head.get('slug')

    const existing = slug
      ? await Product.query().where('slug', slug).whereNull('deleted_at').first()
      : null

    const type = enumValue(head.get('type'), PRODUCT_TYPES, 'type')
    const status = enumValue(head.get('status'), PRODUCT_STATUSES, 'status')
    const ctaMode = enumValue(head.get('cta_mode', 'ctamode'), CTA_MODES, 'ctaMode')

    const categoryNames = splitList(head.get('categories'))
    const categoryIds: string[] = []
    for (const name of categoryNames) categoryIds.push(await resolveCategory(name))

    const description = head.get('description')

    const productInput: ProductInput = {
      title: head.get('title', 'product'),
      slug: slug || undefined,
      subtitle: head.get('subtitle') || null,
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      featured: parseBool(head.get('featured')) ?? undefined,
      ...(ctaMode ? { ctaMode } : {}),
      externalUrl: head.get('external_url', 'externalurl') || null,
      externalLabel: head.get('external_label', 'externallabel') || null,
      categoryIds,
      ...(description ? { description: richTextDoc(description) } : {}),
    }

    let productId: string
    if (existing) {
      const updated = await this.catalog.update(existing.id, productInput)
      productId = updated.id
      result.updated++
    } else {
      if (!productInput.title) {
        throw new Error('A new product needs a title.')
      }
      const created = await this.catalog.create(productInput, authorId)
      productId = created.id
      result.created++
    }

    // Whether this product treats stock as unlimited by default. Affiliate/
    // external products point elsewhere to buy, so inventory is meaningless
    // unless a row says otherwise.
    const externalDefault = (ctaMode ?? existing?.ctaMode) === 'external'

    for (const row of rows) {
      try {
        await this.upsertVariant(productId, row, currency, externalDefault)
      } catch (error) {
        result.errors.push({ row: row.line, message: messageOf(error) })
      }
    }
  }

  private async upsertVariant(
    productId: string,
    row: Row,
    currency: string,
    externalDefault: boolean
  ): Promise<void> {
    const sku = row.get('sku') || null

    const priceAmount = parseMoney(
      row.get('price_minor'),
      row.get('price'),
      currency,
      'price',
      externalDefault ? 0 : undefined
    )
    const compareAtAmount = optionalMoney(
      row.get('compare_at_minor'),
      row.get('compare_at'),
      currency,
      'compare_at'
    )
    const costAmount = optionalMoney(row.get('cost_minor'), row.get('cost'), currency, 'cost')

    const trackInventory =
      parseBool(row.get('track_inventory', 'tracks_inventory')) ?? !externalDefault

    const input: VariantInput = {
      title: row.get('variant', 'variant_title') || 'Default',
      sku,
      priceAmount,
      compareAtAmount,
      costAmount,
      weightGrams: optionalInt(row.get('weight_grams'), 'weight_grams'),
      stockOnHand: optionalInt(row.get('stock_on_hand'), 'stock_on_hand') ?? 0,
      trackInventory,
      allowBackorder: parseBool(row.get('allow_backorder')) ?? false,
      imageUrl: row.get('image_url', 'imageurl') || null,
    }

    const existing = sku
      ? await ProductVariant.query()
          .where('product_id', productId)
          .where('sku', sku)
          .whereNull('deleted_at')
          .first()
      : null

    if (existing) {
      await this.catalog.updateVariant(existing.id, input)
    } else {
      await this.catalog.createVariant(productId, input)
    }
  }
}

// ── Cell parsers ────────────────────────────────────────────────────────────

/** A recognised enum value, or `undefined` when the cell is blank; throws on a
 *  value that is present but not one of the allowed options. */
function enumValue<T extends string>(raw: string, allowed: T[], field: string): T | undefined {
  if (!raw) return undefined
  const value = raw.toLowerCase() as T
  if (!allowed.includes(value)) {
    throw new Error(`${field} must be one of ${allowed.join(', ')} (got "${raw}").`)
  }
  return value
}

/** Truthy/falsey words to a boolean, or `undefined` when blank. */
function parseBool(raw: string): boolean | undefined {
  if (!raw) return undefined
  const v = raw.toLowerCase()
  if (['1', 'true', 'yes', 'y', 't'].includes(v)) return true
  if (['0', 'false', 'no', 'n', 'f'].includes(v)) return false
  return undefined
}

/** Comma-separated names/slugs into a trimmed, de-duplicated list. */
function splitList(raw: string): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(',')) {
    const value = part.trim()
    if (value && !seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase())
      out.push(value)
    }
  }
  return out
}

/**
 * A required price: prefer the explicit minor-unit column, else convert the
 * major-unit ("19.99") column. Falls back to `fallback` when both are blank;
 * throws if there is no value and no fallback.
 */
function parseMoney(
  minorRaw: string,
  majorRaw: string,
  currency: string,
  field: string,
  fallback?: number
): number {
  const value = optionalMoney(minorRaw, majorRaw, currency, field)
  if (value !== null) return value
  if (fallback !== undefined) return fallback
  throw new Error(`${field} is required.`)
}

/** An optional price column pair, or `null` when both are blank. */
function optionalMoney(
  minorRaw: string,
  majorRaw: string,
  currency: string,
  field: string
): number | null {
  if (minorRaw) {
    const n = Number(minorRaw)
    if (!Number.isInteger(n))
      throw new Error(`${field}_minor must be a whole number of minor units.`)
    return n
  }
  if (majorRaw) {
    try {
      return fromMajor(majorRaw, currency)
    } catch {
      throw new Error(`${field} is not a valid amount: "${majorRaw}".`)
    }
  }
  return null
}

/** An optional integer column, or `null` when blank. */
function optionalInt(raw: string, field: string): number | null {
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isInteger(n)) throw new Error(`${field} must be a whole number.`)
  return n
}

/** Wrap plain text as a minimal TipTap document, matching the product editor's
 *  `description` shape (a doc of paragraphs). */
function richTextDoc(text: string): Record<string, unknown> {
  const paragraphs = text.split(/\r?\n/).map((line) => ({
    type: 'paragraph',
    ...(line ? { content: [{ type: 'text', text: line }] } : {}),
  }))
  return { type: 'doc', content: paragraphs }
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

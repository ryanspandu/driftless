import Product from '#modules/ecommerce/models/product'
import ModulesService from '#services/modules_service'
import type { CmsRecordDto } from '#services/cms_service'
import {
  pageOf,
  registerBuiltinCollection,
  shapeBuiltinQuery,
  type BuiltinCollection,
  type BuiltinRecordQuery,
} from '#cms/builtin_collections'
import { PRODUCT_PATH_PREFIX } from '#modules/ecommerce/controllers/storefront/pages_controller'
import { Money } from '#modules/ecommerce/services/money'

/**
 * The catalogue as a bindable collection for the page builder.
 *
 * Registered from the module's `boot()` — which only runs when the module is
 * enabled — and gated again per call by `available`, so switching the store off
 * makes "Products" vanish from the pickers and its records 404, without a
 * restart. Core never imports this file.
 *
 * Only `active` products. The price is the base price in the store currency
 * (no per-shopper currency conversion: the record is shared across visitors and
 * may be baked into an SSR snapshot); a `ProductList` block remains the place
 * for live, currency-aware pricing.
 */

export const PRODUCTS_COLLECTION_KEY = 'products'

const modules = new ModulesService()

const COLUMNS: Record<string, string> = {
  title: 'title',
  subtitle: 'subtitle',
  slug: 'slug',
}

function toRecord(row: Product): CmsRecordDto {
  const image = row.images?.[0]
  const hasPrice = row.priceFromAmount !== null && row.priceFromAmount !== undefined
  return {
    id: row.id,
    status: 'PUBLISHED',
    authorId: row.createdByUserId === null ? null : String(row.createdByUserId),
    data: {
      title: row.title,
      subtitle: row.subtitle,
      slug: row.slug,
      url: `${PRODUCT_PATH_PREFIX}/${encodeURIComponent(row.slug)}`,
      price: hasPrice ? Money.format(row.priceFromAmount!, row.currency) : null,
      priceAmount: hasPrice ? Money.toMajor(row.priceFromAmount!, row.currency) : null,
      currency: row.currency,
      image: image?.mediaUrl ?? null,
      imageAlt: image?.alt ?? row.title,
      type: row.type,
      featured: row.featured,
    },
    createdAt: row.createdAt.toISO()!,
    updatedAt: row.updatedAt.toISO()!,
  }
}

function base() {
  return Product.query()
    .where('status', 'active')
    .whereNull('deleted_at')
    .preload('images', (q) => q.orderBy('position', 'asc'))
}

export const productsCollection: BuiltinCollection = {
  key: PRODUCTS_COLLECTION_KEY,
  label: 'Products',
  icon: 'Package',
  group: 'E-commerce',
  fields: [
    { key: 'title', label: 'Title', type: 'TEXT' },
    { key: 'subtitle', label: 'Subtitle', type: 'TEXT' },
    { key: 'price', label: 'Price', type: 'TEXT' },
    { key: 'image', label: 'Image', type: 'MEDIA' },
    { key: 'imageAlt', label: 'Image alt', type: 'TEXT' },
    { key: 'url', label: 'Product URL', type: 'TEXT' },
    { key: 'slug', label: 'Slug', type: 'SLUG' },
    { key: 'priceAmount', label: 'Price (number)', type: 'DECIMAL' },
    { key: 'currency', label: 'Currency', type: 'TEXT' },
    { key: 'type', label: 'Type', type: 'TEXT' },
    { key: 'featured', label: 'Featured', type: 'BOOL' },
  ],

  available: () => modules.isEnabled('ecommerce'),

  async list(query: BuiltinRecordQuery) {
    const q = base()
    const { page, pageSize, offset } = shapeBuiltinQuery(q, query, {
      columns: COLUMNS,
      searchColumns: ['title', 'subtitle'],
      // Mirrors the storefront's default ordering.
      defaultSort: { column: 'position', dir: 'asc' },
    })
    const countRow = await Product.query()
      .where('status', 'active')
      .whereNull('deleted_at')
      .count('* as total')
    const total = Number((countRow[0] as any)?.$extras?.total ?? 0)
    const rows = await q.limit(pageSize).offset(offset)
    return pageOf(rows.map(toRecord), total, page, pageSize)
  },

  async find(id: string) {
    const row = await base().where('id', id).first()
    return row ? toRecord(row) : null
  },
}

export function registerProductsCollection(): void {
  registerBuiltinCollection(productsCollection)
}

import db from '@adonisjs/lucid/services/db'
import type { LucidModel, LucidRow } from '@adonisjs/lucid/types/model'
import {
  emptyReport,
  registerDataSection,
  type ConflictMode,
  type DataSection,
  type ImportCtx,
  type SectionReport,
} from '#services/data_transfer/registry'
import EcommerceSetting from '#modules/ecommerce/models/setting'
import StoreCurrency from '#modules/ecommerce/models/store_currency'
import Category from '#modules/ecommerce/models/category'
import Product from '#modules/ecommerce/models/product'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import VariantPrice from '#modules/ecommerce/models/variant_price'
import ProductImage from '#modules/ecommerce/models/product_image'
import ShippingZone from '#modules/ecommerce/models/shipping_zone'
import ShippingMethod from '#modules/ecommerce/models/shipping_method'
import ShippingRate from '#modules/ecommerce/models/shipping_rate'
import Discount from '#modules/ecommerce/models/discount'

/**
 * The ecommerce module's OWN export/import section. Registered into the core
 * registry from the module's `boot()` hook — core never imports this file, and
 * the engine re-checks `enabledMap()` at run time, so a disabled store's section
 * is skipped (not run) on import.
 *
 * Scope: the operator-authored CATALOG + store SETTINGS (products, variants,
 * prices, categories, images, shipping, discounts, currencies, store config).
 * Product images reference media by URL, which the core media section preserves.
 * EXCLUDED here: gateway credentials + all transactional/PII/replay tables
 * (orders, customers, carts, payments, webhook/idempotency rows) and digital
 * assets (their protected files need separate bundling).
 *
 * Writes are id-preserving row upserts (CatalogService mints new ids and can't
 * round-trip them). Import order is currency-sensitive: settings (base currency)
 * → currencies → categories (parents before children) → products → variants →
 * prices → images → pivots → shipping → discounts.
 */

type Row = Record<string, unknown>

const DROP = new Set(['createdAt', 'updatedAt', 'deletedAt', 'createdByUserId'])

function dumpRows(rows: LucidRow[], extraDrop: string[] = []): Row[] {
  const drop = new Set([...DROP, ...extraDrop])
  return rows.map((r) => {
    const attrs = (r as unknown as { $attributes: Row }).$attributes
    const out: Row = {}
    for (const [k, v] of Object.entries(attrs)) if (!drop.has(k)) out[k] = v
    return out
  })
}

async function restoreRows(
  Model: LucidModel,
  rows: Row[],
  report: SectionReport,
  conflict: ConflictMode
): Promise<void> {
  for (const row of rows) {
    const id = row.id as string | undefined
    const existing = id ? await Model.query().where('id', id).first() : null
    if (existing && conflict === 'skip') {
      report.skipped++
      continue
    }
    if (existing) {
      existing.merge(row as never)
      await existing.save()
      report.updated++
    } else {
      await Model.create(row as never)
      report.created++
    }
  }
}

const PIVOT = 'ecommerce_product_categories'

export const ecommerceSection: DataSection = {
  name: 'ecommerce',
  owner: 'ecommerce',
  order: 100,
  label: 'E-commerce catalog + settings',
  tables: [
    'ecommerce_settings',
    'ecommerce_currencies',
    'ecommerce_categories',
    'ecommerce_products',
    'ecommerce_product_variants',
    'ecommerce_variant_prices',
    'ecommerce_product_images',
    PIVOT,
    'ecommerce_shipping_zones',
    'ecommerce_shipping_methods',
    'ecommerce_shipping_rates',
    'ecommerce_discounts',
  ],

  async export() {
    return {
      settings: dumpRows(await EcommerceSetting.query()),
      currencies: dumpRows(await StoreCurrency.query()),
      categories: dumpRows(await Category.query().whereNull('deleted_at')),
      products: dumpRows(await Product.query().whereNull('deleted_at')),
      variants: dumpRows(await ProductVariant.query().whereNull('deleted_at')),
      variantPrices: dumpRows(await VariantPrice.query()),
      productImages: dumpRows(await ProductImage.query()),
      productCategories: await db.from(PIVOT).select('*'),
      shippingZones: dumpRows(await ShippingZone.query().whereNull('deleted_at')),
      shippingMethods: dumpRows(await ShippingMethod.query().whereNull('deleted_at')),
      shippingRates: dumpRows(await ShippingRate.query()),
      discounts: dumpRows(await Discount.query().whereNull('deleted_at')),
    }
  },

  async import(ctx: ImportCtx, data) {
    const report = emptyReport('ecommerce')
    const p = (data ?? {}) as Record<string, Row[] | undefined>
    const conflict = ctx.conflict

    // Warn on a base-currency mismatch: prices are bare minor units with no
    // currency, so importing a catalog under a different base silently reprices.
    const incomingCurrency = (p.settings?.[0]?.currency as string) ?? null
    const existingSetting = await EcommerceSetting.query().first()
    if (
      incomingCurrency &&
      existingSetting &&
      existingSetting.currency &&
      existingSetting.currency !== incomingCurrency
    ) {
      report.warnings.push(
        `base currency mismatch: store is ${existingSetting.currency}, archive is ${incomingCurrency} — prices are not converted`
      )
    }

    await restoreRows(EcommerceSetting, p.settings ?? [], report, conflict)
    await restoreRows(StoreCurrency, p.currencies ?? [], report, conflict)

    // Categories self-reference by parentId → two-pass (create without a parent,
    // then set it once every category exists).
    const cats = p.categories ?? []
    await restoreRows(
      Category,
      cats.map((c) => ({ ...c, parentId: null })),
      report,
      conflict
    )
    for (const c of cats) {
      if (!c.parentId) continue
      const row = await Category.query()
        .where('id', c.id as string)
        .first()
      if (row) {
        row.merge({ parentId: c.parentId } as never)
        await row.save()
      }
    }

    await restoreRows(Product, p.products ?? [], report, conflict)
    await restoreRows(ProductVariant, p.variants ?? [], report, conflict)
    await restoreRows(VariantPrice, p.variantPrices ?? [], report, conflict)
    await restoreRows(ProductImage, p.productImages ?? [], report, conflict)

    for (const pc of p.productCategories ?? []) {
      const productId = pc.product_id
      const categoryId = pc.category_id
      if (!productId || !categoryId) continue
      const exists = await db
        .from(PIVOT)
        .where('product_id', productId as string)
        .where('category_id', categoryId as string)
        .first()
      if (!exists) {
        await db.table(PIVOT).insert(pc)
        report.created++
      }
    }

    await restoreRows(ShippingZone, p.shippingZones ?? [], report, conflict)
    await restoreRows(ShippingMethod, p.shippingMethods ?? [], report, conflict)
    await restoreRows(ShippingRate, p.shippingRates ?? [], report, conflict)
    await restoreRows(Discount, p.discounts ?? [], report, conflict)

    return report
  },
}

/** Called from the ecommerce module's `boot()` hook. */
export function registerEcommerceDataSection(): void {
  registerDataSection(ecommerceSection)
}

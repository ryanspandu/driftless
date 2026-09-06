import db from '@adonisjs/lucid/services/db'
import type { LucidModel, LucidRow } from '@adonisjs/lucid/types/model'
import { newUlid } from '#services/ulid_service'
import { rewriteRefs } from '#services/data_transfer/rewrite_refs'
import {
  emptyReport,
  registerDataSection,
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
  ctx: ImportCtx
): Promise<void> {
  const regen = ctx.mode === 'regenerate'
  for (const row of rows) {
    const oldId = row.id as string | undefined
    if (regen) {
      // Fresh id, and rewrite every FK field (targets were remapped earlier by
      // the dependency order) through the id map.
      const newId = newUlid()
      if (oldId) ctx.idMap.set(oldId, newId)
      const rewritten = rewriteRefs(row, ctx.idMap)
      rewritten.id = newId
      await Model.create(rewritten as never)
      report.created++
      continue
    }
    const existing = oldId ? await Model.query().where('id', oldId).first() : null
    if (existing && ctx.conflict === 'skip') {
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
    const regen = ctx.mode === 'regenerate'
    const mapId = (v: unknown) => (regen ? (ctx.idMap.get(v as string) ?? v) : v)

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

    await restoreRows(EcommerceSetting, p.settings ?? [], report, ctx)
    await restoreRows(StoreCurrency, p.currencies ?? [], report, ctx)

    // Categories self-reference by parentId → two-pass (create without a parent,
    // then set it once every category exists). restoreRows records old→new ids
    // in regenerate mode, so the second pass looks up by the new id.
    const cats = p.categories ?? []
    await restoreRows(
      Category,
      cats.map((c) => ({ ...c, parentId: null })),
      report,
      ctx
    )
    for (const c of cats) {
      if (!c.parentId) continue
      const rowId = mapId(c.id) as string
      const row = await Category.query().where('id', rowId).first()
      if (row) {
        row.merge({ parentId: mapId(c.parentId) } as never)
        await row.save()
      }
    }

    await restoreRows(Product, p.products ?? [], report, ctx)
    await restoreRows(ProductVariant, p.variants ?? [], report, ctx)
    await restoreRows(VariantPrice, p.variantPrices ?? [], report, ctx)
    await restoreRows(ProductImage, p.productImages ?? [], report, ctx)

    for (const pc of p.productCategories ?? []) {
      const productId = mapId(pc.product_id)
      const categoryId = mapId(pc.category_id)
      if (!productId || !categoryId) continue
      const exists = await db
        .from(PIVOT)
        .where('product_id', productId as string)
        .where('category_id', categoryId as string)
        .first()
      if (!exists) {
        await db.table(PIVOT).insert({ ...pc, product_id: productId, category_id: categoryId })
        report.created++
      }
    }

    await restoreRows(ShippingZone, p.shippingZones ?? [], report, ctx)
    await restoreRows(ShippingMethod, p.shippingMethods ?? [], report, ctx)
    await restoreRows(ShippingRate, p.shippingRates ?? [], report, ctx)
    await restoreRows(Discount, p.discounts ?? [], report, ctx)

    return report
  },
}

/** Called from the ecommerce module's `boot()` hook. */
export function registerEcommerceDataSection(): void {
  registerDataSection(ecommerceSection)
}

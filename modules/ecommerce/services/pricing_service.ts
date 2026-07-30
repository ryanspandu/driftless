import db from '@adonisjs/lucid/services/db'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import Product from '#modules/ecommerce/models/product'
import { Money } from '#modules/ecommerce/services/money'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import { publicError } from '#exceptions/public_error'

/**
 * Turns "these variants, these quantities" into a set of amounts.
 *
 * **This is the only place order amounts come from.** Nothing here reads a
 * price from a request; every figure is looked up from the database at the
 * moment of calculation. A client can influence *what* is bought and *how many*
 * — never what it costs.
 */

export interface PriceRequestLine {
  variantId: string
  quantity: number
}

export interface PricedLine {
  variantId: string
  productId: string
  title: string
  variantTitle: string
  sku: string | null
  imageUrl: string | null
  productType: 'physical' | 'digital'
  quantity: number
  unitAmount: number
  subtotalAmount: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
}

export interface PricedOrder {
  currency: string
  lines: PricedLine[]
  subtotalAmount: number
  discountAmount: number
  shippingAmount: number
  taxAmount: number
  totalAmount: number
  /** True when every line is digital, so no address or shipping is needed. */
  digitalOnly: boolean
}

export interface PriceOptions {
  /**
   * Price in this currency instead of the store's base.
   *
   * A **code**, never an amount — same rule as everywhere else. The server
   * looks up what the variant is listed at in that currency; a client cannot
   * assert a price by asking for a currency.
   */
  currency?: string | null
  /** Order-level discount in minor units, already validated by the caller. */
  discountAmount?: number
  shippingAmount?: number
  /** Skip tax — used when the destination is outside the taxed jurisdiction. */
  taxExempt?: boolean
}

const settings = new StoreSettingsService()

/**
 * The picture that represents a line in a basket, an order or a receipt.
 *
 * The variant's own image wins where there is one — that is the point of having
 * it, so a red shirt does not show the blue photograph. Almost no product has
 * one, though: images are uploaded against the *product*, and `image_url` on a
 * variant stays null unless someone deliberately sets it per variant.
 *
 * Without this fallback every line item in the system was pictureless — carts,
 * order pages, the admin's order detail and the buyer's receipt alike — while
 * the product page beside them showed the photograph perfectly, because that
 * page reads `product.images` directly.
 */
function imageFor(variant: ProductVariant, product: Product): string | null {
  if (variant.imageUrl) return variant.imageUrl
  return product.images?.[0]?.mediaUrl ?? null
}

export default class PricingService {
  /**
   * Price a basket.
   *
   * Throws rather than silently skipping when a variant has gone away or its
   * product is no longer active: quietly dropping a line would charge the buyer
   * for a basket they did not agree to.
   */
  async price(lines: PriceRequestLine[], options: PriceOptions = {}): Promise<PricedOrder> {
    if (lines.length === 0) {
      throw publicError.unprocessable('Your basket is empty.', 'empty_basket')
    }

    const store = await settings.getOrCreate()
    const base = store.currency.toUpperCase()
    const currency = (options.currency ?? base).toUpperCase()

    const variantIds = lines.map((l) => l.variantId)
    const variants = await ProductVariant.query()
      .whereIn('id', variantIds)
      .whereNull('deleted_at')
      /**
       * The product's images come along because a line's picture falls back to
       * them — see `imageFor`. Preloaded here rather than fetched per line so a
       * large basket stays one query.
       */
      .preload('product', (q) => q.preload('images', (i) => i.orderBy('position', 'asc')))

    const byId = new Map(variants.map((v) => [v.id, v]))

    /**
     * Listed prices for a non-base currency.
     *
     * Loaded up front rather than per line so a large basket is one query, and
     * deliberately **not** joined with a fallback: a missing row has to be
     * visible to the loop below so it can refuse, rather than quietly resolving
     * to the base amount. See `unitPriceFor`.
     */
    const listed = new Map<string, number>()
    if (currency !== base) {
      const rows = await db
        .from('ecommerce_variant_prices')
        .whereIn('variant_id', variantIds)
        .where('currency', currency)
        .select('variant_id', 'price_amount')

      for (const row of rows) {
        listed.set(String(row.variant_id), Number(row.price_amount))
      }
    }

    const priced: PricedLine[] = []
    for (const line of lines) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
        throw publicError.unprocessable(
          'Quantity must be a whole number of at least 1.',
          'invalid_quantity'
        )
      }

      const variant = byId.get(line.variantId)
      if (!variant) {
        throw publicError.unprocessable(
          'One of the items in your basket is no longer available.',
          'variant_unavailable'
        )
      }

      const product = variant.product as Product | undefined
      if (!product || product.status !== 'active' || product.deletedAt !== null) {
        throw publicError.unprocessable(
          `${product?.title ?? 'An item'} is no longer for sale.`,
          'product_unavailable'
        )
      }

      /**
       * Checked here as well as in the cart, on purpose.
       *
       * This is the last gate before an amount is produced, and it is reached
       * by paths the cart never touches — manual orders, a re-price of a basket
       * whose product was switched to external after it was added. One guard
       * would have to be the right one; two cannot both be bypassed.
       */
      if (product.isExternal) {
        throw publicError.unprocessable(
          `${product.title} is sold elsewhere and cannot be ordered here.`,
          'product_is_external'
        )
      }

      /**
       * The unit price in the requested currency.
       *
       * There is **no conversion and no fallback**. A variant with no listed
       * price in this currency is not sellable in it, and saying so is the
       * whole safety property: `Money` stores minor units, so falling back to
       * the base amount would read a `1000` meaning $10.00 as ¥1000 — a silent
       * mispricing of roughly 30%, applied invisibly, in the one part of the
       * system where being wrong costs real money.
       */
      const unitAmount = currency === base ? variant.priceAmount : listed.get(variant.id)

      if (unitAmount === undefined) {
        throw publicError.unprocessable(
          `${product.title} is not sold in ${currency}.`,
          'not_priced_in_currency'
        )
      }

      const subtotal = Money.multiply(unitAmount, line.quantity)

      priced.push({
        variantId: variant.id,
        productId: product.id,
        title: product.title,
        variantTitle: variant.title,
        sku: variant.sku,
        imageUrl: imageFor(variant, product),
        productType: product.type,
        quantity: line.quantity,
        unitAmount,
        subtotalAmount: subtotal,
        // Allocated below, once the order-level totals are known.
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: subtotal,
      })
    }

    const subtotalAmount = Money.sum(...priced.map((l) => l.subtotalAmount))

    /**
     * Clamp the discount to the subtotal. A discount larger than the basket
     * would otherwise produce a negative total, which the gateways reject and
     * which would be a refund dressed up as a sale.
     */
    const discountAmount = Math.min(Math.max(options.discountAmount ?? 0, 0), subtotalAmount)

    /**
     * Spread the order-level discount across lines proportionally to their
     * value, using largest-remainder allocation so the parts always sum back to
     * the whole. Rounding each line independently would leave the line
     * discounts disagreeing with the order discount by a cent or two — which
     * shows up as an unbalanced invoice.
     */
    if (discountAmount > 0) {
      const shares = Money.allocate(
        discountAmount,
        priced.map((l) => l.subtotalAmount)
      )
      priced.forEach((line, index) => {
        line.discountAmount = shares[index]!
      })
    }

    const shippingAmount = Math.max(options.shippingAmount ?? 0, 0)
    const digitalOnly = priced.every((l) => l.productType === 'digital')

    /**
     * Tax is computed per line on the discounted amount, then summed — not
     * computed once on the order total. The two differ by rounding, and per-line
     * is what a tax authority expects to see itemised on an invoice.
     */
    let taxAmount = 0
    if (!options.taxExempt && store.taxRatePercent > 0 && !store.taxInclusive) {
      for (const line of priced) {
        const taxable = Money.atLeastZero(line.subtotalAmount - line.discountAmount)
        line.taxAmount = Money.applyPercent(taxable, store.taxRatePercent)
        taxAmount += line.taxAmount
      }
      // Shipping is taxed at the same rate where shipping is taxable at all.
      if (shippingAmount > 0) {
        taxAmount += Money.applyPercent(shippingAmount, store.taxRatePercent)
      }
    } else if (store.taxInclusive && store.taxRatePercent > 0) {
      /**
       * Tax-inclusive pricing: the listed price already contains tax, so it is
       * backed out for display rather than added. `price × rate/(100+rate)`.
       */
      for (const line of priced) {
        const taxable = Money.atLeastZero(line.subtotalAmount - line.discountAmount)
        const fraction = store.taxRatePercent / (100 + store.taxRatePercent)
        line.taxAmount = Money.applyPercent(taxable, fraction * 100)
        taxAmount += line.taxAmount
      }
    }

    for (const line of priced) {
      line.totalAmount = Money.atLeastZero(
        line.subtotalAmount - line.discountAmount + (store.taxInclusive ? 0 : line.taxAmount)
      )
    }

    const totalAmount = Money.atLeastZero(
      store.taxInclusive
        ? subtotalAmount - discountAmount + shippingAmount
        : subtotalAmount - discountAmount + shippingAmount + taxAmount
    )

    return {
      currency,
      lines: priced,
      subtotalAmount,
      discountAmount,
      shippingAmount,
      taxAmount,
      totalAmount,
      digitalOnly,
    }
  }
}

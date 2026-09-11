import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { newUlid } from '#services/ulid_service'
import { publicError } from '#exceptions/public_error'
import Order from '#modules/ecommerce/models/order'
import type { AddressSnapshot } from '#modules/ecommerce/models/order'
import OrderItem from '#modules/ecommerce/models/order_item'
import Payment from '#modules/ecommerce/models/payment'
import PricingService from '#modules/ecommerce/services/pricing_service'
import InventoryService from '#modules/ecommerce/services/inventory_service'
import OrderService, { type OrderActor } from '#modules/ecommerce/services/order_service'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import { mintOrderToken } from '#modules/ecommerce/services/order_access_token'

const pricing = new PricingService()
const inventory = new InventoryService()
const orders = new OrderService()
const settings = new StoreSettingsService()

export interface ManualOrderInput {
  lines: { variantId: string; quantity: number }[]
  email: string
  shippingAddress?: AddressSnapshot
  billingAddress?: AddressSnapshot
  customerNote?: string | null
  internalNote?: string | null
  /**
   * Shipping to charge, in minor units.
   *
   * Supplied by staff rather than computed, because a phone order is exactly
   * the case where the standard rate does not apply. This is *not* a hole in
   * "the client never sends a price": that rule is about buyers. Staff who can
   * reach this endpoint already hold `orders:manage`, and every value they set
   * here lands in the audit log.
   */
  shippingAmount?: number
  /** A negotiated discount, in minor units. Never more than the goods. */
  discountAmount?: number
  /** Record the money as already received (cash, transfer, terminal). */
  markPaid?: boolean
  /** Free-text note about how it was paid, e.g. "bank transfer ref 8812". */
  paymentReference?: string | null
  /** Sell in a currency other than the base. Must be one the store lists. */
  currency?: string | null
}

export interface ManualOrderResult {
  orderId: string
  orderNumber: string
  /** Plaintext, returned once. The link to give the buyer. */
  accessToken: string
  total: { amount: number; currency: string }
  paid: boolean
}

function wholeMinor(value: number | undefined, label: string): number {
  const amount = Math.trunc(Number(value ?? 0))
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw publicError.unprocessable(
      `${label} must be a positive whole number of minor units.`,
      'invalid_amount'
    )
  }
  return amount
}

export default class ManualOrderService {
  /**
   * Create an order from the admin — a phone sale, a market stall, an invoice.
   *
   * Deliberately built on the same `PricingService` and `InventoryService` as a
   * storefront checkout, so a manual order reserves stock, snapshots its lines
   * and reaches `paid` through the same door. The only things it skips are the
   * gateway and the cart; nothing about how money and stock are accounted for
   * changes just because a human typed it in.
   */
  async create(input: ManualOrderInput, actor: OrderActor): Promise<ManualOrderResult> {
    if (input.lines.length === 0) {
      throw publicError.unprocessable('An order needs at least one item.', 'no_lines')
    }

    const store = await settings.getOrCreate()
    const shippingAmount = wholeMinor(input.shippingAmount, 'Shipping')
    const discountAmount = wholeMinor(input.discountAmount, 'Discount')

    // Prices still come from the database. Staff choose *what* and *how many*,
    // and may adjust shipping and discount — never the unit price of a product.
    const base = await pricing.price(input.lines, { currency: input.currency })

    if (discountAmount > base.subtotalAmount) {
      throw publicError.unprocessable(
        'The discount is larger than the items on this order.',
        'discount_exceeds_subtotal'
      )
    }

    const priced = await pricing.price(input.lines, {
      currency: input.currency,
      shippingAmount,
      discountAmount,
    })

    if (priced.totalAmount < 0) {
      /**
       * Unreachable — the discount is already bounded by the subtotal above.
       * If it ever fires, refuse rather than hand someone money.
       */
      throw publicError.unprocessable(
        'This order priced below zero and cannot be created.',
        'negative_total'
      )
    }

    /**
     * A zero-total order is settled on creation, whatever `markPaid` says.
     *
     * Leaving it unpaid would mean waiting for a payment that can never arrive,
     * and the expiry sweep would eventually release the stock from under a
     * comped order someone had already been promised. Free is a price, so it is
     * paid — the same conclusion the storefront reaches for a 100% discount.
     */
    const isFree = priced.totalAmount === 0
    const settleNow = isFree || Boolean(input.markPaid)

    const token = mintOrderToken()
    const expiresAt = DateTime.now().plus({ minutes: store.checkoutTtlMinutes })

    const created = await db.transaction(async (trx) => {
      await inventory.reserve(
        priced.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
        trx
      )

      const number = await orders.nextOrderNumber(trx, store.orderNumberPrefix || 'ORD-')

      const order = await Order.create(
        {
          id: newUlid(),
          number,
          status: 'pending',
          paymentStatus: 'unpaid',
          fulfillmentStatus: 'unfulfilled',
          accountId: null,
          email: input.email.trim().toLowerCase(),
          accessTokenHash: token.hash,
          accessTokenEnc: token.enc,
          shippingAddress: input.shippingAddress ?? {},
          billingAddress: input.billingAddress ?? input.shippingAddress ?? {},
          currency: priced.currency,
          subtotalAmount: priced.subtotalAmount,
          discountAmount: priced.discountAmount,
          shippingAmount: priced.shippingAmount,
          taxAmount: priced.taxAmount,
          totalAmount: priced.totalAmount,
          refundedAmount: 0,
          discountCode: null,
          affiliateCode: null,
          shippingMethodId: null,
          customerNote: input.customerNote ?? null,
          internalNote: input.internalNote ?? null,
          /**
           * A manual order holds its reservation like any other. If nobody
           * marks it paid, the expiry sweep releases the stock — otherwise a
           * mistyped phone order would hold inventory forever.
           */
          reservationExpiresAt: expiresAt,
        },
        { client: trx }
      )

      await OrderItem.createMany(
        priced.lines.map((line) => ({
          id: newUlid(),
          orderId: order.id,
          variantId: line.variantId,
          productId: line.productId,
          title: line.title,
          variantTitle: line.variantTitle,
          sku: line.sku,
          imageUrl: line.imageUrl,
          productType: line.productType,
          quantity: line.quantity,
          unitAmount: line.unitAmount,
          subtotalAmount: line.subtotalAmount,
          discountAmount: line.discountAmount,
          taxAmount: line.taxAmount,
          totalAmount: line.totalAmount,
          refundedQuantity: 0,
        })),
        { client: trx }
      )

      return order
    })

    /**
     * Marking it paid is a **second** transaction, on purpose.
     *
     * `markOrderPaid` is the single door to paid — it commits the stock
     * reservation, issues download grants and records the commission — and it
     * opens its own transaction. Nesting it inside this one would deadlock on
     * SQLite and, worse, would make a failure there silently unwind an order
     * that had already been announced as created.
     */
    let paid = false
    if (settleNow) {
      const paymentId = `manual_${newUlid()}`

      /**
       * A free order records no payment — there was none. Only a manual order
       * with money behind it gets a row, so "every payment row corresponds to
       * money that moved" stays true.
       */
      if (!isFree) {
        await Payment.create({
          id: newUlid(),
          orderId: created.id,
          /**
           * Not a gateway. `PaymentGateway` carries `manual` precisely so the
           * driver registry can never be asked for one — see the guards in
           * `refund_service`, `webhook_service` and `checkout_service`.
           */
          gateway: 'manual',
          mode: 'live',
          gatewayPaymentId: paymentId,
          status: 'pending',
          amount: created.totalAmount,
          currency: created.currency,
          gatewayPayload: { manual: true, reference: input.paymentReference ?? null },
        })
      }

      const result = await orders.markOrderPaid(
        created.id,
        {
          gatewayPaymentId: paymentId,
          amount: created.totalAmount,
          currency: created.currency,
          source: isFree ? 'free' : 'manual',
        },
        actor
      )
      paid = result.changed
    }

    return {
      orderId: created.id,
      orderNumber: created.number,
      accessToken: token.plain,
      total: { amount: created.totalAmount, currency: created.currency },
      paid,
    }
  }
}

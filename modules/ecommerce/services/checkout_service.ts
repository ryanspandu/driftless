import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { newUlid } from '#services/ulid_service'
import { publicError } from '#exceptions/public_error'
import AuditLogService from '#services/audit_log_service'
import Order from '#modules/ecommerce/models/order'
import type { AddressSnapshot } from '#modules/ecommerce/models/order'
import OrderItem from '#modules/ecommerce/models/order_item'
import Payment from '#modules/ecommerce/models/payment'
import type { GatewayName } from '#modules/ecommerce/models/gateway_credential'
import PricingService from '#modules/ecommerce/services/pricing_service'
import InventoryService from '#modules/ecommerce/services/inventory_service'
import OrderService from '#modules/ecommerce/services/order_service'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import DiscountService from '#modules/ecommerce/services/discount_service'
import ShippingService from '#modules/ecommerce/services/shipping_service'
import { gatewayDriver } from '#modules/ecommerce/services/gateways/registry'
import { mintOrderToken } from '#modules/ecommerce/services/order_access_token'

const pricing = new PricingService()
const inventory = new InventoryService()
const orders = new OrderService()
const settings = new StoreSettingsService()
const discounts = new DiscountService()
const shipping = new ShippingService()
const audit = new AuditLogService()

/**
 * What a checkout request may contain.
 *
 * Note what is **absent**: any amount at all. The client says what it wants and
 * where to send it; the server decides what that costs.
 */
export interface CheckoutInput {
  lines: { variantId: string; quantity: number }[]
  email: string
  gateway: GatewayName
  shippingAddress?: AddressSnapshot
  billingAddress?: AddressSnapshot
  shippingMethodId?: string | null
  discountCode?: string | null
  affiliateCode?: string | null
  customerNote?: string | null
  customerId?: string | null
  /**
   * Price in this currency. Comes from the **cart**, which fixed it at
   * creation — not from the request body, and not re-read from a cookie here.
   * A basket priced in one currency must be charged in that same one.
   */
  currency?: string | null
  /** Absolute URLs the gateway sends the buyer back to. */
  successUrl: string
  cancelUrl: string
}

export interface CheckoutResult {
  orderId: string
  orderNumber: string
  /** Plaintext, returned once so a guest can be given a link to their order. */
  accessToken: string
  redirectUrl: string
  total: { amount: number; currency: string }
  /**
   * True only for a free order, which is settled before this returns. A paid
   * order is never `true` here — it becomes paid at the webhook, not at
   * checkout.
   */
  paid: boolean
}

/** Append the order's access token to a return URL, whatever it already carries. */
function withToken(url: string, token: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
}

export default class CheckoutService {
  /**
   * Create an order, reserve its stock, and open a hosted checkout session.
   *
   * The order is created **before** the buyer is redirected, in the `pending` /
   * `unpaid` state, holding a stock reservation with an expiry. That ordering
   * matters: creating it afterwards would mean a paid webhook arriving for an
   * order that does not exist yet, and reserving afterwards would mean two
   * buyers can both be sent to pay for the last item.
   *
   * Everything up to the redirect is one transaction. If the gateway call
   * fails, the reservation and the order roll back together — no orphan holding
   * stock nobody can buy.
   */
  async start(input: CheckoutInput): Promise<CheckoutResult> {
    const store = await settings.getOrCreate()

    /**
     * Price once with no discount, so the discount can be evaluated against a
     * real subtotal, then price again with the amount it produced. Two passes
     * rather than one because minimum-spend and scope rules need to see the
     * basket before they can decide what to take off.
     */
    const base = await pricing.price(input.lines, { currency: input.currency })

    let discount: Awaited<ReturnType<DiscountService['validate']>> | null = null
    if (input.discountCode?.trim()) {
      // Throws with a client-safe reason if the code is not usable here.
      discount = await discounts.validate(input.discountCode, base, input.email)
    }

    /**
     * Shipping, resolved from the **method id** the client chose — never from a
     * rate it sent. `rateFor` re-derives the amount from the destination and
     * basket it was quoted for, and refuses a method that does not apply.
     *
     * A digital-only basket is never charged and never asked. Neither is a
     * store that has no zones configured: demanding a choice it cannot offer
     * would lock every physical order out of a shop that worked fine before
     * shipping existed.
     */
    let shippingAmount = 0
    let shippingMethodLabel: string | null = null

    if (!base.digitalOnly && (await shipping.isConfigured())) {
      const destination = shipping.destinationFrom(input.shippingAddress)
      const context = {
        destination,
        subtotalAmount: base.subtotalAmount,
        currency: (input.currency ?? store.currency).toUpperCase(),
      }

      if (input.shippingMethodId) {
        const quote = await shipping.rateFor(input.shippingMethodId, context)
        shippingAmount = quote.amount
        shippingMethodLabel = quote.name
      } else {
        /**
         * No choice made. Fall back to the cheapest option for the address
         * rather than charging nothing — a silent zero is a loss that only
         * shows up in the accounts.
         */
        const quotes = await shipping.quotesFor(context)
        if (quotes.length === 0) {
          throw publicError.unprocessable(
            'We do not deliver to that address.',
            'shipping_unavailable'
          )
        }
        const cheapest = quotes.reduce((a, b) => (b.amount < a.amount ? b : a))
        shippingAmount = cheapest.amount
        shippingMethodLabel = cheapest.name
      }
    }

    // Amounts come from here and nowhere else.
    const priced = await pricing.price(input.lines, {
      currency: input.currency,
      shippingAmount,
      discountAmount: discount?.amount ?? 0,
    })

    /**
     * A basket a discount took to zero.
     *
     * No gateway will accept a zero-amount charge, so this skips the gateway
     * entirely and marks the order paid directly. What it deliberately does
     * **not** skip is anything else: stock is still reserved and committed, the
     * discount's quota is still claimed atomically, download grants are still
     * issued, and it still runs through `markOrderPaid` — because "free" is a
     * price, not a different kind of order.
     *
     * Nothing a client sends can reach this branch. The total is derived from
     * the catalogue and a server-validated discount; a request cannot assert
     * that its basket is free any more than it can assert a price.
     */
    const isFree = priced.totalAmount === 0

    if (priced.totalAmount < 0) {
      /**
       * Unreachable — `PricingService` clamps a discount to the subtotal. If it
       * ever fires, something upstream is broken and the right response is to
       * refuse, not to hand someone money.
       */
      throw publicError.unprocessable(
        'This basket priced below zero and cannot be ordered.',
        'negative_total'
      )
    }

    const token = mintOrderToken()
    const expiresAt = DateTime.now().plus({ minutes: store.checkoutTtlMinutes })

    const result = await db.transaction(async (trx) => {
      /**
       * Reserve first. If stock has gone since the basket was priced, this
       * throws and nothing else in the transaction happened.
       */
      await inventory.reserve(
        priced.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        trx
      )

      // Prefix read before the transaction opened — see `nextOrderNumber`.
      const number = await orders.nextOrderNumber(trx, store.orderNumberPrefix || 'ORD-')

      const created = await Order.create(
        {
          id: newUlid(),
          number,
          status: 'pending',
          paymentStatus: 'unpaid',
          fulfillmentStatus: 'unfulfilled',
          customerId: input.customerId ?? null,
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
          discountCode: discount?.discount.code ?? null,
          affiliateCode: input.affiliateCode ?? null,
          shippingMethodId: input.shippingMethodId ?? null,
          shippingMethodLabel,
          customerNote: input.customerNote ?? null,
          reservationExpiresAt: expiresAt,
        },
        { client: trx }
      )

      await OrderItem.createMany(
        priced.lines.map((line) => ({
          id: newUlid(),
          orderId: created.id,
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

      /**
       * Consume the discount inside the same transaction as the reservation.
       *
       * The claim is a conditional UPDATE, so if the last use went to someone
       * else between validation and here, this throws and the whole checkout —
       * order, items, stock hold — rolls back together.
       */
      if (discount) {
        await discounts.claim(
          discount.discount.id,
          created.id,
          priced.discountAmount,
          { email: input.email, customerId: input.customerId ?? null },
          trx
        )
      }

      /**
       * The gateway call sits inside the transaction on purpose. It is the last
       * thing that can fail, and if it does we want the order and its
       * reservation gone rather than left behind unpayable.
       *
       * The cost is holding a transaction open across a network call, which is
       * acceptable here: the row set is tiny and the driver has a 20s timeout.
       */
      /**
       * A free order never opens a gateway session — which also means a store
       * selling only free downloads needs no payment credentials configured at
       * all. The buyer goes straight to their order page.
       */
      if (isFree) {
        await orders.recordEvent(
          trx,
          created,
          'order.created',
          {
            toStatus: 'pending',
            message: 'Free checkout — nothing to pay.',
            meta: { free: true, discountCode: discount?.discount.code ?? null },
          },
          { type: input.customerId ? 'customer' : 'system', id: input.customerId }
        )

        return {
          order: created,
          paymentId: null as string | null,
          redirectUrl: withToken(input.successUrl, token.plain),
        }
      }

      const driver = await gatewayDriver(input.gateway)
      const session = await driver.createCheckout({
        orderId: created.id,
        orderNumber: created.number,
        currency: priced.currency,
        email: created.email,
        lines: priced.lines.map((line) => ({
          name: line.title,
          description: line.variantTitle,
          unitAmount: line.unitAmount,
          quantity: line.quantity,
          imageUrl: line.imageUrl,
        })),
        shippingAmount: priced.shippingAmount,
        taxAmount: priced.taxAmount,
        discountAmount: priced.discountAmount,
        totalAmount: priced.totalAmount,
        // The token goes in the return URL so the buyer can see their own
        // order without being logged in. It grants read access to one order,
        // nothing more, and it is not what marks anything paid.
        successUrl: withToken(input.successUrl, token.plain),
        cancelUrl: input.cancelUrl,
        expiresInMinutes: store.checkoutTtlMinutes,
      })

      const paymentRow = await Payment.create(
        {
          id: newUlid(),
          orderId: created.id,
          gateway: driver.name,
          mode: driver.mode,
          gatewayPaymentId: session.gatewayPaymentId,
          status: 'pending',
          amount: priced.totalAmount,
          currency: priced.currency,
          gatewayPayload: {},
        },
        { client: trx }
      )

      await orders.recordEvent(
        trx,
        created,
        'order.created',
        {
          toStatus: 'pending',
          message: `Checkout opened with ${driver.name}.`,
          meta: { gateway: driver.name, gatewayPaymentId: session.gatewayPaymentId },
        },
        { type: input.customerId ? 'customer' : 'system', id: input.customerId }
      )

      return {
        order: created,
        paymentId: paymentRow.id as string | null,
        redirectUrl: session.redirectUrl,
      }
    })

    /**
     * Audited after the commit, not inside it: an audit write must never be
     * able to roll back the thing it is describing.
     */
    await audit.record({
      actor: input.customerId
        ? { type: 'customer', id: input.customerId, label: input.email }
        : { type: 'system', label: 'guest checkout' },
      action: 'order.checkout_started',
      subjectType: 'order',
      subjectId: result.order.id,
      amount: result.order.totalAmount,
      currency: result.order.currency,
      changes: {
        gateway: isFree ? 'none' : input.gateway,
        free: isFree,
        number: result.order.number,
        paymentId: result.paymentId,
        discountCode: discount?.discount.code ?? null,
      },
    })

    /**
     * Settle a free order — after the commit, and through the same door as
     * every other payment.
     *
     * A separate transaction, for the reason `manual_order_service` documents:
     * `markOrderPaid` opens its own, and nesting deadlocks on SQLite. Routing
     * it through there rather than flipping the column directly is what buys
     * the stock commit, the download grants, the commission and the receipt for
     * free — and what makes a free order indistinguishable from a paid one
     * everywhere downstream.
     */
    let paid = false
    if (isFree) {
      const settled = await orders.markOrderPaid(
        result.order.id,
        {
          // No gateway and no payment row, so this id matches nothing. That is
          // fine: the payment update inside `markOrderPaid` simply affects zero
          // rows, exactly as it should when no money moved.
          gatewayPaymentId: `free_${result.order.id}`,
          amount: 0,
          currency: result.order.currency,
          source: 'free',
        },
        input.customerId
          ? { type: 'customer', id: input.customerId, label: input.email }
          : { type: 'system', label: 'free checkout' }
      )
      paid = settled.changed
    }

    return {
      orderId: result.order.id,
      orderNumber: result.order.number,
      accessToken: token.plain,
      redirectUrl: result.redirectUrl,
      total: { amount: result.order.totalAmount, currency: result.order.currency },
      paid,
    }
  }

  /**
   * Confirm an order from the return page.
   *
   * This is what lets a buyer see "paid" before the webhook lands. It is
   * **not** a second way to mark an order paid: it asks the gateway what
   * happened, using a `gatewayPaymentId` read from our own `payments` row, and
   * hands the answer to `markOrderPaid` — the same guarded path the webhook
   * uses. Nothing from the request URL influences the outcome.
   */
  async confirmFromReturn(orderId: string): Promise<{ paid: boolean; order: Order }> {
    const order = await Order.query().where('id', orderId).first()
    if (!order) throw publicError.notFound('Order not found.', 'order_not_found')

    if (order.isPaid) return { paid: true, order }

    const payment = await Payment.query()
      .where('order_id', order.id)
      .orderBy('created_at', 'desc')
      .first()

    if (!payment) return { paid: false, order }

    /**
     * A manual payment has no gateway to ask. It is marked paid by a human at
     * the moment it is recorded, so an unpaid manual order simply stays unpaid
     * until someone says otherwise — there is nothing to poll.
     */
    if (payment.gateway === 'manual') return { paid: false, order }

    const driver = await gatewayDriver(payment.gateway)
    const status = await driver.fetchPaymentStatus(payment.gatewayPaymentId)

    if (status.status !== 'paid') {
      return { paid: false, order }
    }

    const result = await orders.markOrderPaid(
      order.id,
      {
        gatewayPaymentId: payment.gatewayPaymentId,
        amount: status.amount ?? payment.amount,
        currency: status.currency ?? payment.currency,
        source: 'pull',
        raw: status.raw,
      },
      { type: 'system', label: 'return page' }
    )

    return { paid: true, order: result.order }
  }
}

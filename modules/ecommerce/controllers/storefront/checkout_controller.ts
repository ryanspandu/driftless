import crypto from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { apiFail } from '#helpers/api_error_response'
import { publicError } from '#exceptions/public_error'
import Order from '#modules/ecommerce/models/order'
import CartService, { CART_COOKIE } from '#modules/ecommerce/services/cart_service'
import CheckoutService from '#modules/ecommerce/services/checkout_service'
import CustomerAuthService from '#modules/ecommerce/services/customer_auth_service'
import AffiliateService from '#modules/ecommerce/services/affiliate_service'
import IdempotencyService, {
  actorFingerprint,
} from '#modules/ecommerce/services/idempotency_service'
import { Money } from '#modules/ecommerce/services/money'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import DigitalDeliveryService from '#modules/ecommerce/services/digital_delivery_service'
import GatewayCredentialsService from '#modules/ecommerce/services/gateway_credentials_service'
import { countryCode } from '#modules/ecommerce/validators/country'

const addressSchema = vine.object({
  firstName: vine.string().trim().maxLength(80).nullable().optional(),
  lastName: vine.string().trim().maxLength(80).nullable().optional(),
  company: vine.string().trim().maxLength(120).nullable().optional(),
  line1: vine.string().trim().minLength(1).maxLength(200),
  line2: vine.string().trim().maxLength(200).nullable().optional(),
  city: vine.string().trim().minLength(1).maxLength(120),
  state: vine.string().trim().maxLength(120).nullable().optional(),
  postalCode: vine.string().trim().maxLength(32).nullable().optional(),
  // Closed list, not "any two letters" — see the rule. Length is implied by it.
  country: vine.string().trim().use(countryCode()),
  phone: vine.string().trim().maxLength(32).nullable().optional(),
})

/**
 * What a checkout request may contain.
 *
 * Note what is **absent**: any amount at all. The basket says what is being
 * bought; the server decides what it costs. There is deliberately no field a
 * tampered request could use to influence the total.
 */
const checkoutValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email().maxLength(254),
    gateway: vine.enum(['stripe', 'paypal'] as const),
    shippingAddress: addressSchema.optional(),
    billingAddress: addressSchema.optional(),
    customerNote: vine.string().trim().maxLength(1_000).nullable().optional(),
    /**
     * A code, not an amount. The server looks up what it is worth; the client
     * cannot assert a discount value any more than it can assert a price.
     */
    discountCode: vine.string().trim().maxLength(64).nullable().optional(),
    /**
     * A delivery **method id**, not a rate. The server re-derives what it costs
     * from the destination and basket — same rule as prices and discounts.
     */
    shippingMethodId: vine.string().trim().maxLength(40).nullable().optional(),
  })
)

const shippingOptionsValidator = vine.compile(
  vine.object({
    country: vine.string().trim().use(countryCode()),
    /** No list to check a subdivision against, so free text it stays. */
    state: vine.string().trim().maxLength(120).nullable().optional(),
  })
)

const carts = new CartService()
const checkout = new CheckoutService()
const customers = new CustomerAuthService()
const affiliates = new AffiliateService()
const idempotency = new IdempotencyService()
const settings = new StoreSettingsService()
const delivery = new DigitalDeliveryService()
const credentials = new GatewayCredentialsService()

const fail = (response: HttpContext['response'], error: unknown) =>
  apiFail(response, error, 'ecommerce/checkout')

export default class StorefrontCheckoutController {
  /**
   * The checkout configuration a page needs to render its payment section:
   * which gateways have usable credentials, and whether the basket is
   * downloads-only (so no delivery address is asked for).
   *
   * The fixed `/shop/checkout` page gets this as inertia props from
   * `StorefrontPagesController.checkout`; this endpoint is the equivalent for a
   * builder page overriding checkout via the `CheckoutBlock`, so the same
   * server decision is used in both.
   */
  async config(ctx: HttpContext) {
    try {
      const [gateways, cart] = await Promise.all([
        credentials.enabledGateways(),
        carts.forRequest(ctx),
      ])
      const dto = cart ? await carts.toDto(cart) : null
      return ctx.response.json({ gateways, digitalOnly: dto?.digitalOnly ?? false })
    } catch (error) {
      return fail(ctx.response, error)
    }
  }

  /**
   * Begin checkout.
   *
   * Requires an `Idempotency-Key` header. A checkout POST that times out
   * client-side gets retried, and without a key the retry creates a second
   * order and, once paid, a second charge.
   */
  async start(ctx: HttpContext) {
    const { request, response } = ctx

    const key = request.header('idempotency-key')
    if (!key || key.length > 128) {
      return response.status(400).json({
        message: 'An Idempotency-Key header is required to start checkout.',
        reason: 'idempotency_key_required',
      })
    }

    try {
      const payload = await request.validateUsing(checkoutValidator)

      /**
       * Claim the key **before** looking at the basket, and hash only what the
       * client sent.
       *
       * Both details matter. A successful checkout empties the cart, so hashing
       * server-derived state would make an identical retry hash differently and
       * be rejected as key reuse — exactly the case idempotency exists to
       * handle. And claiming first means the retry replays the stored response
       * instead of tripping over the now-empty basket.
       *
       * The key is scoped to this basket's cookie, so one caller cannot claim
       * another's key and read back their stored response — which for checkout
       * would mean someone else's order, complete with their address.
       */
      const cartToken = String(request.cookie(CART_COOKIE) ?? '')
      const actor = actorFingerprint([cartToken])
      const claim = await idempotency.claim(key, actor, payload)

      if (claim.replay) {
        return response.status(claim.replay.status).json(claim.replay.body)
      }

      try {
        const cart = await carts.forRequest(ctx)
        const lines = cart ? await carts.lines(cart) : []

        if (!cart || lines.length === 0) {
          throw publicError.unprocessable('Your basket is empty.', 'empty_basket')
        }

        const customer = await customers.resolve(ctx)

        /**
         * Attach the order to a customer record even for a guest — it is how
         * "my orders" works if they register later, and how repeat-customer
         * totals stay meaningful. A guest row has no password and cannot be
         * signed into.
         */
        const buyer =
          customer ??
          (await customers.findOrCreateGuest(payload.email, {
            firstName: payload.shippingAddress?.firstName ?? null,
            lastName: payload.shippingAddress?.lastName ?? null,
          }))

        const store = await settings.getOrCreate()
        const origin = `${request.protocol()}://${request.host()}`

        const result = await checkout.start({
          lines,
          /**
           * From the basket, never from the request. The shopper agreed to a
           * total in the currency their basket was priced in; letting the body
           * name a different one would charge them in a currency they never
           * saw.
           */
          currency: cart.currency,
          email: payload.email,
          gateway: payload.gateway,
          shippingAddress: payload.shippingAddress,
          billingAddress: payload.billingAddress,
          customerNote: payload.customerNote ?? null,
          discountCode: payload.discountCode ?? null,
          /**
           * Attribution comes from the referral cookie, never from the request
           * body. A client-supplied code would let anyone credit any affiliate
           * for any sale — including themselves.
           */
          affiliateCode: affiliates.referralCode(ctx),
          shippingMethodId: payload.shippingMethodId ?? null,
          customerId: buyer.id,
          /**
           * Built from the request's own host rather than anything the client
           * sent. A caller-supplied return URL would let someone point the
           * gateway's redirect wherever they liked — and while the redirect
           * never marks an order paid, it does carry the order access token.
           */
          successUrl: `${origin}/shop/order`,
          cancelUrl: `${origin}/shop/cart`,
        })

        // The basket has become an order; leaving it filled would let someone
        // pay twice for the same thing by pressing back.
        await carts.clear(cart)

        const body = {
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          accessToken: result.accessToken,
          redirectUrl: result.redirectUrl,
          total: Money.toDto(result.total.amount, result.total.currency, store.locale),
          /**
           * True only when a discount took the basket to zero and the order was
           * settled without a gateway. The client uses it to say "you're done"
           * instead of "redirecting to payment"; `redirectUrl` already points
           * at the order page in that case, so a client that ignores this still
           * behaves correctly.
           */
          paid: result.paid,
        }

        await claim.complete(201, body)
        return response.status(201).json(body)
      } catch (error) {
        // Release the key so the caller may legitimately retry.
        await claim.release()
        throw error
      }
    } catch (error) {
      return fail(response, error)
    }
  }

  /**
   * The return page, after the gateway.
   *
   * Reads the order by its **access token**, never by an id in the URL, and
   * asks the gateway what happened using a payment id read from our own row.
   * Nothing in the query string decides whether an order is paid.
   */
  async status(ctx: HttpContext) {
    const { request, response } = ctx
    const token = String(request.input('token', ''))

    if (!token) {
      return response.status(400).json({ message: 'Missing token.', reason: 'token_required' })
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const order = await Order.query()
      .where('access_token_hash', tokenHash)
      .whereNull('deleted_at')
      .preload('items')
      .first()

    /**
     * A bad token and a missing order return the same 404: an attacker probing
     * with random tokens learns nothing about which ones exist.
     */
    if (!order) {
      return response.status(404).json({ message: 'Order not found.', reason: 'order_not_found' })
    }

    try {
      // Confirms from the gateway if the webhook has not landed yet.
      const result = await checkout.confirmFromReturn(order.id)
      const store = await settings.getOrCreate()
      const money = (amount: number) => Money.toDto(amount, result.order.currency, store.locale)

      /**
       * A deliberately narrow shape. This is an unauthenticated endpoint reached
       * with a link that may sit in an email, a browser history or a proxy log —
       * so it carries what a buyer needs to see their purchase, and nothing that
       * would matter if the link leaked.
       */
      /**
       * Downloads, once the order is actually paid.
       *
       * Gated on `result.paid` rather than merely on the order existing: the
       * status endpoint is reachable with a token the moment checkout starts,
       * and listing files before payment lands would tell an unpaid buyer
       * exactly what is waiting. The grant DTO carries no token — the links
       * come from the confirmation email.
       */
      const grants = result.paid ? await delivery.grantsForOrder(result.order.id) : []

      /**
       * The URL is built here rather than in the browser. The client should
       * never assemble something that carries a credential — it is how a token
       * ends up concatenated into the wrong place exactly once, in the one
       * release nobody re-tested.
       */
      const downloads = grants.map((grant) => ({
        ...grant,
        url: grant.live ? `/shop/download/${grant.id}?token=${encodeURIComponent(token)}` : null,
      }))

      return response.json({
        number: result.order.number,
        paid: result.paid,
        downloads,
        status: result.order.status,
        paymentStatus: result.order.paymentStatus,
        email: result.order.email,
        placedAt: result.order.createdAt.toISO(),
        /**
         * Shipment details, once there are any. The tracking URL was validated
         * as `http(s)` when it was recorded — a `javascript:` link reaching a
         * page the buyer clicks would be a stored XSS with extra steps.
         */
        shippedAt: result.order.shippedAt?.toISO() ?? null,
        carrier: result.order.carrier,
        trackingNumber: result.order.trackingNumber,
        trackingUrl: result.order.trackingUrl,
        total: money(result.order.totalAmount),
        subtotal: money(result.order.subtotalAmount),
        shipping: money(result.order.shippingAmount),
        tax: money(result.order.taxAmount),
        items: (order.items ?? []).map((item) => ({
          title: item.title,
          variantTitle: item.variantTitle,
          quantity: item.quantity,
          total: money(item.totalAmount),
          imageUrl: item.imageUrl,
        })),
      })
    } catch (error) {
      return fail(response, error)
    }
  }

  /**
   * Delivery options for an address, priced for the current basket.
   *
   * Quoted before checkout so the buyer sees the real total before committing.
   * Returns an empty list when the shop does not deliver there — the storefront
   * says so rather than letting them reach a checkout that will refuse.
   */
  async shippingOptions(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const { country, state } = await request.validateUsing(shippingOptionsValidator)

      const cart = await carts.forRequest(ctx)
      const lines = cart ? await carts.lines(cart) : []

      if (!cart || lines.length === 0) {
        throw publicError.unprocessable('Your basket is empty.', 'empty_basket')
      }

      const { default: PricingService } =
        await import('#modules/ecommerce/services/pricing_service')
      const priced = await new PricingService().price(lines, { currency: cart.currency })

      // A downloads-only basket is never shipped and never asked to choose.
      if (priced.digitalOnly) return response.json({ required: false, options: [] })

      const { default: ShippingService } =
        await import('#modules/ecommerce/services/shipping_service')
      const shipping = new ShippingService()

      if (!(await shipping.isConfigured())) {
        return response.json({ required: false, options: [] })
      }

      const options = await shipping.optionsFor({
        destination: { country, state: state ?? null },
        subtotalAmount: priced.subtotalAmount,
        currency: cart.currency,
      })

      return response.json({ required: true, options })
    } catch (error) {
      return fail(response, error)
    }
  }
}

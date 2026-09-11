import { DateTime } from 'luxon'
import MailDispatcher from '#services/mail_dispatcher'
import MailEventsService from '#services/mail_events_service'
import type { MailPresentation } from '#mails/event_mail'
import { WebSettingsService } from '#services/settings_service'
import Order from '#modules/ecommerce/models/order'
import OrderItem from '#modules/ecommerce/models/order_item'
import { Money } from '#modules/ecommerce/services/money'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import DigitalDeliveryService from '#modules/ecommerce/services/digital_delivery_service'
import OrderConfirmationMail from '#modules/ecommerce/mails/order_confirmation_mail'
import OrderShippedMail from '#modules/ecommerce/mails/order_shipped_mail'
import BasketReminderMail from '#modules/ecommerce/mails/basket_reminder_mail'
import Cart from '#modules/ecommerce/models/cart'
import Account from '#modules/ecommerce/models/account'
import CartService from '#modules/ecommerce/services/cart_service'
import PricingService from '#modules/ecommerce/services/pricing_service'
import MarketingConsentService from '#modules/ecommerce/services/marketing_consent_service'
import { ECOMMERCE_MAIL_EVENTS } from '#modules/ecommerce/services/mail_events'
import env from '#start/env'
import { DateTime as Luxon } from 'luxon'
import type { OrderShippedContext } from '#modules/ecommerce/mails/order_shipped_mail'
import type {
  OrderConfirmationContext,
  OrderConfirmationDownload,
  OrderConfirmationLine,
} from '#modules/ecommerce/mails/order_confirmation_mail'
import {
  downloadUrl,
  orderUrl,
  readOrderToken,
} from '#modules/ecommerce/services/order_access_token'

const dispatcher = new MailDispatcher()
const storeSettings = new StoreSettingsService()
const webSettings = new WebSettingsService()
const delivery = new DigitalDeliveryService()
const mailEvents = new MailEventsService()

export default class OrderNotifierService {
  /**
   * The operator's copy and branding for one event, as the templates expect.
   *
   * One helper so the three notifiers cannot drift on which fields they pass —
   * a missing `accentColor` is a button that renders black on a site whose
   * brand is not.
   */
  private async presentation(
    event: string,
    values: Record<string, unknown>
  ): Promise<MailPresentation> {
    const [copy, branding] = await Promise.all([
      mailEvents.copy(event, values),
      mailEvents.branding(),
    ])
    return {
      subject: copy.subject,
      heading: copy.heading,
      intro: copy.intro,
      buttonLabel: copy.buttonLabel,
      outro: copy.outro,
      logoUrl: branding.logoUrl,
      accentColor: branding.accentColor,
    }
  }

  /**
   * Everything the confirmation email renders, or null if there is no order to
   * describe.
   *
   * Split from the sending so it can be asserted directly: a transport that
   * only exists when SMTP is configured is not a seam a test can reach through,
   * and "did the receipt contain a working link" is exactly the property worth
   * pinning down.
   */
  async buildConfirmation(orderId: string): Promise<OrderConfirmationContext | null> {
    const order = await Order.find(orderId)
    if (!order || !order.email) return null

    const items = await OrderItem.query().where('order_id', order.id)
    const store = await storeSettings.getOrCreate()
    const sections = await webSettings.getMergedSections()
    const siteName = sections['site_meta']?.['site_title'] || store.storeName || 'Driftless'

    const money = (amount: number) => Money.format(amount, order.currency, store.locale)

    /**
     * Recovered from the encrypted copy, because the webhook that got us here
     * never saw the plaintext. Null is survivable — the email still lists what
     * was bought, it just cannot link to the order.
     */
    const token = readOrderToken(order)

    const lines: OrderConfirmationLine[] = items.map((item) => ({
      title: item.title,
      variantTitle: item.variantTitle,
      quantity: item.quantity,
      total: money(item.totalAmount),
    }))

    /**
     * Download links go in the email only when there is a token to build them
     * with. Without one there is no way to authorise the download, so listing
     * the filenames would be a list of things the buyer cannot reach.
     */
    let downloads: OrderConfirmationDownload[] = []
    if (token) {
      const grants = await delivery.grantsForOrder(order.id)
      downloads = grants
        .filter((grant) => grant.live)
        .map((grant) => ({
          filename: grant.filename,
          url: downloadUrl(grant.id, token),
          expiresNote: this.expiryNote(grant.expiresAt, grant.maxDownloads),
        }))
    }

    return {
      ...(await this.presentation(ECOMMERCE_MAIL_EVENTS.orderConfirmation, {
        siteName,
        number: order.number,
        total: money(order.totalAmount),
      })),
      siteName,
      number: order.number,
      items: lines,
      subtotal: money(order.subtotalAmount),
      // Null rather than a formatted zero, so the template omits the row.
      discount: order.discountAmount > 0 ? money(order.discountAmount) : null,
      shipping: order.shippingAmount > 0 ? money(order.shippingAmount) : null,
      tax: order.taxAmount > 0 ? money(order.taxAmount) : null,
      taxLabel: store.taxLabel || 'Tax',
      total: money(order.totalAmount),
      downloads,
      orderUrl: token ? orderUrl(token) : null,
      footerNote: `You are receiving this because you placed an order with ${siteName}.`,
      recipient: order.email,
    }
  }

  /**
   * Send the confirmation for a paid order.
   *
   * **Never throws.** This is called from `markOrderPaid` after its transaction
   * commits, and rule 5 applies directly: an order that has been paid is paid
   * whether or not its receipt went out. Letting a dead SMTP relay turn a
   * successful charge into a 500 would make the gateway retry a payment we have
   * already taken — the failure mode is far worse than a missing email.
   *
   * Returns whether anything was sent, so a caller with a reason to care (a
   * test, an admin "resend" button) can tell without inspecting logs.
   */
  async sendOrderConfirmation(orderId: string): Promise<boolean> {
    try {
      if (!(await dispatcher.isConfigured())) return false

      const context = await this.buildConfirmation(orderId)
      if (!context) return false

      await dispatcher.sendLater(new OrderConfirmationMail(context.recipient, context), {
        event: ECOMMERCE_MAIL_EVENTS.orderConfirmation,
      })
      return true
    } catch (error) {
      /**
       * Logged, never rethrown. See the method comment: the payment is already
       * committed and must stay that way.
       */
      console.error('[ecommerce] order confirmation email failed', {
        orderId,
        error: (error as Error).message,
      })
      return false
    }
  }

  /**
   * Everything the shipment email renders, or null if there is nothing to send.
   *
   * Split from the sending for the same reason as the receipt: the transport
   * only exists when SMTP is configured, which is not a seam a test can reach
   * through, and "does the tracking link survive" is worth pinning down.
   */
  async buildShipmentNotice(orderId: string): Promise<OrderShippedContext | null> {
    const order = await Order.find(orderId)
    if (!order || !order.email) return null

    const items = await OrderItem.query().where('order_id', order.id)
    const store = await storeSettings.getOrCreate()
    const sections = await webSettings.getMergedSections()
    const siteName = sections['site_meta']?.['site_title'] || store.storeName || 'Driftless'

    const money = (amount: number) => Money.format(amount, order.currency, store.locale)
    const token = readOrderToken(order)

    return {
      ...(await this.presentation(ECOMMERCE_MAIL_EVENTS.orderShipped, {
        siteName,
        number: order.number,
        carrier: order.carrier ?? '',
        trackingNumber: order.trackingNumber ?? '',
      })),
      siteName,
      number: order.number,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      items: items.map((item) => ({
        title: item.title,
        variantTitle: item.variantTitle,
        quantity: item.quantity,
        total: money(item.totalAmount),
      })),
      orderUrl: token ? orderUrl(token) : null,
      footerNote: `You are receiving this because you placed an order with ${siteName}.`,
      recipient: order.email,
    }
  }

  /**
   * Tell the buyer their order shipped.
   *
   * **Never throws.** Same rule as the receipt: the shipment is already
   * recorded, and a dead SMTP relay must not turn a successful fulfilment into
   * a 500 that makes an operator mark it shipped twice.
   */
  async sendShipmentNotice(orderId: string): Promise<boolean> {
    try {
      if (!(await dispatcher.isConfigured())) return false

      const context = await this.buildShipmentNotice(orderId)
      if (!context) return false

      await dispatcher.sendLater(new OrderShippedMail(context.recipient, context), {
        event: ECOMMERCE_MAIL_EVENTS.orderShipped,
      })
      return true
    } catch (error) {
      console.error('[ecommerce] shipment email failed', {
        orderId,
        error: (error as Error).message,
      })
      return false
    }
  }

  /**
   * Remind people about baskets they abandoned.
   *
   * Every guard here exists because this is the one **marketing** message the
   * module sends — nobody asked for it:
   *
   * - Only customers who opted in and have not opted out. Both, because
   *   `acceptsMarketing` can be flipped back by an admin editing a profile.
   * - Only baskets past the checkout window, so someone still shopping is not
   *   chased mid-decision.
   * - **Once per basket**, stamped with `reminded_at`. A nightly sweep with no
   *   memory sends the same person the same email every night, which is how a
   *   domain gets blocklisted — and that would take the receipts down too.
   * - Never a guest. A guest basket has no consent attached to it at all.
   *
   * Returns how many went out, for the maintenance command's summary.
   */
  async sendBasketReminders(limit = 50): Promise<number> {
    if (!(await dispatcher.isConfigured())) return 0

    const store = await storeSettings.getOrCreate()
    const sections = await webSettings.getMergedSections()
    const siteName = sections['site_meta']?.['site_title'] || store.storeName || 'Driftless'
    const base = env.get('APP_URL', 'http://localhost:3333').replace(/\/+$/, '')

    const consent = new MarketingConsentService()
    const carts = new CartService()
    const pricing = new PricingService()

    const cutoff = Luxon.now().minus({ minutes: store.checkoutTtlMinutes })

    const candidates = await Cart.query()
      .whereNotNull('account_id')
      .whereNull('reminded_at')
      .where('updated_at', '<', cutoff.toSQL()!)
      .orderBy('updated_at', 'asc')
      .limit(Math.min(Math.max(Math.trunc(limit), 1), 200))

    let sent = 0

    for (const cart of candidates) {
      try {
        const customer = cart.accountId ? await Account.find(cart.accountId) : null
        if (!customer || !consent.mayEmail(customer)) {
          /**
           * Stamped anyway. Without this, a basket belonging to someone who
           * opted out is re-examined on every sweep forever — and the moment
           * they opt back in for something else, they get a reminder about a
           * basket from months ago.
           */
          cart.remindedAt = Luxon.now()
          await cart.save()
          continue
        }

        const lines = await carts.lines(cart)
        if (lines.length === 0) {
          cart.remindedAt = Luxon.now()
          await cart.save()
          continue
        }

        const priced = await pricing.price(lines, { currency: cart.currency })
        const money = (amount: number) => Money.format(amount, priced.currency, store.locale)

        const token = await consent.unsubscribeToken(customer)

        await dispatcher.sendLater(
          new BasketReminderMail(customer.email, {
            ...(await this.presentation(ECOMMERCE_MAIL_EVENTS.basketReminder, {
              siteName,
              total: money(priced.totalAmount),
            })),
            siteName,
            items: priced.lines.map((line) => ({
              title: line.title,
              variantTitle: line.variantTitle,
              quantity: line.quantity,
              total: money(line.totalAmount),
            })),
            total: money(priced.totalAmount),
            cartUrl: `${base}/shop/cart`,
            unsubscribeUrl: consent.unsubscribeUrl(token),
            footerNote: `You are receiving this because you asked ${siteName} for offers.`,
            recipient: customer.email,
          }),
          { event: ECOMMERCE_MAIL_EVENTS.basketReminder }
        )

        cart.remindedAt = Luxon.now()
        await cart.save()
        sent++
      } catch (error) {
        /**
         * One bad basket must not stop the sweep — and it is still stamped, so
         * a basket that throws every time cannot block the queue forever.
         */
        console.error('[ecommerce] basket reminder failed', {
          cartId: cart.id,
          error: (error as Error).message,
        })
        cart.remindedAt = Luxon.now()
        await cart.save()
      }
    }

    return sent
  }

  private expiryNote(expiresAt: string | null, maxDownloads: number): string | null {
    const parts: string[] = []

    if (expiresAt) {
      const when = DateTime.fromISO(expiresAt)
      if (when.isValid) parts.push(`available until ${when.toFormat('d LLLL')}`)
    }
    if (maxDownloads > 0) {
      parts.push(`${maxDownloads} download${maxDownloads === 1 ? '' : 's'}`)
    }

    return parts.length > 0 ? parts.join(' · ') : null
  }
}

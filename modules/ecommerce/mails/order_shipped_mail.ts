import { BaseMail } from '@adonisjs/mail'
import type { MailPresentation } from '#mails/event_mail'
import type { OrderConfirmationLine } from '#modules/ecommerce/mails/order_confirmation_mail'

export interface OrderShippedContext extends MailPresentation {
  siteName: string
  number: string
  carrier: string | null
  trackingNumber: string | null
  /** Already validated as `http(s)` — see `OrderService.markShipped`. */
  trackingUrl: string | null
  items: OrderConfirmationLine[]
  orderUrl: string | null
  footerNote: string
  recipient: string
}

/**
 * "Your order has shipped."
 *
 * Sent once, from `markShipped`, and only the first time — correcting a
 * mistyped tracking number must not tell the buyer their parcel shipped twice.
 *
 * Like the receipt, everything it renders arrives pre-formatted: this is built
 * in a service and handed over, because an email renders in a queue worker with
 * no request context.
 */
export default class OrderShippedMail extends BaseMail {
  constructor(
    private to: string,
    private context: OrderShippedContext
  ) {
    super()
  }

  prepare() {
    const { context } = this

    this.message
      .to(this.to)
      .subject(context.subject)
      .htmlView('emails/order_shipped', { ...context, title: `Order ${context.number} shipped` })
      .text(this.plainText())
  }

  private plainText(): string {
    const { context } = this
    const lines: string[] = [`Your order is on its way.`, ``, `Order ${context.number} has shipped.`]

    if (context.carrier) lines.push(``, `Carrier: ${context.carrier}`)
    if (context.trackingNumber) lines.push(`Tracking number: ${context.trackingNumber}`)
    if (context.trackingUrl) lines.push(`Track it: ${context.trackingUrl}`)

    if (context.items.length > 0) {
      lines.push(``, `What's in it:`)
      for (const item of context.items) {
        const variant = item.variantTitle ? ` (${item.variantTitle})` : ''
        lines.push(`  ${item.title}${variant} x${item.quantity}`)
      }
    }

    if (context.orderUrl) lines.push(``, `View your order: ${context.orderUrl}`)

    return lines.join('\n')
  }
}

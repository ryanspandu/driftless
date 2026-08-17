import { BaseMail } from '@adonisjs/mail'
import type { MailPresentation } from '#mails/event_mail'

export interface OrderConfirmationLine {
  title: string
  variantTitle: string | null
  quantity: number
  /** Pre-formatted. Nothing in a template does money arithmetic. */
  total: string
}

export interface OrderConfirmationDownload {
  filename: string
  url: string
  /** e.g. "available until 3 August" or "3 downloads". Optional. */
  expiresNote: string | null
}

export interface OrderConfirmationContext extends MailPresentation {
  siteName: string
  number: string
  items: OrderConfirmationLine[]
  subtotal: string
  /** Falsy when zero, so the template can omit the row entirely. */
  discount: string | null
  shipping: string | null
  tax: string | null
  taxLabel: string
  total: string
  downloads: OrderConfirmationDownload[]
  /** Null when the token could not be recovered — see `readOrderToken`. */
  orderUrl: string | null
  footerNote: string
  /** Where it goes. Carried in the context so the builder decides, not the caller. */
  recipient: string
}

/**
 * The receipt a buyer gets once their order is actually paid.
 *
 * Sent from `markOrderPaid`, which means it fires exactly once per order no
 * matter how many webhooks arrive — and it carries the order's own access link,
 * which for a guest is the only way back to their purchase.
 *
 * Everything it renders arrives pre-formatted. The template performs no
 * arithmetic and no lookups: an email is rendered in a queue worker with no
 * request context, and a template that queries is a template that fails
 * silently at 3am.
 */
export default class OrderConfirmationMail extends BaseMail {
  constructor(
    private to: string,
    private context: OrderConfirmationContext
  ) {
    super()
  }

  prepare() {
    const { context } = this

    this.message
      .to(this.to)
      .subject(context.subject)
      .htmlView('emails/order_confirmation', { ...context, title: `Order ${context.number}` })
      /**
       * A text alternative, for the same two reasons the test mail has one:
       * HTML-only messages score badly with spam filters, and plain-text
       * clients would otherwise show nothing at all.
       */
      .text(this.plainText())
  }

  private plainText(): string {
    const { context } = this
    const lines: string[] = [
      `Thank you for your order.`,
      ``,
      `Order ${context.number} is confirmed and paid.`,
      ``,
    ]

    for (const item of context.items) {
      const variant = item.variantTitle ? ` (${item.variantTitle})` : ''
      lines.push(`  ${item.title}${variant} x${item.quantity}  ${item.total}`)
    }

    lines.push(``, `Subtotal: ${context.subtotal}`)
    if (context.discount) lines.push(`Discount: -${context.discount}`)
    if (context.shipping) lines.push(`Shipping: ${context.shipping}`)
    if (context.tax) lines.push(`${context.taxLabel}: ${context.tax}`)
    lines.push(`Total: ${context.total}`)

    if (context.downloads.length > 0) {
      lines.push(``, `Your downloads:`)
      for (const file of context.downloads) {
        lines.push(`  ${file.filename}: ${file.url}`)
      }
    }

    if (context.orderUrl) {
      lines.push(
        ``,
        `View your order: ${context.orderUrl}`,
        ``,
        `Keep this email — that link is how you reach your order without an account.`
      )
    }

    return lines.join('\n')
  }
}

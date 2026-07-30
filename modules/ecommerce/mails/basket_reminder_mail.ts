import { BaseMail } from '@adonisjs/mail'
import type { OrderConfirmationLine } from '#modules/ecommerce/mails/order_confirmation_mail'

export interface BasketReminderContext {
  siteName: string
  items: OrderConfirmationLine[]
  total: string
  cartUrl: string
  /** Required. This message is marketing, so it must carry a way out. */
  unsubscribeUrl: string
  footerNote: string
  recipient: string
}

/**
 * "You left something behind."
 *
 * The only **marketing** message this module sends, and the only one that needs
 * consent. Everything else — receipts, shipment notices, download links — is
 * transactional: the buyer asked for it by buying something.
 *
 * Sets `List-Unsubscribe` as well as the in-body link. Mailbox providers
 * surface that as a native one-click opt-out, and a message without it is far
 * more likely to be reported as spam than unsubscribed from — which is the
 * outcome that damages the sending domain.
 */
export default class BasketReminderMail extends BaseMail {
  constructor(
    private to: string,
    private context: BasketReminderContext
  ) {
    super()
  }

  prepare() {
    const { context } = this

    this.message
      .to(this.to)
      .subject(`${context.siteName}: you left something in your basket`)
      .header('List-Unsubscribe', `<${context.unsubscribeUrl}>`)
      .header('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click')
      .htmlView('emails/basket_reminder', { ...context, title: 'Your basket' })
      .text(this.plainText())
  }

  private plainText(): string {
    const { context } = this
    const lines: string[] = [`You left something behind.`, ``, `Your basket is still here:`, ``]

    for (const item of context.items) {
      const variant = item.variantTitle ? ` (${item.variantTitle})` : ''
      lines.push(`  ${item.title}${variant} x${item.quantity}  ${item.total}`)
    }

    lines.push(
      ``,
      `Total: ${context.total}`,
      ``,
      `Back to your basket: ${context.cartUrl}`,
      ``,
      `Don't want these emails? Unsubscribe: ${context.unsubscribeUrl}`
    )

    return lines.join('\n')
  }
}

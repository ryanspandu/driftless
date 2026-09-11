import { BaseMail } from '@adonisjs/mail'

/**
 * The operator-editable presentation any email template can consume.
 *
 * Shared so a mail that keeps its own Edge view — the order receipt, with its
 * line items — still picks up the copy and branding an operator set, without
 * that view having to be rewritten as a string.
 */
export interface MailPresentation {
  subject: string
  heading: string
  intro: string
  buttonLabel: string
  outro: string
  logoUrl: string
  accentColor: string
}

/**
 * Everything `emails/event.edge` needs, already finished.
 *
 * The split is the point: `copy` is what an operator may rewrite, `bodyHtml`
 * and `buttonUrl` are what the service computes and the operator cannot
 * remove. A template that could drop the reset link would break the flow it
 * exists to serve.
 */
export interface EventMailContext {
  recipient: string
  siteName: string
  subject: string
  heading: string
  intro: string
  buttonLabel: string
  outro: string
  /** Absolute URL. Omit and the button is not rendered at all. */
  buttonUrl?: string
  /** Service-composed HTML placed between the button and the outro. */
  bodyHtml?: string
  logoUrl: string
  accentColor: string
  footerNote: string
  /** Plain-text alternative, composed by the caller. */
  text: string
  /**
   * A template designed in the page builder, already flattened to email HTML
   * with placeholders and the body slot substituted.
   *
   * When present it replaces the Edge view entirely. Null is the normal case
   * and also the fallback for a design that was deleted or never published —
   * a missing template must never mean a missing email.
   */
  designedHtml?: string | null
}

/**
 * One mail class for every operator-editable email.
 *
 * A class per email would mean the copy resolution, branding and text
 * alternative were written five times and drifted four ways. What differs
 * between a password reset and a receipt is the *context*, and that is built by
 * whichever service owns the event.
 */
export default class EventMail extends BaseMail {
  constructor(private context: EventMailContext) {
    super()
  }

  prepare() {
    this.message.to(this.context.recipient).subject(this.context.subject)

    if (this.context.designedHtml) {
      this.message.html(this.context.designedHtml)
    } else {
      this.message.htmlView('emails/event', { ...this.context, title: this.context.subject })
    }

    this.message
      // Never HTML-only: it scores worse with spam filters and is unreadable
      // in plain-text clients.
      .text(this.context.text)
  }
}

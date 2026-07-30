import { BaseMail } from '@adonisjs/mail'

export interface TestMailContext {
  /** Where the SMTP settings came from, echoed back so the recipient can tell. */
  source: 'database' | 'env'
  host: string
  port: number
  siteName: string
}

/**
 * The message behind the "Send test email" button in Settings → Email.
 *
 * Its only job is to prove the transport works end to end — credentials,
 * TLS negotiation, the from address being accepted by the relay. Everything it
 * reports is non-sensitive: host and port, never the username or password.
 */
export default class TestMail extends BaseMail {
  constructor(
    private to: string,
    private context: TestMailContext
  ) {
    super()
  }

  prepare() {
    this.message
      .to(this.to)
      .subject(`${this.context.siteName}: email is working`)
      .htmlView('emails/test', {
        ...this.context,
        sentAt: new Date().toUTCString(),
      })
      // A text alternative so the message is not scored as spam for being
      // HTML-only, and stays readable in plain-text clients.
      .text(
        [
          `Your email settings work.`,
          ``,
          `This is a test message from ${this.context.siteName}.`,
          `Host: ${this.context.host}:${this.context.port}`,
          `Source: ${this.context.source === 'database' ? 'Configured in the dashboard' : 'Environment variables'}`,
          ``,
          `No action is needed — you can safely delete this message.`,
        ].join('\n')
      )
  }
}

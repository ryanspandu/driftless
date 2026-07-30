import { Mailer } from '@adonisjs/mail'
import type { BaseMail } from '@adonisjs/mail'
import { SMTPTransport } from '@adonisjs/mail/transports/smtp'
import type { MessageBodyTemplates, NodeMailerMessage } from '@adonisjs/mail/types'
import emitter from '@adonisjs/core/services/emitter'
import MailSettingsService from '#services/mail_settings_service'
import type { ResolvedSmtpConfig } from '#services/mail_settings_service'
import { enqueue } from '#services/queue/registry'

/** Job name for a queued send. Handler registered in `providers/queue_provider.ts`. */
export const MAIL_SEND_JOB = 'mail.send'

/** A compiled message — plain JSON, so it survives a round trip through Redis. */
export interface CompiledMail {
  message: NodeMailerMessage
  views: MessageBodyTemplates
}

/** Raised when a send is attempted with no usable SMTP configuration. */
export class MailNotConfiguredError extends Error {
  constructor() {
    super('Email is not configured. Set SMTP details in Settings → Email.')
  }
}

/**
 * Builds and caches the transport described by the current settings.
 *
 * Cached on the resolved values rather than a timestamp so that changing any
 * setting in the admin UI takes effect on the next send, with no restart and no
 * explicit invalidation call to forget.
 */
let cached: { key: string; mailer: Mailer<SMTPTransport>; config: ResolvedSmtpConfig } | null = null

function cacheKey(config: ResolvedSmtpConfig): string {
  return [
    config.source,
    config.host,
    config.port,
    config.secure,
    config.username ?? '',
    config.password ? 'pw' : 'nopw',
    config.fromAddress,
    config.fromName,
  ].join('|')
}

/**
 * Sends mail using whichever transport the current settings describe.
 *
 * Two entry points, and the difference matters:
 *
 *  - {@link send} goes out in the caller's request. Use it when the user is
 *    waiting on the result (the "send test email" button).
 *  - {@link sendLater} hands the compiled message to the queue and returns
 *    immediately. Use it for everything else. If the queue is unavailable it
 *    falls back to sending inline rather than dropping the message — a delayed
 *    order confirmation is bad, a lost one is worse.
 */
export default class MailDispatcher {
  private settings = new MailSettingsService()

  /** The mailer for the current settings, or null when email is unconfigured. */
  private async mailer(): Promise<{
    mailer: Mailer<SMTPTransport>
    config: ResolvedSmtpConfig
  } | null> {
    const config = await this.settings.resolve()
    if (!config) return null

    const key = cacheKey(config)
    if (cached?.key === key) return { mailer: cached.mailer, config: cached.config }

    // Drop the previous transport's connection pool before replacing it.
    if (cached) {
      void cached.mailer.transport.close().catch(() => {})
    }

    const transport = new SMTPTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.username
        ? { auth: { type: 'login' as const, user: config.username, pass: config.password ?? '' } }
        : {}),
    })

    const mailer = new Mailer('smtp', transport, emitter, {
      from: { address: config.fromAddress, name: config.fromName },
    })

    // `sendLater` routes through this messenger. The compiled message is plain
    // JSON, so it round-trips through Redis without any custom serialisation.
    mailer.setMessenger({
      queue: async (mail) => {
        const queued = await enqueue(MAIL_SEND_JOB, mail satisfies CompiledMail)
        if (!queued) {
          // No worker reachable — send inline instead of losing the message.
          await mailer.sendCompiled(mail)
        }
      },
    })

    cached = { key, mailer, config }
    return { mailer, config }
  }

  /** True when a send would have somewhere to go. */
  async isConfigured(): Promise<boolean> {
    return (await this.settings.resolve()) !== null
  }

  /** Send now, in the current process. Throws on failure. */
  async send(mail: BaseMail): Promise<void> {
    const resolved = await this.mailer()
    if (!resolved) throw new MailNotConfiguredError()
    await resolved.mailer.send(mail)
  }

  /**
   * Hand off to the queue. Falls back to an inline send if the queue is down.
   *
   * Still throws when email is not configured at all: that is a deployment
   * problem the caller should surface, not something to swallow.
   */
  async sendLater(mail: BaseMail): Promise<void> {
    const resolved = await this.mailer()
    if (!resolved) throw new MailNotConfiguredError()
    await resolved.mailer.sendLater(mail)
  }

  /**
   * Deliver a message that has already been compiled — the queue worker's entry
   * point. Rebuilds the transport from current settings rather than trusting
   * anything in the payload, so a credential rotated while a job sat in the
   * queue takes effect.
   */
  async sendCompiled(payload: CompiledMail): Promise<void> {
    const resolved = await this.mailer()
    if (!resolved) throw new MailNotConfiguredError()
    await resolved.mailer.sendCompiled(payload)
  }

  /** Forget the cached transport. Only needed in tests. */
  static resetCache(): void {
    cached = null
  }
}

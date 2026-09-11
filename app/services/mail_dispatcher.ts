import { AsyncLocalStorage } from 'node:async_hooks'
import { Mailer } from '@adonisjs/mail'
import type { BaseMail } from '@adonisjs/mail'
import { SMTPTransport } from '@adonisjs/mail/transports/smtp'
import type { MessageBodyTemplates, NodeMailerMessage } from '@adonisjs/mail/types'
import emitter from '@adonisjs/core/services/emitter'
import MailSettingsService from '#services/mail_settings_service'
import type { ResolvedSmtpConfig } from '#services/mail_settings_service'
import MailEventsService from '#services/mail_events_service'
import { enqueue } from '#services/queue/registry'

const events = new MailEventsService()

/** Job name for a queued send. Handler registered in `providers/queue_provider.ts`. */
export const MAIL_SEND_JOB = 'mail.send'

/**
 * A compiled message — plain JSON, so it survives a round trip through Redis.
 *
 * `deliveryId` rides along so the worker can close the delivery row this send
 * opened. Without it the log would stop at `queued` for every successful
 * queued send, which is the opposite of what it is for.
 */
export interface CompiledMail {
  message: NodeMailerMessage
  views: MessageBodyTemplates
  deliveryId?: string | null
}

/** What a send is for, so it can be toggled off and shown in the log. */
export interface SendOptions {
  /** A key declared via `registerMailEvent`. Omit for one-off sends. */
  event?: string
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

/**
 * The delivery row a `sendLater` call opened, readable by the messenger.
 *
 * The messenger is created once per transport and shared by every send, so it
 * cannot close over one call's id — and a field on the dispatcher would be
 * overwritten by any concurrent send between awaits, closing the wrong row.
 */
const deliveryContext = new AsyncLocalStorage<{ id: string | null }>()

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
        /**
         * The delivery row id, read from the async context `sendLater`
         * established. It cannot be a field on this class: two concurrent
         * sends would overwrite each other's id between the `await`s and close
         * the wrong row. `AsyncLocalStorage` is per-call by construction.
         */
        const deliveryId = deliveryContext.getStore()?.id ?? null
        const payload: CompiledMail = { ...mail, deliveryId }

        const queued = await enqueue(MAIL_SEND_JOB, payload)
        if (queued) return

        // No worker reachable — send inline instead of losing the message.
        try {
          await mailer.sendCompiled(mail)
          await events.completeAttempt(deliveryId, 'sent')
        } catch (error) {
          await events.completeAttempt(deliveryId, 'failed', (error as Error).message)
          throw error
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
  async send(mail: BaseMail, options: SendOptions = {}): Promise<void> {
    const resolved = await this.mailer()
    if (!resolved) throw new MailNotConfiguredError()
    if (await this.suppressed(options)) return

    const attempt = await this.openAttempt(mail, options)
    try {
      await resolved.mailer.send(mail)
      await events.completeAttempt(attempt, 'sent')
    } catch (error) {
      await events.completeAttempt(attempt, 'failed', (error as Error).message)
      throw error
    }
  }

  /**
   * Hand off to the queue. Falls back to an inline send if the queue is down.
   *
   * Still throws when email is not configured at all: that is a deployment
   * problem the caller should surface, not something to swallow.
   *
   * The delivery row is left at `queued` here. It is closed by the worker, so
   * a worker that never runs leaves the row open — which is the point: a stuck
   * queue is meant to be visible in the log rather than to look like a success.
   */
  async sendLater(mail: BaseMail, options: SendOptions = {}): Promise<void> {
    const resolved = await this.mailer()
    if (!resolved) throw new MailNotConfiguredError()
    if (await this.suppressed(options)) return

    const attempt = await this.openAttempt(mail, options)
    try {
      await deliveryContext.run({ id: attempt }, async () => {
        await resolved.mailer.sendLater(mail)
      })
    } catch (error) {
      await events.completeAttempt(attempt, 'failed', (error as Error).message)
      throw error
    }
  }

  /**
   * Has an operator switched this email off?
   *
   * Checked here rather than at each call site so a new sender cannot forget
   * it. A send with no `event` is never suppressed — see
   * `MailEventsService.isEnabled`.
   */
  private async suppressed(options: SendOptions): Promise<boolean> {
    if (!options.event) return false
    return !(await events.isEnabled(options.event))
  }

  /**
   * Open a delivery row, reading the recipient and subject off the compiled
   * message so no caller has to pass them twice.
   *
   * Never throws: logging a send must not be able to prevent one.
   */
  private async openAttempt(mail: BaseMail, options: SendOptions): Promise<string | null> {
    try {
      /**
       * `build()` is what runs the mail class's `prepare()`, and until it has
       * run the message carries no recipient or subject. It is guarded by an
       * internal `built` flag, so the send below does not repeat the work.
       */
      await mail.build()

      const compiled = mail.message.toObject().message as NodeMailerMessage
      // A recipient is either a bare address string or `{ address, name }`,
      // and `to` is either one of those or a list of them.
      const first = Array.isArray(compiled.to) ? compiled.to[0] : compiled.to
      const address =
        typeof first === 'string' ? first : ((first as { address?: string } | undefined)?.address ?? '')

      return await events.recordAttempt({
        eventKey: options.event ?? null,
        toAddress: address || 'unknown',
        subject: compiled.subject ?? null,
      })
    } catch (error) {
      console.error('[mail] could not record delivery attempt', {
        error: (error as Error).message,
      })
      return null
    }
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

    const deliveryId = payload.deliveryId ?? null
    try {
      await resolved.mailer.sendCompiled(payload)
      await events.completeAttempt(deliveryId, 'sent')
    } catch (error) {
      /**
       * Closed as failed and rethrown, so BullMQ still retries. A later
       * attempt reopens the row as `sent` — the log records the outcome, not
       * every intermediate try.
       */
      await events.completeAttempt(deliveryId, 'failed', (error as Error).message)
      throw error
    }
  }

  /** Forget the cached transport. Only needed in tests. */
  static resetCache(): void {
    cached = null
  }
}

import type { ApplicationService } from '@adonisjs/core/types'
import { closeQueue, registerJobHandler } from '#services/queue/registry'

/**
 * Registers the job handlers owned by core.
 *
 * Handlers are registered rather than imported by the worker so that modules
 * can contribute their own from their `boot(app)` hook without core ever
 * importing module code — the one-way dependency rule in `docs/ai/modules.md`.
 *
 * Registration happens in every environment, not just `console`: the web
 * process needs the same map so an inline fallback can run a handler directly
 * when the queue is unavailable.
 */
export default class QueueProvider {
  constructor(protected app: ApplicationService) {}

  register() {}

  async boot() {
    const { MAIL_SEND_JOB } = await import('#services/mail_dispatcher')
    const { default: MailDispatcher } = await import('#services/mail_dispatcher')
    const dispatcher = new MailDispatcher()

    /**
     * Deliver an already-compiled message.
     *
     * Idempotent in the sense that matters here: re-running it re-sends the
     * message. Duplicate delivery is the acceptable failure mode for email —
     * the alternative, dropping a receipt, is worse — but it is why no handler
     * that changes money state should ever live behind a mail job.
     */
    registerJobHandler(MAIL_SEND_JOB, async (payload) => {
      await dispatcher.sendCompiled(payload as never)
    })

    /**
     * Close the producer's Redis socket on shutdown.
     *
     * Without this the process does not exit on SIGTERM at all: `getQueue()`
     * opens its own ioredis connection through `queueConnection()`, and an open
     * socket keeps the event loop alive indefinitely. Adonis's own
     * `RedisProvider.shutdown()` does not cover it — that only calls `quitAll()`
     * on the container's `redis` binding, which has no knowledge of a connection
     * BullMQ constructed for itself.
     *
     * Everything downstream of shutdown depends on this: a restart that never
     * completes is worse than no restart mechanism at all, because the
     * supervisor eventually SIGKILLs and in-flight requests die with it.
     */
    this.app.terminating(async () => {
      await closeQueue()
    })
  }
}

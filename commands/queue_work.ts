/**
 * Runs the BullMQ worker that drains the background job queue.
 *
 * Usage:  node ace queue:work
 *         node ace queue:work --concurrency=10
 *
 * In production this is a second long-running process alongside `npm start`.
 * The app degrades safely without it — every money-affecting transition is
 * committed synchronously by whichever process observed it, and the reconcile
 * sweeps re-drive anything the queue was holding — but emails and webhook
 * follow-up work sit undelivered until a worker comes back.
 */
import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { startWorker } from '#services/queue/worker'
import { registeredJobNames } from '#services/queue/registry'

export default class QueueWork extends BaseCommand {
  static commandName = 'queue:work'
  static description = 'Process background jobs from the queue'

  /**
   * `startApp: true` is what makes this usable: handlers are registered by the
   * app's providers and by each enabled module's `boot()` hook, so the worker
   * needs a fully booted container — the same one an HTTP request gets.
   *
   * `staysAlive: true` keeps the process running after `run()` resolves.
   */
  static options: CommandOptions = { startApp: true, staysAlive: true }

  @flags.number({ description: 'How many jobs to process at once (default 5)' })
  declare concurrency?: number

  async run() {
    const names = registeredJobNames()
    this.logger.info(`Handlers: ${names.length ? names.join(', ') : '(none registered)'}`)

    if (names.length === 0) {
      this.logger.warning(
        'No job handlers are registered. Jobs will fail rather than be silently dropped.'
      )
    }

    const worker = startWorker({
      concurrency: this.concurrency,
      onEvent: ({ level, message }) => {
        if (level === 'error') this.logger.error(message)
        else this.logger.info(message)
      },
    })

    this.logger.success(`Worker started (concurrency ${this.concurrency ?? 5}). Ctrl-C to stop.`)

    /**
     * Drain in-flight jobs before exiting so a deploy does not abandon work
     * mid-flight. `worker.close()` stops accepting new jobs and waits for the
     * active ones.
     */
    const shutdown = async () => {
      this.logger.info('Shutting down — waiting for in-flight jobs…')
      await worker.close()
      await this.app.terminate()
    }

    this.app.terminating(async () => {
      await worker.close()
    })

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  }
}

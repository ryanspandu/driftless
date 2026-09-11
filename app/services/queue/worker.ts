import { Worker } from 'bullmq'
import type { Job } from 'bullmq'
import { queueConnection } from '#services/queue/connection'
import { QUEUE_NAME, getJobHandler, registeredJobNames } from '#services/queue/registry'

export interface WorkerOptions {
  /** How many jobs run at once in this process. */
  concurrency?: number
  /** Called for each terminal outcome, so the ace command can report progress. */
  onEvent?: (event: { level: 'info' | 'error'; message: string }) => void
}

/**
 * Start a BullMQ worker in the current process.
 *
 * Handlers are looked up at run time from the registry, which the application's
 * providers and modules populate at boot. An unknown job name is treated as a
 * hard failure rather than a silent success: it means the worker is running
 * older code than whatever enqueued the job, and swallowing it would drop real
 * work.
 */
export function startWorker(options: WorkerOptions = {}): Worker {
  const emit = options.onEvent ?? (() => {})

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const handler = getJobHandler(job.name)
      if (!handler) {
        throw new Error(
          `No handler registered for job "${job.name}". Known jobs: ${registeredJobNames().join(', ') || '(none)'}`
        )
      }
      await handler(job.data as never)
    },
    {
      connection: queueConnection(),
      concurrency: options.concurrency ?? 5,
    }
  )

  worker.on('completed', (job) => {
    emit({ level: 'info', message: `completed ${job.name} (${job.id})` })
  })

  worker.on('failed', (job, error) => {
    const attempts = job ? `${job.attemptsMade}/${job.opts.attempts ?? 1}` : '?'
    emit({
      level: 'error',
      message: `failed ${job?.name ?? 'unknown'} (${job?.id ?? '?'}) attempt ${attempts}: ${error.message}`,
    })
  })

  worker.on('error', (error) => {
    // Connection-level problems. BullMQ reconnects on its own; log and carry on
    // rather than tearing the process down, so a brief Redis blip does not
    // require a restart.
    emit({ level: 'error', message: `worker error: ${error.message}` })
  })

  return worker
}

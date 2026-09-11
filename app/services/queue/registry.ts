import { Queue } from 'bullmq'
import type { JobsOptions } from 'bullmq'
import { queueConnection, queueEnabled } from '#services/queue/connection'

/**
 * The single queue every background job goes through.
 *
 * One queue with namespaced job names (`mail.send`, `ecommerce.webhook.process`)
 * rather than one queue per concern: a single worker process is far easier to
 * deploy and reason about, and BullMQ's per-job concurrency already stops one
 * slow job type from blocking the rest. Split it only if a real starvation
 * problem shows up.
 */
export const QUEUE_NAME = 'driftless'

/**
 * A job handler. Receives the payload it was enqueued with.
 *
 * Handlers **must be idempotent**. BullMQ retries on failure, a job can be
 * delivered more than once after a worker crash, and the reconcile sweeps
 * re-drive work the queue may have already done. Running a handler twice must
 * leave the same state as running it once.
 */
export type JobHandler<TPayload = unknown> = (payload: TPayload) => Promise<void>

/**
 * Handlers are registered at boot rather than imported here, because core code
 * must never import a module (`docs/ai/modules.md`). A module registers its own
 * handlers from its `boot(app)` hook; core registers its own from a provider.
 */
const handlers = new Map<string, JobHandler<never>>()

export function registerJobHandler<TPayload>(name: string, handler: JobHandler<TPayload>): void {
  if (handlers.has(name)) {
    throw new Error(`Job handler "${name}" is already registered`)
  }
  handlers.set(name, handler as JobHandler<never>)
}

export function getJobHandler(name: string): JobHandler<never> | undefined {
  return handlers.get(name)
}

export function registeredJobNames(): string[] {
  return [...handlers.keys()].sort()
}

/**
 * Default retry policy.
 *
 * Five attempts with exponential backoff spans roughly ten minutes, which
 * covers the failure modes worth retrying automatically (a brief SMTP outage, a
 * gateway API blip). Anything still failing after that is a real problem and
 * belongs in the failed set where a human can see it, not in an infinite loop.
 *
 * Completed jobs are kept briefly and failures for a week so the admin failed-job
 * view has something to show.
 */
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 3_600 },
}

let queue: Queue | null = null

/** Lazily constructed so importing this module never opens a socket. */
export function getQueue(): Queue | null {
  if (!queueEnabled()) return null
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: queueConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    })
  }
  return queue
}

/**
 * Hand work to the queue.
 *
 * **Never throws, and never fails the caller.** The queue is an accelerator,
 * not the source of truth: a payment that has been recorded is recorded whether
 * or not its confirmation email got scheduled. Letting a Redis outage turn a
 * successful charge into a 500 would be far worse than a delayed email — the
 * client would retry and we would risk charging twice.
 *
 * Returns whether the job was actually queued, so callers that have a synchronous
 * fallback can take it.
 */
export async function enqueue(
  name: string,
  payload: unknown,
  options: JobsOptions = {}
): Promise<boolean> {
  try {
    const q = getQueue()
    if (!q) return false
    await q.add(name, payload, options)
    return true
  } catch (error) {
    console.error('[queue] enqueue failed — work deferred to reconcile sweep', {
      job: name,
      error: (error as Error).message,
    })
    return false
  }
}

/** Close the queue's Redis connection. Called on process shutdown only. */
export async function closeQueue(): Promise<void> {
  if (!queue) return
  await queue.close()
  queue = null
}

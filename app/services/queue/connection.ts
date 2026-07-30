import env from '#start/env'
import type { ConnectionOptions } from 'bullmq'

/**
 * Redis connection options for BullMQ.
 *
 * Built from env rather than reusing the `@adonisjs/redis` client, because
 * BullMQ requires `maxRetriesPerRequest: null` on any connection it uses for
 * blocking commands (`BZPOPMIN` and friends). Handing it the app's shared
 * client would either break the worker or force that setting onto the rate
 * limiter, which does not want it.
 *
 * `db: 1` keeps job data off the limiter's keyspace, so flushing one never
 * takes the other with it.
 */
export function queueConnection(): ConnectionOptions {
  const password = env.get('REDIS_PASSWORD', '')

  return {
    host: env.get('REDIS_HOST', '127.0.0.1'),
    port: env.get('REDIS_PORT', 6379),
    ...(password ? { password } : {}),
    db: 1,
    // Required by BullMQ for blocking operations.
    maxRetriesPerRequest: null,
  }
}

/** True when the deployment has opted into running a queue at all. */
export function queueEnabled(): boolean {
  return env.get('QUEUE_ENABLED', 'true') !== 'false'
}

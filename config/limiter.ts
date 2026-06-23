import env from '#start/env'
import { defineConfig, stores } from '@adonisjs/limiter'
import type { InferLimiters } from '@adonisjs/limiter/types'

/**
 * Rate limiter configuration. Default store is driven by `LIMITER_STORE`
 * (`redis` in dev/prod; `memory` is handy for tests / no-Redis environments).
 */
const limiterConfig = defineConfig({
  default: env.get('LIMITER_STORE'),

  stores: {
    /** Redis-backed store (uses the `main` connection from config/redis.ts). */
    redis: stores.redis({ connectionName: 'main' }),

    /** In-memory store — per-process only; fine for tests. */
    memory: stores.memory({}),
  },
})

export default limiterConfig

declare module '@adonisjs/limiter/types' {
  export interface LimitersList extends InferLimiters<typeof limiterConfig> {}
}

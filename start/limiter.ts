import limiter from '@adonisjs/limiter/services/main'

/**
 * Throttle for the external API (`/api/v1/*`). Keyed by access-token id so each
 * token gets its own budget; falls back to client IP for the (already-rejected)
 * unauthenticated case. Backed by the configured limiter store (Redis).
 *
 * Applied after the `api` auth guard so the current token is resolvable.
 *
 * The builder is cast to `define`'s parameter type: the limiter service's store
 * generic can resolve to `never` under the project-references typecheck (a typing
 * quirk), which would otherwise reject the (runtime-correct) builder.
 */
export const apiV1Throttle = limiter.define(
  'api_v1',
  ((ctx) => {
    const token = (
      ctx.auth?.user as { currentAccessToken?: { identifier: string | number } } | undefined
    )?.currentAccessToken
    const max = token ? 120 : 30
    const key = token ? `v1_token_${token.identifier}` : `v1_ip_${ctx.request.ip()}`
    return limiter.allowRequests(max).every('1 minute').usingKey(key)
  }) as Parameters<typeof limiter.define>[1]
)

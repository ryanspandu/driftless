import type { HttpContext } from '@adonisjs/core/http'
import limiter from '@adonisjs/limiter/services/main'

/**
 * Rate limiter for the MCP builder-API, built **lazily** — never at module
 * scope.
 *
 * `modules/registry.ts` is imported during provider boot, which drags every
 * module's `routes.ts` in with it. `@adonisjs/limiter/services/main` only
 * resolves once the app has finished booting, so a top-level `limiter.define()`
 * in that import chain runs against an undefined service and throws. Building it
 * inside `registerRoutes()` (called from the post-boot `start/routes.ts`
 * preload) is safe. Memoised because `define()` registers a named limiter.
 *
 * Mirrors `apiV1Throttle`: 120 req/min per token, 30/min for the (rare)
 * unauthenticated miss, keyed by the access-token identifier.
 */
type LimiterBuilder = Parameters<typeof limiter.define>[1]

function tokenIdentifier(ctx: HttpContext): string | number | undefined {
  const user = ctx.auth?.user as
    | { currentAccessToken?: { identifier: string | number } }
    | undefined
  return user?.currentAccessToken?.identifier
}

let cache: ReturnType<typeof limiter.define> | null = null

export function mcpThrottle() {
  if (cache) return cache
  cache = limiter.define('mcp_builder_api', ((ctx) => {
    const id = tokenIdentifier(ctx)
    const max = id ? 120 : 30
    const key = id ? `mcp_token_${id}` : `mcp_ip_${ctx.request.ip()}`
    return limiter.allowRequests(max).every('1 minute').usingKey(key)
  }) as LimiterBuilder)
  return cache
}

let rpcCache: ReturnType<typeof limiter.define> | null = null

/**
 * Limiter for the JSON-RPC transport hop (`/api/mcp/v1/rpc`) — in its OWN bucket,
 * NOT the builder-API one. Each tool call is one RPC request that then forwards
 * one builder-API request; sharing a bucket counted every call twice and halved
 * the documented 120/min budget. This bucket only guards the transport itself
 * (initialize/tools-list handshakes + the forward hop); the forwarded call is
 * still separately limited by `mcpThrottle` where the real work happens.
 */
export function mcpRpcThrottle() {
  if (rpcCache) return rpcCache
  rpcCache = limiter.define('mcp_rpc', ((ctx) => {
    const id = tokenIdentifier(ctx)
    const max = id ? 240 : 30
    const key = id ? `mcp_rpc_token_${id}` : `mcp_rpc_ip_${ctx.request.ip()}`
    return limiter.allowRequests(max).every('1 minute').usingKey(key)
  }) as LimiterBuilder)
  return rpcCache
}

let writeCache: ReturnType<typeof limiter.define> | null = null

/**
 * A stricter, **write-only** limiter layered on top of the overall one.
 *
 * Reads (GET/HEAD) return no limiter, so this middleware skips them entirely
 * (the throttle middleware calls `next()` when its builder returns nothing) —
 * only mutations (POST/PUT/PATCH/DELETE) are counted, at a much lower budget
 * than the overall cap. A leaked token can still read broadly but cannot use
 * the whole minute's budget to create, publish or delete in bulk. Keyed by the
 * same token identifier, in its own `mcp_write_*` bucket.
 */
export function mcpWriteThrottle() {
  if (writeCache) return writeCache
  writeCache = limiter.define('mcp_builder_write', ((ctx) => {
    const method = ctx.request.method().toUpperCase()
    if (method === 'GET' || method === 'HEAD') return undefined // reads: not limited here
    const id = tokenIdentifier(ctx)
    const max = id ? 30 : 10
    const key = id ? `mcp_write_token_${id}` : `mcp_write_ip_${ctx.request.ip()}`
    return limiter.allowRequests(max).every('1 minute').usingKey(key)
  }) as LimiterBuilder)
  return writeCache
}

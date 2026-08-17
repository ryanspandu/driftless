import limiter from '@adonisjs/limiter/services/main'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Rate limiters.
 *
 * Every builder is cast to `define`'s parameter type: the limiter service's
 * store generic can resolve to `never` under the project-references typecheck
 * (a typing quirk), which would otherwise reject the (runtime-correct) builder.
 *
 * A note on keys: these are only as trustworthy as `request.ip()`. Behind a
 * proxy or load balancer that means `http.trustProxy` in `config/app.ts` must
 * be configured for the real topology, otherwise every request shares the
 * balancer's address and IP-keyed limits are worthless.
 */
type LimiterBuilder = Parameters<typeof limiter.define>[1]

/** Lower-cased email from the request body, used to key per-account limits. */
function emailKey(ctx: HttpContext): string {
  const raw = ctx.request.input('email')
  return typeof raw === 'string' ? raw.trim().toLowerCase().slice(0, 254) : 'anonymous'
}

/**
 * Throttle for the external API (`/api/v1/*`). Keyed by access-token id so each
 * token gets its own budget; falls back to client IP for the (already-rejected)
 * unauthenticated case. Backed by the configured limiter store (Redis).
 *
 * Applied after the `api` auth guard so the current token is resolvable.
 */
export const apiV1Throttle = limiter.define('api_v1', ((ctx) => {
  const token = (
    ctx.auth?.user as { currentAccessToken?: { identifier: string | number } } | undefined
  )?.currentAccessToken
  const max = token ? 120 : 30
  const key = token ? `v1_token_${token.identifier}` : `v1_ip_${ctx.request.ip()}`
  return limiter.allowRequests(max).every('1 minute').usingKey(key)
}) as LimiterBuilder)

/**
 * Broad per-IP budget shared by every credential endpoint (login, register,
 * OAuth callback). Stops one host hammering the auth surface even when it
 * rotates the email on each attempt.
 */
export const authIpThrottle = limiter.define('auth_ip', ((ctx) =>
  limiter
    .allowRequests(30)
    .every('5 minutes')
    .usingKey(`auth_ip_${ctx.request.ip()}`)) as LimiterBuilder)

/**
 * Per-account budget for password login. Applied *in addition to*
 * `authIpThrottle` so a distributed attempt against a single account is capped
 * even when each request arrives from a different address.
 */
export const loginAccountThrottle = limiter.define('auth_login_account', ((ctx) =>
  limiter
    .allowRequests(8)
    .every('15 minutes')
    .usingKey(`login_acct_${emailKey(ctx)}`)) as LimiterBuilder)

/**
 * Registration is deliberately tighter than login: there is no legitimate
 * reason to create accounts in bursts, and each attempt costs a scrypt hash.
 */
export const registerThrottle = limiter.define('auth_register', ((ctx) =>
  limiter
    .allowRequests(5)
    .every('1 hour')
    .usingKey(`register_ip_${ctx.request.ip()}`)) as LimiterBuilder)

/**
 * Password reset requests, per IP.
 *
 * Each one sends an email to an address the requester chose, so an unlimited
 * endpoint is a free way to flood someone else's inbox from our domain — and
 * to burn our sending reputation doing it.
 */
export const forgotPasswordIpThrottle = limiter.define('auth_forgot_ip', ((ctx) =>
  limiter
    .allowRequests(5)
    .every('1 hour')
    .usingKey(`forgot_ip_${ctx.request.ip()}`)) as LimiterBuilder)

/**
 * Password reset requests, per target address.
 *
 * Caps how many mails one mailbox can be made to receive even when the requests
 * come from many hosts. `emailKey` reads the `email` field, which is exactly
 * what this form posts — unlike the login form, whose field is named `login`
 * (see the note on `loginAccountThrottle`).
 */
export const forgotPasswordAccountThrottle = limiter.define('auth_forgot_account', ((ctx) =>
  limiter
    .allowRequests(3)
    .every('1 hour')
    .usingKey(`forgot_acct_${emailKey(ctx)}`)) as LimiterBuilder)

/**
 * Installing a module and applying migrations — the two operations that run a
 * build on the production box and restart the site.
 *
 * Keyed by **user id, not IP**. The actor is authenticated by the time this
 * runs, and per the note at the top of this file an IP key is worthless unless
 * `http.trustProxy` matches the deployment's topology. A user id is a fact.
 *
 * Three an hour is generous for an operator — installing four modules in an
 * hour is not a workflow — and ruinous for anything else. That ceiling matters
 * more than usual here: `module:install` is held by ADMIN, so the blast radius
 * of one compromised admin account includes running a build on the server.
 *
 * Applied to the POSTs only. The job-status endpoint is polled every two
 * seconds by design and must never 429.
 */
export const moduleInstallThrottle = limiter.define('module_install', ((ctx) => {
  const userId = (ctx.auth?.user as { id?: number | string } | undefined)?.id
  return limiter
    .allowRequests(3)
    .every('1 hour')
    .usingKey(`module_install_user_${userId ?? ctx.request.ip()}`)
}) as LimiterBuilder)

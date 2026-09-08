import limiter from '@adonisjs/limiter/services/main'

/**
 * Rate limiters for this module's public endpoints.
 *
 * Built **lazily**, not at module scope, and that is load-bearing.
 *
 * `modules/registry.ts` is imported during provider boot (by
 * `providers/modules_provider.ts`), which drags every module manifest — and so
 * every module's `routes.ts` — in with it. `@adonisjs/limiter/services/main`
 * only resolves its binding once the application has finished booting, so a
 * top-level `limiter.define(...)` in that import chain runs against an
 * undefined service and throws `Cannot read properties of undefined`.
 *
 * `registerRoutes()` is called from the `start/routes.ts` preload, which runs
 * after boot, so building them there is safe. Each is memoised because
 * `define()` registers a named limiter and calling it twice with the same name
 * is not something to rely on.
 */
type LimiterBuilder = Parameters<typeof limiter.define>[1]
type Throttle = ReturnType<typeof limiter.define>

/**
 * Cookie names used for per-buyer throttle keys. Inlined (not imported) to keep
 * this file — loaded during route registration — free of the service modules
 * those consts live in. Kept in sync with `CART_COOKIE` in `cart_service.ts` and
 * `ACCOUNT_SESSION_COOKIE` in `account_auth_service.ts`.
 */
const CART_COOKIE = 'dl_cart'
const SHOP_SESSION_COOKIE = 'dl_shop'

/** Lower-cased email from the request body, to key per-account limits. */
function emailKey(ctx: { request: { input(k: string): unknown } }): string {
  const raw = ctx.request.input('email')
  return typeof raw === 'string' ? raw.trim().toLowerCase().slice(0, 254) : 'anonymous'
}

let cache: {
  webhook: Throttle
  checkout: Throttle
  checkoutByCart: Throttle
  discountCheck: Throttle
  storefront: Throttle
  cartWrite: Throttle
  accountAuth: Throttle
  accountAuthByEmail: Throttle
  accountSecurity: Throttle
  download: Throttle
} | null = null

export function ecommerceThrottles() {
  if (cache) return cache

  cache = {
    /**
     * Webhooks. Generous, because a busy store legitimately receives bursts and
     * a rejected delivery costs a retry cycle — but bounded, because this is an
     * unauthenticated endpoint that does database work. Signature verification
     * rejects forgeries long before they reach anything expensive.
     */
    webhook: limiter.define('ecommerce_webhook', ((ctx) =>
      limiter
        .allowRequests(300)
        .every('1 minute')
        .usingKey(`webhook_${ctx.request.ip()}`)) as LimiterBuilder),

    /**
     * Checkout. Tight: each call creates an order, reserves stock and opens a
     * gateway session — the most expensive unauthenticated action in the app,
     * and the one whose abuse denies real buyers their stock.
     */
    checkout: limiter.define('ecommerce_checkout', ((ctx) =>
      limiter
        .allowRequests(8)
        .every('1 minute')
        .usingKey(`checkout_${ctx.request.ip()}`)) as LimiterBuilder),

    /**
     * Checkout, per **cart cookie** — a second axis alongside the per-IP limit.
     * A card-testing bot that rotates its IP no longer multiplies its attempts
     * for free: it must also discard its basket each time. Bounded like the IP
     * limit; a real buyer never opens eight checkouts a minute on one basket.
     * Falls back to the IP when no cart cookie is present.
     */
    checkoutByCart: limiter.define('ecommerce_checkout_cart', ((ctx) =>
      limiter
        .allowRequests(8)
        .every('1 minute')
        .usingKey(
          `checkout_cart_${ctx.request.cookie(CART_COOKIE) ?? ctx.request.ip()}`
        )) as LimiterBuilder),

    /** Discount validation — the brute-force surface for guessing codes. */
    discountCheck: limiter.define('ecommerce_discount_check', ((ctx) =>
      limiter
        .allowRequests(10)
        .every('1 minute')
        .usingKey(`discount_${ctx.request.ip()}`)) as LimiterBuilder),

    /** Read-only storefront browsing. */
    storefront: limiter.define('ecommerce_storefront', ((ctx) =>
      limiter
        .allowRequests(120)
        .every('1 minute')
        .usingKey(`shop_${ctx.request.ip()}`)) as LimiterBuilder),

    /**
     * Cart writes. Each one inserts or updates a row against an unauthenticated
     * caller, so cart-flooding is the cheapest way to fill a table.
     */
    cartWrite: limiter.define('ecommerce_cart_write', ((ctx) =>
      limiter
        .allowRequests(60)
        .every('1 minute')
        .usingKey(`cart_${ctx.request.ip()}`)) as LimiterBuilder),

    /**
     * Storefront login and registration. Each attempt costs a scrypt hash — on
     * both the hit and the miss path, deliberately — so this is also the
     * credential-stuffing surface.
     */
    accountAuth: limiter.define('ecommerce_account_auth', ((ctx) =>
      limiter
        .allowRequests(10)
        .every('15 minutes')
        .usingKey(`shopauth_${ctx.request.ip()}`)) as LimiterBuilder),

    /**
     * Storefront login/register, per **email** — the per-account axis the admin
     * side has (`loginAccountThrottle`) and the storefront lacked. Applied on
     * top of the per-IP `accountAuth`, so a single target account cannot be
     * brute-forced from a rotating set of IPs. The login and register forms both
     * post `email`, so the key resolves cleanly.
     */
    accountAuthByEmail: limiter.define('ecommerce_account_auth_email', ((ctx) =>
      limiter
        .allowRequests(8)
        .every('15 minutes')
        .usingKey(`shopauth_email_${emailKey(ctx)}`)) as LimiterBuilder),

    /**
     * Sensitive authenticated account actions that re-verify the password —
     * changing the password and disabling 2FA. Keyed by the **session cookie**
     * (not IP): the attack this guards is an already-hijacked session brute
     * forcing the current password, and the session cookie is exactly the
     * victim it should be capped against — an attacker cannot rotate it the way
     * they rotate an IP. Falls back to IP if the cookie is somehow absent.
     */
    accountSecurity: limiter.define('ecommerce_account_security', ((ctx) =>
      limiter
        .allowRequests(5)
        .every('15 minutes')
        .usingKey(
          `shopsec_${ctx.request.cookie(SHOP_SESSION_COOKIE) ?? ctx.request.ip()}`
        )) as LimiterBuilder),

    /**
     * Download redemption.
     *
     * Keyed by IP rather than by token, on purpose: a per-token limit would do
     * nothing against someone walking the token space, which is the attack this
     * is actually for. Set high enough that a buyer retrying a dropped
     * connection on a large file never notices it.
     */
    download: limiter.define('ecommerce_download', ((ctx) =>
      limiter
        .allowRequests(30)
        .every('1 minute')
        .usingKey(`download_${ctx.request.ip()}`)) as LimiterBuilder),
  }

  return cache
}

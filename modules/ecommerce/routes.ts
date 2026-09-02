import type { HttpRouterService } from '@adonisjs/core/types'
import type { NamedMiddleware } from '#modules/types'

/**
 * Route registration for the e-commerce module.
 *
 * Two conventions worth knowing before editing:
 *
 * 1. **Every route carries an explicit `.as()` name.** Adonis derives a route's
 *    name from the lazy-controller variable, so two modules that both wrote
 *    `const Ctrl = …` would collide on `ctrl.page` and the router would refuse
 *    to boot. Names here are namespaced `ecommerce.*`.
 *
 * 2. **Page routes gate with `pagePermission`, API routes with `permission`.**
 *    `permission` always answers JSON, which is right for `/api` and wrong for
 *    a browser navigation; `pagePermission` 404s instead. Admin pages that deal
 *    with money should not be loadable at all by someone without the rights,
 *    not merely empty once loaded.
 */
import { ecommerceThrottles } from '#modules/ecommerce/throttles'

const ProductsCtrl = () => import('#modules/ecommerce/controllers/admin/products_controller')
const WebhooksCtrl = () => import('#modules/ecommerce/controllers/webhooks_controller')
const CategoriesCtrl = () => import('#modules/ecommerce/controllers/admin/categories_controller')
const SettingsCtrl = () => import('#modules/ecommerce/controllers/admin/settings_controller')
const DashboardCtrl = () => import('#modules/ecommerce/controllers/admin/dashboard_controller')
const OrdersCtrl = () => import('#modules/ecommerce/controllers/admin/orders_controller')
const GatewaysCtrl = () => import('#modules/ecommerce/controllers/admin/gateways_controller')
const ShopCatalogCtrl = () => import('#modules/ecommerce/controllers/storefront/catalog_controller')
const ShopGeoCtrl = () => import('#modules/ecommerce/controllers/storefront/geo_controller')
const ShopCartCtrl = () => import('#modules/ecommerce/controllers/storefront/cart_controller')
const ShopCheckoutCtrl = () =>
  import('#modules/ecommerce/controllers/storefront/checkout_controller')
const ShopAccountCtrl = () => import('#modules/ecommerce/controllers/storefront/account_controller')
const ShopPagesCtrl = () => import('#modules/ecommerce/controllers/storefront/pages_controller')
const MarketingCtrl = () => import('#modules/ecommerce/controllers/admin/marketing_controller')
const ReferralCtrl = () => import('#modules/ecommerce/controllers/storefront/referral_controller')
const DigitalCtrl = () => import('#modules/ecommerce/controllers/admin/digital_controller')
const ExportsCtrl = () => import('#modules/ecommerce/controllers/admin/exports_controller')
const CustomersCtrl = () => import('#modules/ecommerce/controllers/admin/customers_controller')
const ShopDownloadCtrl = () =>
  import('#modules/ecommerce/controllers/storefront/download_controller')

export function registerRoutes(router: HttpRouterService, middleware: NamedMiddleware) {
  const moduleEnabled = middleware.moduleEnabled({ name: 'ecommerce' })
  // Safe here: this runs from the `start/routes.ts` preload, after boot.
  const throttle = ecommerceThrottles()

  /**
   * ── Payment webhooks ──────────────────────────────────────────────────────
   *
   * Unauthenticated by necessity: the gateway has no session. The signature
   * over the raw body is the authentication, verified in the controller.
   *
   * Deliberately **not** behind `moduleEnabled`. A store that is switched off
   * mid-flight may still have money in transit, and refusing those deliveries
   * would lose the record of payments that were actually taken — the events are
   * recorded either way and reconciled when the module comes back.
   *
   * CSRF-exempt via the predicate in `config/shield.ts`.
   */
  router
    .post('/api/webhooks/stripe', [WebhooksCtrl, 'stripe'])
    .as('ecommerce.webhooks.stripe')
    .use(throttle.webhook)

  router
    .post('/api/webhooks/paypal', [WebhooksCtrl, 'paypal'])
    .as('ecommerce.webhooks.paypal')
    .use(throttle.webhook)

  /**
   * ── Storefront API ────────────────────────────────────────────────────────
   *
   * Unauthenticated, throttled, and behind `moduleEnabled` — a disabled store
   * must not keep taking orders. Every payload here comes from a DTO built
   * specifically for the storefront rather than filtered from an admin one, so
   * cost price, raw stock counts and internal notes cannot leak.
   *
   * CSRF still applies: these are cookie-bearing browser requests, and the
   * shared axios client already sends the token.
   */
  router
    .group(() => {
      router.get('/api/shop/products', [ShopCatalogCtrl, 'index']).as('shop.products.index')
      router.get('/api/shop/products/:slug', [ShopCatalogCtrl, 'show']).as('shop.products.show')
      router.get('/api/shop/categories', [ShopCatalogCtrl, 'categories']).as('shop.categories')
      /**
       * The address pickers' city lists. Static files the module carries, not
       * an API — served here rather than from `public/` so the module stays one
       * self-contained folder.
       */
      router.get('/api/shop/geo/cities', [ShopGeoCtrl, 'index']).as('shop.geo.index')
      router.get('/api/shop/geo/cities/:code', [ShopGeoCtrl, 'cities']).as('shop.geo.cities')
      // Live stock for statically rendered pages — the one thing an SSG
      // snapshot must never bake in.
      router
        .post('/api/shop/availability', [ShopCatalogCtrl, 'availability'])
        .as('shop.availability')
      router.get('/api/shop/cart', [ShopCartCtrl, 'show']).as('shop.cart.show')
      router.get('/api/shop/me', [ShopAccountCtrl, 'me']).as('shop.me')
      router.get('/api/shop/order', [ShopCheckoutCtrl, 'status']).as('shop.order.status')
      router
        .get('/api/shop/checkout/config', [ShopCheckoutCtrl, 'config'])
        .as('shop.checkout.config')
    })
    .use(throttle.storefront)
    .use(moduleEnabled)

  router
    .group(() => {
      router.post('/api/shop/cart/items', [ShopCartCtrl, 'add']).as('shop.cart.add')
      router.put('/api/shop/cart/items', [ShopCartCtrl, 'update']).as('shop.cart.update')
      router
        .delete('/api/shop/cart/items/:variantId', [ShopCartCtrl, 'destroy'])
        .as('shop.cart.remove')
      router.delete('/api/shop/cart', [ShopCartCtrl, 'clear']).as('shop.cart.clear')
      router
        .post('/api/shop/cart/discount', [ShopCartCtrl, 'applyDiscount'])
        .as('shop.cart.discount.apply')
      router
        .delete('/api/shop/cart/discount', [ShopCartCtrl, 'removeDiscount'])
        .as('shop.cart.discount.remove')
    })
    .use(throttle.cartWrite)
    .use(moduleEnabled)

  /**
   * Checkout is the most expensive unauthenticated action in the app: it
   * creates an order, reserves stock and opens a gateway session. Its abuse
   * denies real buyers their stock, so it gets the tightest limit.
   */
  router
    .post('/api/shop/checkout', [ShopCheckoutCtrl, 'start'])
    .as('shop.checkout')
    .use(throttle.checkout)
    .use(moduleEnabled)

  router
    .group(() => {
      router
        .post('/api/shop/account/register', [ShopAccountCtrl, 'register'])
        .as('shop.account.register')
      router.post('/api/shop/account/login', [ShopAccountCtrl, 'login']).as('shop.account.login')
      // Second factor of login — same IP limit as the password step.
      router
        .post('/api/shop/account/2fa/verify', [ShopAccountCtrl, 'verify2fa'])
        .as('shop.account.two_factor.verify')
    })
    .use(throttle.accountAuth)
    .use(moduleEnabled)

  router
    .group(() => {
      router.post('/api/shop/account/logout', [ShopAccountCtrl, 'logout']).as('shop.account.logout')
      router.get('/api/shop/account/orders', [ShopAccountCtrl, 'orders']).as('shop.account.orders')
      router
        .get('/api/shop/account/orders/:number', [ShopAccountCtrl, 'orderDetail'])
        .as('shop.account.order')
      router
        .get('/api/shop/account/orders/:number/downloads/:grantId', [
          ShopAccountCtrl,
          'downloadOrderFile',
        ])
        .as('shop.account.order.download')
      router
        .put('/api/shop/account/profile', [ShopAccountCtrl, 'updateProfile'])
        .as('shop.account.profile')
      router
        .put('/api/shop/account/password', [ShopAccountCtrl, 'changePassword'])
        .as('shop.account.password')
      router
        .get('/api/shop/account/addresses', [ShopAccountCtrl, 'addresses'])
        .as('shop.account.addresses')
      router
        .post('/api/shop/account/addresses', [ShopAccountCtrl, 'createAddress'])
        .as('shop.account.addresses.create')
      router
        .put('/api/shop/account/addresses/:id', [ShopAccountCtrl, 'updateAddress'])
        .as('shop.account.addresses.update')
      router
        .delete('/api/shop/account/addresses/:id', [ShopAccountCtrl, 'deleteAddress'])
        .as('shop.account.addresses.delete')
      // Affiliate program (apply, analytics, payout method, withdrawals).
      router
        .get('/api/shop/account/affiliate', [ShopAccountCtrl, 'affiliateOverview'])
        .as('shop.account.affiliate.overview')
      router
        .post('/api/shop/account/affiliate/apply', [ShopAccountCtrl, 'applyAffiliate'])
        .as('shop.account.affiliate.apply')
      router
        .put('/api/shop/account/affiliate/payout-method', [ShopAccountCtrl, 'updatePayoutMethod'])
        .as('shop.account.affiliate.payout')
      router
        .post('/api/shop/account/affiliate/withdrawals', [ShopAccountCtrl, 'requestWithdrawal'])
        .as('shop.account.affiliate.withdraw')

      // Self-service 2FA management for the signed-in customer.
      router
        .post('/api/shop/account/2fa/enroll', [ShopAccountCtrl, 'enroll2fa'])
        .as('shop.account.two_factor.enroll')
      router
        .post('/api/shop/account/2fa/confirm', [ShopAccountCtrl, 'confirm2fa'])
        .as('shop.account.two_factor.confirm')
      router
        .post('/api/shop/account/2fa/disable', [ShopAccountCtrl, 'disable2fa'])
        .as('shop.account.two_factor.disable')
    })
    .use(throttle.storefront)
    .use(moduleEnabled)

  /**
   * Referral links and discount checks.
   *
   * `/ref/:code` always redirects, even for an unknown code — a 404 would tell
   * whoever is probing which codes exist. The discount check gets the tightest
   * limit in the app: it is the brute-force surface for guessing codes.
   */
  router
    .get('/ref/:code', [ReferralCtrl, 'click'])
    .as('shop.referral')
    .use(throttle.storefront)
    .use(moduleEnabled)

  /**
   * Currency selection. A read for the picker, a write to remember the choice.
   *
   * The write is a cart mutation in practice — it re-prices the basket — so it
   * carries the cart-write limit rather than the looser read one.
   */
  router
    .get('/api/shop/currencies', [ShopCatalogCtrl, 'currencies'])
    .as('shop.currencies')
    .use(throttle.storefront)
    .use(moduleEnabled)

  /**
   * Delivery options for an address. A read, but it must POST — the address is
   * personal data and has no business sitting in a URL, a proxy log or browser
   * history.
   */
  router
    .post('/api/shop/shipping/options', [ShopCheckoutCtrl, 'shippingOptions'])
    .as('shop.shipping.options')
    .use(throttle.storefront)
    .use(moduleEnabled)

  router
    .post('/api/shop/currency', [ShopCatalogCtrl, 'setCurrency'])
    .as('shop.currency.set')
    .use(throttle.cartWrite)
    .use(moduleEnabled)

  router
    .post('/api/shop/discount/check', [ReferralCtrl, 'checkDiscount'])
    .as('shop.discount.check')
    .use(throttle.discountCheck)
    .use(moduleEnabled)

  /**
   * The shop front. A builder page chosen in Store settings, served here
   * because `/shop` is a reserved first segment the CMS catch-all will not
   * touch.
   */
  router
    .get('/shop', [ShopPagesCtrl, 'shopFront'])
    .as('shop.front')
    .use(throttle.storefront)
    .use(moduleEnabled)

  /**
   * Product pages: one builder page, bound to a slug.
   *
   * The prefix is a constant (`PRODUCT_PATH_PREFIX`), not a setting: routes are
   * registered once at boot, so a configurable one would need a restart to take
   * effect and could be pointed at `/admin/…` to shadow the dashboard. The same
   * constant builds the canonical URL, so the two cannot drift apart.
   */
  /**
   * One-click opt-out from a marketing email.
   *
   * Unauthenticated by necessity — it has to work straight from an inbox. Not
   * behind `moduleEnabled`: someone who unsubscribes must succeed even if the
   * shop was switched off after the email went out.
   */
  router
    .get('/shop/unsubscribe', [ShopAccountCtrl, 'unsubscribe'])
    .as('shop.unsubscribe')
    .use(throttle.storefront)

  /**
   * Account screens. No server-side auth gate — see the controller: each one
   * fetches from `/api/shop/...`, and those endpoints hold the session check.
   */
  router
    .group(() => {
      router.get('/shop/account', [ShopPagesCtrl, 'account']).as('shop.account')
      router
        .get('/shop/account/login', [ShopPagesCtrl, 'accountLogin'])
        .as('shop.account.page.login')
      router
        .get('/shop/account/register', [ShopPagesCtrl, 'accountRegister'])
        .as('shop.account.page.register')
    })
    .use(throttle.storefront)
    .use(moduleEnabled)

  router
    .get('/shop/p/:slug', [ShopPagesCtrl, 'product'])
    .as('shop.product')
    .use(throttle.storefront)
    .use(moduleEnabled)

  /**
   * Digital downloads.
   *
   * Authorised by the order's own access token in the query string, so a buyer
   * needs no account and their link keeps working for as long as their order
   * link does. Deliberately **not** behind `moduleEnabled`: a store switched off
   * after a sale still owes its buyers the files they paid for, exactly like the
   * webhook route above.
   */
  router
    .get('/shop/download/:id', [ShopDownloadCtrl, 'show'])
    .as('shop.download')
    .use(throttle.download)

  /**
   * ── Storefront pages ──────────────────────────────────────────────────────
   *
   * Application screens, not content. They render through `PublicLayout` and
   * stay client-rendered: a basket is per-visitor, so it must never end up in a
   * shared SSR payload or an SSG snapshot.
   *
   * `/shop` is a reserved first segment in `pages_public_controller`, so a CMS
   * page cannot be created at a path these own. The catalogue itself is the
   * opposite — Puck blocks on ordinary pages, with SSR/SSG for free.
   */
  router
    .group(() => {
      router.get('/shop/cart', [ShopPagesCtrl, 'cart']).as('shop.page.cart')
      router.get('/shop/checkout', [ShopPagesCtrl, 'checkout']).as('shop.page.checkout')
      router.get('/shop/order', [ShopPagesCtrl, 'order']).as('shop.page.order')
    })
    .use(throttle.storefront)
    .use(moduleEnabled)

  // ── Admin pages ───────────────────────────────────────────────────────────
  router
    .group(() => {
      router.get('/admin/ecommerce', [DashboardCtrl, 'page']).as('ecommerce.dashboard.page')
    })
    .use(middleware.auth())
    .use(middleware.pagePermission({ permission: 'ecommerce:dashboard:read' }))
    .use(moduleEnabled)

  router
    .group(() => {
      router.get('/admin/ecommerce/products', [ProductsCtrl, 'page']).as('ecommerce.products.page')
      /**
       * Both registered before `:id`, or `/products/categories` is read as a
       * product id and the page tries to load a product called "categories".
       */
      router
        .get('/admin/ecommerce/products/categories', [ProductsCtrl, 'categoriesPage'])
        .as('ecommerce.products.categories')
      router
        .get('/admin/ecommerce/products/new', [ProductsCtrl, 'newPage'])
        .as('ecommerce.products.new')
      router
        .get('/admin/ecommerce/products/:id', [ProductsCtrl, 'detailPage'])
        .as('ecommerce.products.detail')
    })
    .use(middleware.auth())
    .use(middleware.pagePermission({ permission: 'ecommerce:products:read' }))
    .use(moduleEnabled)

  router
    .group(() => {
      router.get('/admin/ecommerce/orders', [OrdersCtrl, 'page']).as('ecommerce.orders.page')
      /**
       * Registered **before** `:id`, or `/orders/new` matches the detail route
       * and the page tries to load an order called "new".
       */
      router.get('/admin/ecommerce/orders/new', [OrdersCtrl, 'newPage']).as('ecommerce.orders.new')
      router
        .get('/admin/ecommerce/orders/:id', [OrdersCtrl, 'detailPage'])
        .as('ecommerce.orders.detail')
    })
    .use(middleware.auth())
    .use(middleware.pagePermission({ permission: 'ecommerce:orders:read' }))
    .use(moduleEnabled)

  router
    .group(() => {
      router
        .get('/admin/ecommerce/customers', [CustomersCtrl, 'page'])
        .as('ecommerce.customers.page')
    })
    .use(middleware.auth())
    .use(middleware.pagePermission({ permission: 'ecommerce:customers:read' }))
    .use(moduleEnabled)

  router
    .group(() => {
      router.get('/admin/ecommerce/settings', [SettingsCtrl, 'page']).as('ecommerce.settings.page')
    })
    .use(middleware.auth())
    .use(middleware.pagePermission({ permission: 'ecommerce:settings:manage' }))
    .use(moduleEnabled)

  // ── Admin API: orders ─────────────────────────────────────────────────────
  router
    .group(() => {
      router
        .get('/api/admin/ecommerce/orders', [OrdersCtrl, 'index'])
        .as('ecommerce.api.orders.index')
      router
        .get('/api/admin/ecommerce/orders/:id', [OrdersCtrl, 'show'])
        .as('ecommerce.api.orders.show')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:orders:read' }))
    .use(moduleEnabled)

  router
    .group(() => {
      router
        .put('/api/admin/ecommerce/orders/:id/status', [OrdersCtrl, 'updateStatus'])
        .as('ecommerce.api.orders.status')
      router
        .post('/api/admin/ecommerce/orders/:id/cancel', [OrdersCtrl, 'cancel'])
        .as('ecommerce.api.orders.cancel')
      router
        .post('/api/admin/ecommerce/orders/:id/ship', [OrdersCtrl, 'markShipped'])
        .as('ecommerce.api.orders.ship')
      router
        .put('/api/admin/ecommerce/orders/:id/note', [OrdersCtrl, 'updateNote'])
        .as('ecommerce.api.orders.note')
      /**
       * Manual orders. Same permission as editing one: creating a sale by hand
       * and changing a sale by hand are the same trust.
       */
      router
        .post('/api/admin/ecommerce/orders', [OrdersCtrl, 'storeManual'])
        .as('ecommerce.api.orders.store')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:orders:manage' }))
    .use(moduleEnabled)

  /**
   * Refunds sit behind their own permission. Moving money out is a different
   * job from updating a fulfilment status, and the person who does one is often
   * not the person trusted with the other.
   */
  router
    .group(() => {
      router.get('/api/admin/ecommerce/sales', [DashboardCtrl, 'sales']).as('ecommerce.api.sales')
      router
        .get('/api/admin/ecommerce/abandoned-carts', [DashboardCtrl, 'abandonedCarts'])
        .as('ecommerce.api.abandonedCarts')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:dashboard:read' }))
    .use(moduleEnabled)

  /**
   * Currencies the store sells in. Reading sits with the dashboard because the
   * report needs it; changing the set is a store-settings decision.
   */
  router
    .get('/api/admin/ecommerce/currencies', [SettingsCtrl, 'currencies'])
    .as('ecommerce.api.currencies.index')
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:dashboard:read' }))
    .use(moduleEnabled)

  router
    .get('/api/admin/ecommerce/shipping', [SettingsCtrl, 'shipping'])
    .as('ecommerce.api.shipping.index')
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:settings:manage' }))
    .use(moduleEnabled)

  router
    .post('/api/admin/ecommerce/storefront/seed', [SettingsCtrl, 'seedStorefront'])
    .as('ecommerce.api.storefront.seed')
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:settings:manage' }))
    .use(moduleEnabled)

  router
    .put('/api/admin/ecommerce/shipping', [SettingsCtrl, 'updateShipping'])
    .as('ecommerce.api.shipping.update')
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:settings:manage' }))
    .use(moduleEnabled)

  router
    .put('/api/admin/ecommerce/currencies', [SettingsCtrl, 'updateCurrencies'])
    .as('ecommerce.api.currencies.update')
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:settings:manage' }))
    .use(moduleEnabled)

  // ── Admin API: customers ──────────────────────────────────────────────────
  router
    .get('/api/admin/ecommerce/customers', [CustomersCtrl, 'index'])
    .as('ecommerce.api.customers.index')
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:customers:read' }))
    .use(moduleEnabled)

  router
    .post('/api/admin/ecommerce/customers', [CustomersCtrl, 'store'])
    .as('ecommerce.api.customers.store')
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:customers:manage' }))
    .use(moduleEnabled)

  router
    .put('/api/admin/ecommerce/customers/:id/status', [CustomersCtrl, 'updateStatus'])
    .as('ecommerce.api.customers.status')
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:customers:manage' }))
    .use(moduleEnabled)

  /**
   * ── Exports ───────────────────────────────────────────────────────────────
   *
   * Each export sits behind the permission that already guards reading the same
   * data on screen. A CSV is not a lower bar than a list page just because it
   * is a file — if anything it is a higher one, since it leaves the building.
   */
  router
    .group(() => {
      router
        .get('/api/admin/ecommerce/exports/orders', [ExportsCtrl, 'orders'])
        .as('ecommerce.api.exports.orders')
      router
        .get('/api/admin/ecommerce/exports/order-items', [ExportsCtrl, 'orderItems'])
        .as('ecommerce.api.exports.orderItems')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:orders:read' }))
    .use(moduleEnabled)

  router
    .get('/api/admin/ecommerce/exports/customers', [ExportsCtrl, 'customers'])
    .as('ecommerce.api.exports.customers')
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:customers:read' }))
    .use(moduleEnabled)

  /**
   * The one export containing cost price. `products:read` is a staff
   * permission, but it is worth knowing which file has the margins in it.
   */
  router
    .get('/api/admin/ecommerce/exports/products', [ExportsCtrl, 'products'])
    .as('ecommerce.api.exports.products')
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:products:read' }))
    .use(moduleEnabled)

  router
    .get('/api/admin/ecommerce/orders/:orderId/grants', [DigitalCtrl, 'grants'])
    .as('ecommerce.api.grants.index')
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:orders:read' }))
    .use(moduleEnabled)

  /**
   * Revoking a download takes back something already paid for, which is the
   * same class of decision as moving money — hence `orders:refund`.
   */
  router
    .post('/api/admin/ecommerce/grants/:id/revoke', [DigitalCtrl, 'revoke'])
    .as('ecommerce.api.grants.revoke')
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:orders:refund' }))
    .use(moduleEnabled)

  router
    .post('/api/admin/ecommerce/orders/:id/refund', [OrdersCtrl, 'refund'])
    .as('ecommerce.api.orders.refund')
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:orders:refund' }))
    .use(moduleEnabled)

  // ── Admin API: payment gateway credentials ────────────────────────────────
  router
    .group(() => {
      router
        .get('/api/admin/ecommerce/gateways', [GatewaysCtrl, 'index'])
        .as('ecommerce.api.gateways.index')
      router
        .put('/api/admin/ecommerce/gateways/:gateway/:mode', [GatewaysCtrl, 'update'])
        .as('ecommerce.api.gateways.update')
      router
        .post('/api/admin/ecommerce/gateways/:gateway/:mode/verify', [GatewaysCtrl, 'verify'])
        .as('ecommerce.api.gateways.verify')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:gateways:manage' }))
    .use(moduleEnabled)

  // ── Admin API: products ───────────────────────────────────────────────────
  router
    .group(() => {
      router
        .get('/api/admin/ecommerce/products', [ProductsCtrl, 'index'])
        .as('ecommerce.api.products.index')
      router
        .get('/api/admin/ecommerce/products/:id', [ProductsCtrl, 'show'])
        .as('ecommerce.api.products.show')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:products:read' }))
    .use(moduleEnabled)

  router
    .group(() => {
      router
        .post('/api/admin/ecommerce/products', [ProductsCtrl, 'store'])
        .as('ecommerce.api.products.store')
      router
        .post('/api/admin/ecommerce/products/import', [ProductsCtrl, 'import'])
        .as('ecommerce.api.products.import')
      router
        .put('/api/admin/ecommerce/products/:id', [ProductsCtrl, 'update'])
        .as('ecommerce.api.products.update')
      router
        .delete('/api/admin/ecommerce/products/:id', [ProductsCtrl, 'destroy'])
        .as('ecommerce.api.products.destroy')

      router
        .post('/api/admin/ecommerce/products/:id/variants', [ProductsCtrl, 'storeVariant'])
        .as('ecommerce.api.variants.store')
      router
        .put('/api/admin/ecommerce/variants/:variantId', [ProductsCtrl, 'updateVariant'])
        .as('ecommerce.api.variants.update')
      router
        .delete('/api/admin/ecommerce/variants/:variantId', [ProductsCtrl, 'destroyVariant'])
        .as('ecommerce.api.variants.destroy')

      /**
       * Digital assets. Uploading a file that buyers will pay for is part of
       * managing the catalogue, so it shares `products:manage` rather than
       * inventing a permission nobody would think to grant.
       */
      router
        .get('/api/admin/ecommerce/products/:productId/assets', [DigitalCtrl, 'index'])
        .as('ecommerce.api.assets.index')
      router
        .post('/api/admin/ecommerce/variants/:variantId/assets', [DigitalCtrl, 'store'])
        .as('ecommerce.api.assets.store')
      router
        .put('/api/admin/ecommerce/assets/:id', [DigitalCtrl, 'update'])
        .as('ecommerce.api.assets.update')
      router
        .delete('/api/admin/ecommerce/assets/:id', [DigitalCtrl, 'destroy'])
        .as('ecommerce.api.assets.destroy')

      /** Listed prices in currencies other than the base. */
      router
        .get('/api/admin/ecommerce/variants/:variantId/prices', [ProductsCtrl, 'variantPrices'])
        .as('ecommerce.api.variantPrices.index')
      router
        .put('/api/admin/ecommerce/variants/:variantId/prices', [
          ProductsCtrl,
          'updateVariantPrices',
        ])
        .as('ecommerce.api.variantPrices.update')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:products:manage' }))
    .use(moduleEnabled)

  // ── Admin API: categories ─────────────────────────────────────────────────
  router
    .group(() => {
      router
        .get('/api/admin/ecommerce/categories', [CategoriesCtrl, 'index'])
        .as('ecommerce.api.categories.index')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:products:read' }))
    .use(moduleEnabled)

  router
    .group(() => {
      router
        .post('/api/admin/ecommerce/categories', [CategoriesCtrl, 'store'])
        .as('ecommerce.api.categories.store')
      router
        .put('/api/admin/ecommerce/categories/:id', [CategoriesCtrl, 'update'])
        .as('ecommerce.api.categories.update')
      router
        .delete('/api/admin/ecommerce/categories/:id', [CategoriesCtrl, 'destroy'])
        .as('ecommerce.api.categories.destroy')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:products:manage' }))
    .use(moduleEnabled)

  // ── Admin API: store settings ─────────────────────────────────────────────
  router
    .group(() => {
      router
        .get('/api/admin/ecommerce/settings', [SettingsCtrl, 'show'])
        .as('ecommerce.api.settings.show')
      router
        .put('/api/admin/ecommerce/settings', [SettingsCtrl, 'update'])
        .as('ecommerce.api.settings.update')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:settings:manage' }))
    .use(moduleEnabled)

  // ── Admin: marketing ──────────────────────────────────────────────────────
  router
    .group(() => {
      router
        .get('/admin/marketing/discounts', [MarketingCtrl, 'discountsPage'])
        .as('ecommerce.discounts.page')
    })
    .use(middleware.auth())
    .use(middleware.pagePermission({ permission: 'ecommerce:discounts:read' }))
    .use(moduleEnabled)

  router
    .group(() => {
      router
        .get('/admin/marketing/affiliates', [MarketingCtrl, 'affiliatesPage'])
        .as('ecommerce.affiliates.page')
    })
    .use(middleware.auth())
    .use(middleware.pagePermission({ permission: 'ecommerce:affiliates:read' }))
    .use(moduleEnabled)

  router
    .group(() => {
      router
        .get('/admin/marketing/commissions', [MarketingCtrl, 'commissionsPage'])
        .as('ecommerce.commissions.page')
      router
        .get('/admin/marketing/withdrawals', [MarketingCtrl, 'withdrawalsPage'])
        .as('ecommerce.withdrawals.page')
    })
    .use(middleware.auth())
    .use(middleware.pagePermission({ permission: 'ecommerce:commissions:read' }))
    .use(moduleEnabled)

  router
    .group(() => {
      router
        .get('/api/admin/ecommerce/discounts', [MarketingCtrl, 'listDiscounts'])
        .as('ecommerce.api.discounts.index')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:discounts:read' }))
    .use(moduleEnabled)

  router
    .group(() => {
      router
        .post('/api/admin/ecommerce/discounts', [MarketingCtrl, 'createDiscount'])
        .as('ecommerce.api.discounts.store')
      router
        .put('/api/admin/ecommerce/discounts/:id', [MarketingCtrl, 'updateDiscount'])
        .as('ecommerce.api.discounts.update')
      router
        .delete('/api/admin/ecommerce/discounts/:id', [MarketingCtrl, 'destroyDiscount'])
        .as('ecommerce.api.discounts.destroy')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:discounts:manage' }))
    .use(moduleEnabled)

  router
    .group(() => {
      router
        .get('/api/admin/ecommerce/affiliates', [MarketingCtrl, 'listAffiliates'])
        .as('ecommerce.api.affiliates.index')
      router
        .get('/api/admin/ecommerce/affiliate-accounts', [MarketingCtrl, 'searchAccounts'])
        .as('ecommerce.api.affiliates.accounts')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:affiliates:read' }))
    .use(moduleEnabled)

  router
    .group(() => {
      router
        .post('/api/admin/ecommerce/affiliates', [MarketingCtrl, 'addAffiliate'])
        .as('ecommerce.api.affiliates.store')
      router
        .post('/api/admin/ecommerce/affiliates/:id/approve', [MarketingCtrl, 'approveAffiliate'])
        .as('ecommerce.api.affiliates.approve')
      router
        .post('/api/admin/ecommerce/affiliates/:id/reject', [MarketingCtrl, 'rejectAffiliate'])
        .as('ecommerce.api.affiliates.reject')
      router
        .put('/api/admin/ecommerce/affiliates/:id', [MarketingCtrl, 'updateAffiliate'])
        .as('ecommerce.api.affiliates.update')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:affiliates:manage' }))
    .use(moduleEnabled)

  router
    .group(() => {
      router
        .get('/api/admin/ecommerce/commissions', [MarketingCtrl, 'listCommissions'])
        .as('ecommerce.api.commissions.index')
      router
        .get('/api/admin/ecommerce/withdrawals', [MarketingCtrl, 'listWithdrawals'])
        .as('ecommerce.api.withdrawals.index')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:commissions:read' }))
    .use(moduleEnabled)

  /**
   * Recording a payout is money leaving the building, so it sits behind its own
   * permission rather than under `affiliates:manage`.
   */
  router
    .group(() => {
      router
        .post('/api/admin/ecommerce/commissions/pay', [MarketingCtrl, 'payCommissions'])
        .as('ecommerce.api.commissions.pay')
      router
        .get('/api/admin/ecommerce/commissions/export', [MarketingCtrl, 'exportPayouts'])
        .as('ecommerce.api.commissions.export')
      router
        .post('/api/admin/ecommerce/withdrawals/:id/process', [MarketingCtrl, 'processWithdrawal'])
        .as('ecommerce.api.withdrawals.process')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:commissions:approve' }))
    .use(moduleEnabled)

  // ── Admin API: dashboard ──────────────────────────────────────────────────
  router
    .group(() => {
      router.get('/api/admin/ecommerce/stats', [DashboardCtrl, 'stats']).as('ecommerce.api.stats')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'ecommerce:dashboard:read' }))
    .use(moduleEnabled)
}

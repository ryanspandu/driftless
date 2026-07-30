import { defineModule } from '#modules/types'
import { registerRoutes } from '#modules/ecommerce/routes'

/**
 * Every table this module owns, in creation order.
 *
 * Used for two things: deciding whether the module is installed (do these
 * exist?), and knowing what to drop on uninstall — which happens in reverse, so
 * a child table goes before the parent it references. Lucid's rollback has no
 * per-module scoping, so this declared list is the only safe basis for dropping
 * anything.
 */
const TABLES = [
  'ecommerce_settings',
  'ecommerce_gateway_credentials',
  'ecommerce_categories',
  'ecommerce_products',
  'ecommerce_product_variants',
  'ecommerce_product_images',
  'ecommerce_product_categories',
  'ecommerce_digital_assets',
  'ecommerce_customers',
  'ecommerce_customer_sessions',
  'ecommerce_addresses',
  'ecommerce_carts',
  'ecommerce_cart_items',
  'ecommerce_orders',
  'ecommerce_order_items',
  'ecommerce_order_events',
  'ecommerce_payments',
  'ecommerce_refunds',
  'ecommerce_webhook_events',
  'ecommerce_idempotency_keys',
  'ecommerce_shipping_zones',
  'ecommerce_shipping_methods',
  'ecommerce_discounts',
  'ecommerce_discount_redemptions',
  'ecommerce_affiliates',
  'ecommerce_affiliate_clicks',
  'ecommerce_commissions',
  'ecommerce_download_grants',
  'ecommerce_currencies',
  'ecommerce_variant_prices',
  'ecommerce_shipping_rates',
]

export default defineModule({
  name: 'ecommerce',
  label: 'E-commerce',
  description:
    'Products, orders, payments, discounts and affiliates. Checkout is hosted by Stripe or PayPal, so card details never reach this server.',
  version: '1.0.0',

  /**
   * Deliberately **not** auto-enabled.
   *
   * `ModulesService.reconcile()` runs on every boot and creates a row for any
   * newly detected module with `enabled: autoEnable ?? true`. If this were
   * true, deploying the module would enable it on every process at boot, before
   * its tables exist — and if enabling ever implied migrating, that would mean
   * DDL running unattended at startup across the whole fleet. An operator turns
   * it on from Settings → Application, which is also where the install step is.
   */
  autoEnable: false,

  tables: TABLES,

  /**
   * First-run storefront pages.
   *
   * `/shop` and `/shop/p/:slug` both render a **builder page**, because the
   * catalogue is content the operator should be able to redesign. Without a
   * starting page both URLs 404 on a fresh install, which looks broken rather
   * than unconfigured.
   *
   * Skips anything that already exists, so toggling the module off and on never
   * restores a page someone deleted or undoes edits to one they kept.
   */
  async onEnable() {
    const { default: StorefrontSeederService } = await import(
      '#modules/ecommerce/services/storefront_seeder_service'
    )
    await new StorefrontSeederService().seed()
  },

  /**
   * Periodic sweeps, run by `node ace modules:maintenance` from cron.
   *
   * Not optional housekeeping: without them, stock reserved by an abandoned
   * checkout is held forever, commissions never leave `pending`, and a webhook
   * that failed once is never retried. Deliberately outside the queue — this is
   * exactly the work that has to keep happening when Redis is down.
   */
  async maintenance() {
    const { default: MaintenanceService } =
      await import('#modules/ecommerce/services/maintenance_service')
    return new MaintenanceService().runAll()
  },

  /**
   * Refuse to be uninstalled while there are paid orders.
   *
   * The confirmation dialog is a speed bump; this is the actual guard. Dropping
   * these tables destroys financial records that cannot be recreated and that
   * most jurisdictions require be retained.
   */
  async canUninstall() {
    const { default: db } = await import('@adonisjs/lucid/services/db')

    // The tables may already be gone (a partial uninstall, a fresh install that
    // never migrated). Nothing to protect in that case.
    if (!(await db.connection().schema.hasTable('ecommerce_orders'))) {
      return { ok: true }
    }

    const paid = await db
      .from('ecommerce_orders')
      .whereIn('payment_status', ['paid', 'partially_refunded', 'refunded'])
      .count('* as total')
      .first()

    const total = Number((paid as { total?: string | number } | undefined)?.total ?? 0)
    if (total > 0) {
      return {
        ok: false,
        reason: `This store has ${total} order${total === 1 ? '' : 's'} with payment history. Uninstalling would delete those records permanently. Export them first, or disable the module instead — disabling keeps all data.`,
      }
    }

    return { ok: true }
  },

  /**
   * Permission matching is literal (`app/services/permission_ability_service.ts`):
   * only `*` and a special `cms:manage` case are wildcards, so `ecommerce:manage`
   * would NOT imply `ecommerce:orders:read`. Every code has to be declared.
   *
   * The split is by blast radius, not by screen. Reading orders and refunding
   * them are different jobs; so are configuring the store and holding its
   * payment credentials.
   */
  permissions: [
    {
      name: 'ecommerce:dashboard:read',
      description: 'View the store dashboard and sales figures.',
    },
    { name: 'ecommerce:products:read', description: 'View products, variants and categories.' },
    {
      name: 'ecommerce:products:manage',
      description: 'Create / edit / delete products and stock.',
    },
    { name: 'ecommerce:orders:read', description: 'View orders and their history.' },
    {
      name: 'ecommerce:orders:manage',
      description: 'Update order status, fulfil and cancel orders.',
    },
    {
      name: 'ecommerce:orders:refund',
      description: 'Issue refunds. Moves money out — grant sparingly.',
    },
    { name: 'ecommerce:customers:read', description: 'View customers and their order history.' },
    { name: 'ecommerce:customers:manage', description: 'Edit or block customer accounts.' },
    { name: 'ecommerce:discounts:read', description: 'View discount codes.' },
    { name: 'ecommerce:discounts:manage', description: 'Create / edit / delete discount codes.' },
    { name: 'ecommerce:affiliates:read', description: 'View affiliates and their referrals.' },
    {
      name: 'ecommerce:affiliates:manage',
      description: 'Create / edit affiliates and commission rates.',
    },
    { name: 'ecommerce:commissions:read', description: 'View affiliate commissions.' },
    { name: 'ecommerce:commissions:approve', description: 'Approve and mark commissions as paid.' },
    {
      name: 'ecommerce:settings:manage',
      description: 'Store details, tax, shipping and checkout settings.',
    },
    {
      name: 'ecommerce:gateways:manage',
      description: 'Add or replace Stripe / PayPal API keys. Grants control of payment processing.',
    },
  ],

  /**
   * Two sidebar groups from one module.
   *
   * Discounts and affiliates are marketing work, usually done by different
   * people than order fulfilment, so they get their own section rather than
   * being buried under the store. They stay in the same module because they
   * share the order and customer tables — splitting them into a second module
   * would mean one module importing another's models, which the module system
   * does not allow.
   */
  // `/shop/*` belongs to the storefront; a CMS page there could never render.
  reservedSegments: ['shop'],
  nav: [
    {
      label: 'E-commerce',
      icon: 'ShoppingCart',
      order: 30,
      permission: 'ecommerce:dashboard:read',
      items: [
        {
          label: 'Dashboard',
          href: '/admin/ecommerce',
          icon: 'Gauge',
          permission: 'ecommerce:dashboard:read',
        },
        {
          label: 'Products',
          href: '/admin/ecommerce/products',
          icon: 'Package',
          permission: 'ecommerce:products:read',
        },
        {
          label: 'Orders',
          href: '/admin/ecommerce/orders',
          icon: 'Receipt',
          permission: 'ecommerce:orders:read',
        },
        {
          label: 'Customers',
          href: '/admin/ecommerce/customers',
          icon: 'Users',
          permission: 'ecommerce:customers:read',
        },
        {
          label: 'Settings',
          href: '/admin/ecommerce/settings',
          icon: 'Faders',
          permission: 'ecommerce:settings:manage',
        },
      ],
    },
    {
      label: 'Marketing',
      icon: 'Megaphone',
      order: 31,
      permission: 'ecommerce:discounts:read',
      items: [
        {
          label: 'Discounts',
          href: '/admin/marketing/discounts',
          icon: 'Tag',
          permission: 'ecommerce:discounts:read',
        },
        {
          label: 'Affiliates',
          href: '/admin/marketing/affiliates',
          icon: 'Users',
          permission: 'ecommerce:affiliates:read',
        },
        {
          label: 'Commissions',
          href: '/admin/marketing/commissions',
          icon: 'CurrencyDollar',
          permission: 'ecommerce:commissions:read',
        },
      ],
    },
  ],

  /**
   * Runs only when the module is enabled.
   *
   * Registering the block resolvers here — rather than core importing them — is
   * what keeps the dependency one-way: core never reaches into a module, so a
   * disabled or absent e-commerce module simply means no commerce blocks
   * resolve, and the page builder carries on.
   */
  async boot() {
    const { registerEcommerceBlockResolvers } =
      await import('#modules/ecommerce/services/block_resolvers')
    registerEcommerceBlockResolvers()
  },

  registerRoutes,
})

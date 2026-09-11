import { BaseSchema } from '@adonisjs/lucid/schema'

/** Discounts, affiliates and the commissions they earn. */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ecommerce_discounts', (table) => {
      table.string('id').primary()

      /**
       * Stored upper-cased and unique. Codes are typed by humans, so lookups
       * normalise case in the service; the index stays plain because SQLite
       * (the test database) has no `citext`.
       */
      table.string('code', 64).notNullable().unique()
      table.string('name').nullable()
      table.text('description').nullable()

      // percent | fixed | free_shipping
      table.string('type', 16).notNullable().defaultTo('percent')
      /**
       * Percentage in millipercent (10.5% -> 10500) for `percent`, or minor
       * units for `fixed`. Integer either way — a float discount rate produces
       * totals that differ by a cent depending on evaluation order.
       */
      table.integer('value').notNullable().defaultTo(0)

      table.bigInteger('min_subtotal_amount').nullable()
      /** Ceiling on a percentage discount, in minor units. */
      table.bigInteger('max_discount_amount').nullable()

      table.timestamp('starts_at').nullable()
      table.timestamp('ends_at').nullable()

      /**
       * Redemption caps. `usage_count` is incremented with a conditional
       * UPDATE that also checks the limit, so the check and the claim are one
       * atomic statement — the read-then-write pattern used elsewhere in this
       * codebase is a TOCTOU race, and on a discount that races is money.
       */
      table.integer('usage_limit').nullable()
      table.integer('usage_limit_per_customer').nullable()
      table.integer('usage_count').notNullable().defaultTo(0)

      /** Restrict to given product/category ids; empty means the whole catalogue. */
      table.jsonb('applies_to').notNullable().defaultTo('{}')

      table.boolean('enabled').notNullable().defaultTo(true)

      table
        .integer('created_by_user_id')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()

      table.index(['enabled', 'starts_at', 'ends_at'], 'ecom_discounts_window_index')
    })

    this.schema.createTable('ecommerce_discount_redemptions', (table) => {
      table.string('id').primary()
      table
        .string('discount_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_discounts')
        .onDelete('CASCADE')
      table
        .string('order_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_orders')
        .onDelete('CASCADE')

      table
        .string('customer_id')
        .nullable()
        .references('id')
        .inTable('ecommerce_customers')
        .onDelete('SET NULL')
      /**
       * Hashed email, so the per-customer cap also applies to guest checkouts
       * (which have no customer row) without keeping another plaintext copy of
       * the address.
       */
      table.string('email_hash', 64).nullable()

      table.bigInteger('amount').notNullable()
      table.timestamp('created_at').notNullable()

      // One redemption per order — the cap is meaningless if the same order can
      // record several.
      table.unique(['discount_id', 'order_id'])
      table.index(['discount_id', 'email_hash'], 'ecom_redemptions_customer_index')
    })

    this.schema.createTable('ecommerce_affiliates', (table) => {
      table.string('id').primary()

      table.string('code', 64).notNullable().unique()
      table.string('name').notNullable()
      table.string('email', 254).notNullable()

      table
        .string('customer_id')
        .nullable()
        .references('id')
        .inTable('ecommerce_customers')
        .onDelete('SET NULL')

      /** Commission rate in millipercent (10% -> 10000). */
      table.integer('commission_percent_milli').notNullable().defaultTo(0)

      table.string('status', 16).notNullable().defaultTo('active') // active | paused | blocked

      /**
       * Bank or PayPal details for manual payout. Encrypted: this is a payment
       * instrument, and the admin list should never be able to leak it.
       */
      table.text('payout_details_enc').nullable()
      table.text('notes').nullable()

      // Denormalised running totals, maintained alongside commission rows.
      table.integer('clicks_count').notNullable().defaultTo(0)
      table.integer('orders_count').notNullable().defaultTo(0)
      table.bigInteger('total_commission_amount').notNullable().defaultTo(0)
      table.bigInteger('paid_commission_amount').notNullable().defaultTo(0)

      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()

      table.index(['status'], 'ecom_affiliates_status_index')
    })

    /**
     * Referral clicks.
     *
     * Append-only and pruned on a schedule — this is the highest-volume table
     * in the module and an unauthenticated endpoint writes to it, so it is also
     * the easiest one to flood. The IP is hashed rather than stored.
     */
    this.schema.createTable('ecommerce_affiliate_clicks', (table) => {
      table.string('id').primary()
      table.string('code', 64).notNullable()
      table.string('landing_path', 512).nullable()
      table.string('referrer', 512).nullable()
      table.string('ip_hash', 64).nullable()
      table.string('user_agent', 512).nullable()
      table.timestamp('created_at').notNullable()

      table.index(['code', 'created_at'], 'ecom_affiliate_clicks_index')
    })

    this.schema.createTable('ecommerce_commissions', (table) => {
      table.string('id').primary()
      table
        .string('affiliate_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_affiliates')
        .onDelete('CASCADE')
      /**
       * Unique: one commission per order, full stop. Without this a replayed
       * `order.paid` event pays the affiliate twice for one sale.
       */
      table
        .string('order_id')
        .notNullable()
        .unique()
        .references('id')
        .inTable('ecommerce_orders')
        .onDelete('CASCADE')

      table.bigInteger('amount').notNullable()
      table.string('currency', 3).notNullable()
      table.bigInteger('order_subtotal_amount').notNullable()
      table.integer('rate_percent_milli').notNullable()

      /**
       * pending → approved → paid, with `void` for a refunded order.
       *
       * `approved` only happens once the refund window has passed, so the store
       * is never in the position of having paid out commission on a sale that
       * was later reversed.
       */
      table.string('status', 16).notNullable().defaultTo('pending')
      table.timestamp('approved_at').nullable()
      table.timestamp('paid_at').nullable()
      table.string('void_reason', 255).nullable()

      table
        .integer('paid_by_user_id')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.timestamps(true, true)

      table.index(['affiliate_id', 'status'], 'ecom_commissions_affiliate_index')
      table.index(['status', 'created_at'], 'ecom_commissions_status_index')
    })
  }

  async down() {
    this.schema.dropTable('ecommerce_commissions')
    this.schema.dropTable('ecommerce_affiliate_clicks')
    this.schema.dropTable('ecommerce_affiliates')
    this.schema.dropTable('ecommerce_discount_redemptions')
    this.schema.dropTable('ecommerce_discounts')
  }
}

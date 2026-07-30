import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Buyers, their sessions and their addresses.
 *
 * Buyers deliberately live in their own table rather than in `users`. The
 * `users` table is the admin-area identity: it carries RBAC roles, is what
 * `ctx.auth.user` resolves to, and everything under `/admin` trusts it. Putting
 * shoppers in there would mean one bug in role assignment is the difference
 * between a customer and an administrator.
 *
 * Keeping them separate makes the guarantee structural: `ctx.auth.user` can
 * never be a customer, because a customer has no row in the table those guards
 * read.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ecommerce_customers', (table) => {
      table.string('id').primary()

      /**
       * Stored lower-cased and unique. `citext` would be the natural fit on
       * PostgreSQL but does not exist on SQLite (used by the test suite), so
       * normalisation happens in the service and the index stays plain.
       */
      table.string('email', 254).notNullable().unique()

      /**
       * Null for guest checkout — the common case. A password only exists once
       * someone deliberately creates an account.
       */
      table.string('password_hash').nullable()

      table.string('first_name').nullable()
      table.string('last_name').nullable()
      table.string('phone', 32).nullable()

      table.string('status', 16).notNullable().defaultTo('active') // active | blocked
      table.timestamp('email_verified_at').nullable()
      table.boolean('accepts_marketing').notNullable().defaultTo(false)

      // Denormalised lifetime stats, maintained when an order is paid, so the
      // customer list does not aggregate the orders table on every page load.
      table.integer('orders_count').notNullable().defaultTo(0)
      table.bigInteger('total_spent_amount').notNullable().defaultTo(0)

      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()

      table.index(['status'], 'ecom_customers_status_index')
    })

    /**
     * Storefront sessions.
     *
     * A dedicated table and cookie rather than an Adonis guard: the admin
     * session cookie (`adonis-session`) and this one (`dl_shop`) share nothing,
     * so no confusion between the two identities is possible even in principle.
     *
     * Only the hash is stored, exactly as `auth_access_tokens` does — a database
     * leak must not hand over live sessions.
     */
    this.schema.createTable('ecommerce_customer_sessions', (table) => {
      table.string('id').primary()
      table
        .string('customer_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_customers')
        .onDelete('CASCADE')

      table.string('token_hash', 64).notNullable().unique()
      table.timestamp('expires_at').notNullable()
      table.timestamp('revoked_at').nullable()
      table.timestamp('last_used_at').nullable()

      // Hashed, not stored in the clear — enough to spot a session moving
      // between networks without keeping a plaintext address.
      table.string('ip_hash', 64).nullable()
      table.string('user_agent', 512).nullable()

      table.timestamp('created_at').notNullable()

      table.index(['customer_id', 'expires_at'], 'ecom_customer_sessions_index')
    })

    this.schema.createTable('ecommerce_addresses', (table) => {
      table.string('id').primary()
      /**
       * Nullable: a guest checkout captures an address with no account behind
       * it. The order keeps its own snapshot regardless, so editing an address
       * later never rewrites history on a completed order.
       */
      table
        .string('customer_id')
        .nullable()
        .references('id')
        .inTable('ecommerce_customers')
        .onDelete('CASCADE')

      table.string('label', 64).nullable()
      table.string('first_name').nullable()
      table.string('last_name').nullable()
      table.string('company').nullable()
      table.string('line1').notNullable()
      table.string('line2').nullable()
      table.string('city').notNullable()
      table.string('state').nullable()
      table.string('postal_code', 32).nullable()
      table.string('country', 2).notNullable()
      table.string('phone', 32).nullable()

      table.boolean('is_default_shipping').notNullable().defaultTo(false)
      table.boolean('is_default_billing').notNullable().defaultTo(false)

      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()

      table.index(['customer_id'], 'ecom_addresses_customer_index')
    })
  }

  async down() {
    this.schema.dropTable('ecommerce_addresses')
    this.schema.dropTable('ecommerce_customer_sessions')
    this.schema.dropTable('ecommerce_customers')
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

/** Orders, their line items and their status history. */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ecommerce_orders', (table) => {
      table.string('id').primary()

      // Human-facing reference. Unique at the database level: order numbers are
      // quoted to customers and to payment processors, so a collision is not
      // something to discover later.
      table.string('number', 32).notNullable().unique()

      /**
       * Two independent axes.
       *
       * `status` is fulfilment-facing (is this order still live?), while
       * `payment_status` is money-facing. They move independently: an order can
       * be `confirmed` and `refunded`, or `cancelled` and `paid` pending a
       * refund. Collapsing them into one enum is how state machines end up with
       * twenty values and no invariants.
       */
      table.string('status', 24).notNullable().defaultTo('draft')
      table.string('payment_status', 24).notNullable().defaultTo('unpaid')
      table.string('fulfillment_status', 24).notNullable().defaultTo('unfulfilled')

      table
        .string('customer_id')
        .nullable()
        .references('id')
        .inTable('ecommerce_customers')
        .onDelete('SET NULL')
      table.string('email', 254).notNullable()

      /**
       * Guest access token, hashed.
       *
       * Lets someone who checked out without an account view their own order
       * from an emailed link, without the link being a guessable id.
       */
      table.string('access_token_hash', 64).nullable().unique()

      // Address snapshots. Copies, not references: editing a saved address must
      // never rewrite what a completed order says it was shipped to.
      table.jsonb('shipping_address').notNullable().defaultTo('{}')
      table.jsonb('billing_address').notNullable().defaultTo('{}')

      // All amounts are integer minor units in `currency`.
      table.string('currency', 3).notNullable()
      table.bigInteger('subtotal_amount').notNullable().defaultTo(0)
      table.bigInteger('discount_amount').notNullable().defaultTo(0)
      table.bigInteger('shipping_amount').notNullable().defaultTo(0)
      table.bigInteger('tax_amount').notNullable().defaultTo(0)
      table.bigInteger('total_amount').notNullable().defaultTo(0)
      table.bigInteger('refunded_amount').notNullable().defaultTo(0)

      table.string('discount_code', 64).nullable()
      table.string('affiliate_code', 64).nullable()

      table.string('shipping_method_id').nullable()
      table.string('shipping_method_label').nullable()

      /**
       * Idempotency key from the checkout request that created this order.
       * Unique so a retried submit — a double-click, a flaky connection, a
       * client-side retry — resolves to the same order instead of a second one.
       */
      table.string('idempotency_key', 128).nullable().unique()

      table.text('customer_note').nullable()
      /** Staff-only. Must never appear in a storefront DTO. */
      table.text('internal_note').nullable()

      table.timestamp('reservation_expires_at').nullable()
      table.timestamp('paid_at').nullable()
      table.timestamp('cancelled_at').nullable()
      table.timestamp('fulfilled_at').nullable()

      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()

      table.index(['status', 'created_at'], 'ecom_orders_status_index')
      table.index(['payment_status', 'created_at'], 'ecom_orders_payment_index')
      table.index(['email'], 'ecom_orders_email_index')
      table.index(['customer_id', 'created_at'], 'ecom_orders_customer_index')
      // Drives the sweep that expires unpaid orders and releases their stock.
      table.index(['reservation_expires_at'], 'ecom_orders_reservation_index')
    })

    /**
     * Line items — full snapshots, not references.
     *
     * Title, SKU and unit price are copied at checkout. Renaming a product or
     * changing its price must not retroactively alter what a customer was
     * charged, and a deleted product must not make an old order unreadable.
     */
    this.schema.createTable('ecommerce_order_items', (table) => {
      table.string('id').primary()
      table
        .string('order_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_orders')
        .onDelete('CASCADE')

      // Kept for restocking and reporting, but nulled rather than cascading:
      // deleting a product must not delete order history.
      table
        .string('variant_id')
        .nullable()
        .references('id')
        .inTable('ecommerce_product_variants')
        .onDelete('SET NULL')
      table.string('product_id').nullable()

      table.string('title').notNullable()
      table.string('variant_title').nullable()
      table.string('sku', 96).nullable()
      table.string('image_url').nullable()
      table.string('product_type', 16).notNullable().defaultTo('physical')

      table.integer('quantity').notNullable()
      table.bigInteger('unit_amount').notNullable()
      table.bigInteger('subtotal_amount').notNullable()
      // The order-level discount and tax, allocated across lines so the parts
      // always sum back to the whole — see `Money.allocate`.
      table.bigInteger('discount_amount').notNullable().defaultTo(0)
      table.bigInteger('tax_amount').notNullable().defaultTo(0)
      table.bigInteger('total_amount').notNullable()

      table.integer('refunded_quantity').notNullable().defaultTo(0)

      table.timestamps(true, true)
      table.index(['order_id'], 'ecom_order_items_order_index')
    })

    /**
     * Append-only status history. Every transition lands here with who did it
     * and why, which is what makes "when did this become refunded, and on whose
     * authority" answerable months later.
     */
    this.schema.createTable('ecommerce_order_events', (table) => {
      table.string('id').primary()
      table
        .string('order_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_orders')
        .onDelete('CASCADE')

      table.string('type', 48).notNullable() // order.paid, order.refunded, …
      table.string('from_status', 24).nullable()
      table.string('to_status', 24).nullable()
      table.text('message').nullable()
      table.jsonb('meta').notNullable().defaultTo('{}')

      table.string('actor_type', 16).notNullable().defaultTo('system')
      table.string('actor_id').nullable()
      table.string('actor_label').nullable()

      table.timestamp('created_at').notNullable()
      table.index(['order_id', 'created_at'], 'ecom_order_events_index')
    })
  }

  async down() {
    this.schema.dropTable('ecommerce_order_events')
    this.schema.dropTable('ecommerce_order_items')
    this.schema.dropTable('ecommerce_orders')
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

/** Payments, refunds, webhook events and idempotency keys. */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ecommerce_payments', (table) => {
      table.string('id').primary()
      table
        .string('order_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_orders')
        .onDelete('CASCADE')

      table.string('gateway', 32).notNullable() // stripe | paypal
      table.string('mode', 8).notNullable() // test | live

      /**
       * The gateway's own identifier for this payment (a Stripe Checkout
       * Session id, a PayPal order id).
       *
       * Unique, and that uniqueness is load-bearing: it is how a duplicate
       * webhook or a redirect-and-webhook race resolves to one payment rather
       * than two.
       */
      table.string('gateway_payment_id').notNullable().unique()
      table.string('gateway_customer_id').nullable()

      table.string('status', 24).notNullable().defaultTo('pending')
      table.bigInteger('amount').notNullable()
      table.string('currency', 3).notNullable()

      // What the gateway told us, kept for support and dispute handling.
      table.jsonb('gateway_payload').notNullable().defaultTo('{}')
      table.string('failure_message', 512).nullable()

      table.timestamp('authorized_at').nullable()
      table.timestamp('captured_at').nullable()

      table.timestamps(true, true)

      table.index(['order_id'], 'ecom_payments_order_index')
      table.index(['gateway', 'status'], 'ecom_payments_gateway_index')
    })

    this.schema.createTable('ecommerce_refunds', (table) => {
      table.string('id').primary()
      table
        .string('order_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_orders')
        .onDelete('CASCADE')
      table
        .string('payment_id')
        .nullable()
        .references('id')
        .inTable('ecommerce_payments')
        .onDelete('SET NULL')

      table.bigInteger('amount').notNullable()
      table.string('currency', 3).notNullable()
      table.string('reason', 255).nullable()
      table.string('status', 24).notNullable().defaultTo('pending')

      // Unique for the same reason as `gateway_payment_id`: a replayed refund
      // webhook must not credit the customer twice.
      table.string('gateway_refund_id').nullable().unique()
      table.jsonb('gateway_payload').notNullable().defaultTo('{}')

      table
        .integer('created_by_user_id')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.timestamps(true, true)

      table.index(['order_id'], 'ecom_refunds_order_index')
    })

    /**
     * Raw webhook deliveries.
     *
     * Every delivery is written here *before* it is acted on, and the unique
     * `(gateway, event_id)` is the idempotency boundary for the whole payment
     * flow. Gateways retry aggressively and deliver out of order; without this,
     * a retried `payment_succeeded` would run its side effects twice.
     *
     * The row is also the audit trail for anything that went wrong, which is
     * why the raw payload is kept rather than just the parsed result.
     */
    this.schema.createTable('ecommerce_webhook_events', (table) => {
      table.string('id').primary()

      table.string('gateway', 32).notNullable()
      table.string('event_id', 255).notNullable()
      table.string('event_type', 96).notNullable()

      table.jsonb('payload').notNullable().defaultTo('{}')

      // received → processed | failed | ignored
      table.string('status', 16).notNullable().defaultTo('received')
      table.integer('attempts').notNullable().defaultTo(0)
      table.string('last_error', 512).nullable()
      table.timestamp('processed_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.unique(['gateway', 'event_id'])
      // Drives the reconcile sweep that re-drives anything the queue dropped.
      table.index(['status', 'created_at'], 'ecom_webhook_events_status_index')
    })

    /**
     * Idempotency keys for client-initiated writes (checkout, above all).
     *
     * A checkout POST that times out client-side gets retried; without this the
     * retry creates a second order and, once paid, a second charge. The stored
     * response means the retry sees exactly what the first call returned.
     */
    this.schema.createTable('ecommerce_idempotency_keys', (table) => {
      table.string('id').primary()

      table.string('key', 128).notNullable()
      /**
       * Scopes the key to whoever supplied it (cart token or customer id), so
       * one caller cannot claim another's key and read back their response.
       */
      table.string('actor_fingerprint', 64).notNullable()

      // Hash of the request body: the same key with a *different* body is a
      // client bug, not a retry, and must be rejected rather than answered with
      // the wrong stored response.
      table.string('request_hash', 64).notNullable()

      table.string('status', 16).notNullable().defaultTo('in_flight') // in_flight | done
      table.integer('response_status').nullable()
      table.jsonb('response_body').nullable()

      table.timestamp('expires_at').notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.unique(['key', 'actor_fingerprint'])
      table.index(['expires_at'], 'ecom_idempotency_expiry_index')
    })
  }

  async down() {
    this.schema.dropTable('ecommerce_idempotency_keys')
    this.schema.dropTable('ecommerce_webhook_events')
    this.schema.dropTable('ecommerce_refunds')
    this.schema.dropTable('ecommerce_payments')
  }
}

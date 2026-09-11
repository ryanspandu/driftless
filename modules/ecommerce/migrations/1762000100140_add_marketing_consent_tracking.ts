import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * What is needed before the shop may email someone who did not ask for it.
 *
 * A basket reminder is marketing, not transactional: nobody requested it, and
 * sending it without consent and a working unsubscribe is how a domain gets
 * blocklisted — which then takes the *receipts* down with it.
 *
 * Three things, all of them load-bearing:
 *
 * - `unsubscribe_token` on the customer, so every message can carry a one-click
 *   opt-out that needs no login. Without it the link would have to identify
 *   someone by email address, which is guessable.
 * - `reminded_at` on the cart, so a basket is reminded **once**. A nightly sweep
 *   with no memory sends the same person the same email every night.
 * - `unsubscribed_at` alongside the existing `accepts_marketing`, so opting out
 *   is recorded as an event with a date rather than a flag someone might flip
 *   back by editing a profile.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_customers', (table) => {
      table.string('unsubscribe_token', 64).nullable().unique()
      table.timestamp('unsubscribed_at').nullable()
    })

    this.schema.alterTable('ecommerce_carts', (table) => {
      table.timestamp('reminded_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_carts', (table) => {
      table.dropColumn('reminded_at')
    })

    this.schema.alterTable('ecommerce_customers', (table) => {
      table.dropColumn('unsubscribe_token')
      table.dropColumn('unsubscribed_at')
    })
  }
}

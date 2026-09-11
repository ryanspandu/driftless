import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * How a physical order actually got to the buyer.
 *
 * Without these an order could be marked `fulfilled` but the buyer had no way
 * to know it had shipped, let alone where it was — they found out when it
 * arrived. A carrier and a tracking number are the minimum that makes
 * "fulfilled" mean something to the person waiting.
 *
 * Plain columns on the order rather than a shipments table: this module does
 * not support splitting one order across several parcels, and modelling a
 * one-to-many for a relationship that is always one-to-one would be inventing
 * complexity to look thorough.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_orders', (table) => {
      table.string('carrier', 80).nullable()
      table.string('tracking_number', 120).nullable()
      /** Where the buyer can follow it. Built by the operator, not guessed. */
      table.string('tracking_url', 500).nullable()
      table.timestamp('shipped_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_orders', (table) => {
      table.dropColumn('carrier')
      table.dropColumn('tracking_number')
      table.dropColumn('tracking_url')
      table.dropColumn('shipped_at')
    })
  }
}

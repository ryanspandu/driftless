import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Generalise the storefront identity: `customer` → `account`.
 *
 * The table now backs more than buyers (affiliates are storefront accounts too),
 * so the name is generalised. Postgres keeps every foreign-key constraint and
 * index valid across a table/column rename — only the names change, no data moves.
 *
 * Runs after the create migrations, so a fresh database still creates
 * `ecommerce_customers` first and then renames it here.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.renameTable('ecommerce_customers', 'ecommerce_accounts')
    this.schema.renameTable('ecommerce_customer_sessions', 'ecommerce_account_sessions')

    for (const table of [
      'ecommerce_account_sessions',
      'ecommerce_addresses',
      'ecommerce_carts',
      'ecommerce_orders',
      'ecommerce_discount_redemptions',
      'ecommerce_affiliates',
    ]) {
      this.schema.alterTable(table, (t) => t.renameColumn('customer_id', 'account_id'))
    }
  }

  async down() {
    for (const table of [
      'ecommerce_account_sessions',
      'ecommerce_addresses',
      'ecommerce_carts',
      'ecommerce_orders',
      'ecommerce_discount_redemptions',
      'ecommerce_affiliates',
    ]) {
      this.schema.alterTable(table, (t) => t.renameColumn('account_id', 'customer_id'))
    }

    this.schema.renameTable('ecommerce_account_sessions', 'ecommerce_customer_sessions')
    this.schema.renameTable('ecommerce_accounts', 'ecommerce_customers')
  }
}

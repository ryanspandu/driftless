import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Turn affiliates into storefront accounts with a real payout/withdrawal flow.
 *
 * - Affiliates are now backed by an `ecommerce_accounts` row (apply → approve),
 *   enforced one-per-account, with a structured (encrypted) payout method.
 * - Commissions can be attached to a withdrawal request; balances are computed
 *   from the commission ledger, so the old denormalised-total drift on refunds
 *   no longer affects what an affiliate sees.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ecommerce_affiliate_withdrawals', (table) => {
      table.string('id').primary()
      table
        .string('affiliate_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_affiliates')
        .onDelete('CASCADE')
      table.bigInteger('amount').notNullable().defaultTo(0)
      table.string('currency', 3).notNullable()
      // requested → paid | rejected. Payout itself stays manual/out-of-band.
      table.string('status', 16).notNullable().defaultTo('requested')
      // Snapshot of the payout method at request time, encrypted (never serialised).
      table.text('payout_method_snapshot_enc').nullable()
      table.timestamp('requested_at').notNullable()
      table.timestamp('processed_at').nullable()
      table
        .integer('processed_by_user_id')
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.text('rejection_reason').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['affiliate_id', 'status'], 'ecom_affiliate_withdrawals_affiliate_index')
      table.index(['status', 'requested_at'], 'ecom_affiliate_withdrawals_status_index')
    })

    // A commission belongs to at most one withdrawal; unlinked+approved = available.
    this.schema.alterTable('ecommerce_commissions', (table) => {
      table
        .string('withdrawal_id')
        .nullable()
        .references('id')
        .inTable('ecommerce_affiliate_withdrawals')
        .onDelete('SET NULL')
      table.index(['withdrawal_id'], 'ecom_commissions_withdrawal_index')
    })

    this.schema.alterTable('ecommerce_affiliates', (table) => {
      // Structured, encrypted payout instrument (replaces the free-text one).
      table.text('payout_method_enc').nullable()
      // When the account applied — orders the admin's applications queue.
      table.timestamp('applied_at').nullable()
    })

    // At most one live affiliate per account (guest/null and soft-deleted rows unaffected).
    this.schema.raw(
      'CREATE UNIQUE INDEX ecom_affiliates_account_unique ON ecommerce_affiliates (account_id) WHERE account_id IS NOT NULL AND deleted_at IS NULL'
    )

    this.schema.alterTable('ecommerce_settings', (table) => {
      table.bigInteger('affiliate_min_withdrawal_amount').notNullable().defaultTo(0)
      table.integer('affiliate_default_commission_milli').notNullable().defaultTo(10_000)
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_settings', (table) => {
      table.dropColumn('affiliate_min_withdrawal_amount')
      table.dropColumn('affiliate_default_commission_milli')
    })
    this.schema.raw('DROP INDEX IF EXISTS ecom_affiliates_account_unique')
    this.schema.alterTable('ecommerce_affiliates', (table) => {
      table.dropColumn('payout_method_enc')
      table.dropColumn('applied_at')
    })
    this.schema.alterTable('ecommerce_commissions', (table) => {
      table.dropIndex(['withdrawal_id'], 'ecom_commissions_withdrawal_index')
      table.dropColumn('withdrawal_id')
    })
    this.schema.dropTable('ecommerce_affiliate_withdrawals')
  }
}

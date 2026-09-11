import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A buyer's right to download one asset from one paid order.
 *
 * The grant is the paywall. `ecommerce_digital_assets.storage_path` points
 * outside the static root, so the only route to the bytes is a row here — which
 * makes every download countable, expirable and revocable, and none of that
 * depends on the file's location staying secret.
 *
 * Note what this table does **not** have: a token of its own. Access is
 * authorised by the order's existing `access_token_hash`, so the buyer holds one
 * credential rather than two — and the download link keeps working as long as
 * their order link does, instead of dying with the email that carried it.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ecommerce_download_grants', (table) => {
      table.string('id').primary()

      table
        .string('order_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_orders')
        .onDelete('CASCADE')

      /**
       * Which line paid for this. Kept alongside `asset_id` because an order
       * can contain the same digital variant twice (a gift, a second licence),
       * and each line earns its own quota.
       */
      table
        .string('order_item_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_order_items')
        .onDelete('CASCADE')

      /**
       * `RESTRICT`, not `CASCADE`.
       *
       * Deleting a product must never silently revoke downloads someone has
       * already paid for. Assets are soft-deleted instead; this constraint is
       * what makes that the only option.
       */
      table
        .string('asset_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_digital_assets')
        .onDelete('RESTRICT')

      table.integer('downloads_count').notNullable().defaultTo(0)
      /** Copied from the asset at grant time; 0 means unlimited. */
      table.integer('max_downloads').notNullable().defaultTo(0)

      table.timestamp('expires_at').nullable()
      table.timestamp('revoked_at').nullable()
      table.timestamp('last_downloaded_at').nullable()
      /** Hashed, like every other IP in this schema — see the audit log. */
      table.string('last_download_ip_hash', 64).nullable()

      table.timestamps(true, true)

      table.index(['order_id'], 'ecom_download_grants_order_index')
      table.index(['asset_id'], 'ecom_download_grants_asset_index')
    })
  }

  async down() {
    this.schema.dropTable('ecommerce_download_grants')
  }
}

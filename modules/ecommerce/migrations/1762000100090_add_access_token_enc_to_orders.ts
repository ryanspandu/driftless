import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A recoverable copy of the order's access token.
 *
 * `access_token_hash` stays exactly as it was — it is what every lookup matches
 * against, and it is what makes a leaked backup useless for *finding* an order.
 * This column exists for one reason: the confirmation email is sent from
 * `markOrderPaid`, which is reached by a webhook that has no plaintext token,
 * so without a recoverable copy the buyer's own link cannot be put in the email
 * that is supposed to carry it.
 *
 * The trade-off, stated plainly: an attacker holding both the database and
 * `APP_KEY` can read order links. That is the same exposure the gateway secret
 * keys and affiliate payout details already carry, and an order link is
 * strictly less valuable than either — it grants read access to one order and
 * its downloads, and nothing else. The alternative, emailing no link at all, is
 * worse for every buyer in exchange for protection only against an attacker who
 * already holds the key that decrypts the payment credentials.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_orders', (table) => {
      table.text('access_token_enc').nullable()
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_orders', (table) => {
      table.dropColumn('access_token_enc')
    })
  }
}

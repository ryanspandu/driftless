import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { publicError } from '#exceptions/public_error'

/**
 * Stock reservation and release.
 *
 * Stock is split across two columns: `stock_on_hand` is what is physically
 * there, `stock_reserved` is what open checkouts are holding. Available is the
 * difference. Keeping them separate means an abandoned checkout releases its
 * hold without ever having pretended the goods left the building.
 *
 * **Every mutation here is a conditional UPDATE, never a read-modify-write.**
 * The pattern used elsewhere in this codebase — `SELECT`, check in JavaScript,
 * `UPDATE` — is a TOCTOU race, and on inventory the prize for winning it is
 * selling the same last item twice.
 */

/**
 * `GREATEST(a, b)` on PostgreSQL, `MAX(a, b)` on SQLite.
 *
 * The two-argument scalar maximum is spelled differently in each, and the test
 * suite runs on SQLite while production runs on PostgreSQL — so a raw
 * `GREATEST` would pass review and then fail every test.
 */
function greatest(column: string, subtract: number, floor = 0): string {
  const fn = db.connection().dialect.name === 'postgres' ? 'GREATEST' : 'MAX'
  return `${fn}(${column} - ${Number(subtract)}, ${Number(floor)})`
}

export interface ReservationLine {
  variantId: string
  quantity: number
}

export interface StockShortfall {
  variantId: string
  requested: number
  available: number
  title: string
}

export default class InventoryService {
  /**
   * Reserve stock for every line, or nothing at all.
   *
   * The guard is in the WHERE clause:
   *
   * ```sql
   * UPDATE … SET stock_reserved = stock_reserved + ?
   * WHERE id = ? AND (NOT track_inventory OR allow_backorder
   *                   OR stock_on_hand - stock_reserved >= ?)
   * ```
   *
   * Zero rows affected means someone else took the last unit between our read
   * and our write — the database decided, not us. Rolling the transaction back
   * then releases whatever earlier lines had claimed, so a partial reservation
   * can never be left behind.
   */
  async reserve(lines: ReservationLine[], trx: TransactionClientContract): Promise<void> {
    const shortfalls: StockShortfall[] = []

    for (const line of lines) {
      if (line.quantity <= 0) continue

      const affected = await trx
        .from('ecommerce_product_variants')
        .where('id', line.variantId)
        .whereNull('deleted_at')
        .where((q) => {
          q.where('track_inventory', false)
            .orWhere('allow_backorder', true)
            .orWhereRaw('stock_on_hand - stock_reserved >= ?', [line.quantity])
        })
        .increment('stock_reserved', line.quantity)

      if (Number(affected) === 0) {
        // Read back only to build a useful message — the decision was already
        // made by the UPDATE above.
        const variant = await trx
          .from('ecommerce_product_variants')
          .where('id', line.variantId)
          .select('title', 'stock_on_hand', 'stock_reserved')
          .first()

        shortfalls.push({
          variantId: line.variantId,
          requested: line.quantity,
          available: variant
            ? Math.max(Number(variant.stock_on_hand) - Number(variant.stock_reserved), 0)
            : 0,
          title: variant?.title ?? 'This item',
        })
      }
    }

    if (shortfalls.length > 0) {
      const first = shortfalls[0]!
      throw publicError.conflict(
        shortfalls.length === 1
          ? `${first.title} only has ${first.available} left.`
          : `${shortfalls.length} items in your basket are no longer available in the quantity you asked for.`,
        'out_of_stock'
      )
    }
  }

  /**
   * Release a reservation without shipping anything — an expired or cancelled
   * order.
   *
   * Floored at zero so a double release cannot drive the counter negative,
   * which would silently inflate available stock.
   */
  async release(lines: ReservationLine[], trx: TransactionClientContract): Promise<void> {
    for (const line of lines) {
      if (line.quantity <= 0) continue

      await trx
        .from('ecommerce_product_variants')
        .where('id', line.variantId)
        .update({
          stock_reserved: db.raw(greatest('stock_reserved', line.quantity)),
        })
    }
  }

  /**
   * Convert a reservation into a sale: the units leave both counters.
   *
   * Called when an order is paid, not when it ships — the goods are committed
   * the moment the money is taken, and holding a reservation open past payment
   * would let the expiry sweep release stock that has already been sold.
   */
  async commit(lines: ReservationLine[], trx: TransactionClientContract): Promise<void> {
    for (const line of lines) {
      if (line.quantity <= 0) continue

      await trx
        .from('ecommerce_product_variants')
        .where('id', line.variantId)
        .update({
          stock_on_hand: db.raw(greatest('stock_on_hand', line.quantity)),
          stock_reserved: db.raw(greatest('stock_reserved', line.quantity)),
        })
    }
  }

  /** Put units back on the shelf — a refund or a cancelled paid order. */
  async restock(lines: ReservationLine[], trx: TransactionClientContract): Promise<void> {
    for (const line of lines) {
      if (line.quantity <= 0) continue
      await trx
        .from('ecommerce_product_variants')
        .where('id', line.variantId)
        .increment('stock_on_hand', line.quantity)
    }
  }
}

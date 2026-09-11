import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { Money, type MoneyDto } from '#modules/ecommerce/services/money'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'

const settings = new StoreSettingsService()

export interface SalesPoint {
  /** `YYYY-MM-DD`, one entry per day including days with no sales. */
  date: string
  /** Minor units. The chart needs a number it can plot, not a formatted string. */
  revenue: number
  orders: number
}

export interface TopProduct {
  productId: string | null
  title: string
  quantity: number
  revenue: MoneyDto
}

export interface AbandonedCart {
  id: string
  email: string | null
  itemCount: number
  value: MoneyDto
  updatedAt: string
  /** True when there is an email to reach them on. */
  reachable: boolean
}

export interface SalesReport {
  currency: string
  days: number
  /**
   * Every currency with paid orders in the window, so the UI can offer a
   * switch rather than pretending the shown one is all there is.
   */
  currenciesWithSales: string[]
  series: SalesPoint[]
  topProducts: TopProduct[]
  /** Revenue over the window, so the chart's own total is server-derived. */
  windowRevenue: MoneyDto
  windowOrders: number
}

/** Coerce a driver-dependent aggregate (pg returns strings) to a number. */
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'string' ? Number(value) : (value as number)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * The date part of a timestamp, in whichever dialect is running.
 *
 * pg and SQLite disagree here and there is no portable expression, so this is
 * one of the handful of places the module branches on the driver. Grouping in
 * SQL rather than in JavaScript matters: pulling every paid order into memory
 * to bucket it would turn a dashboard into a way to exhaust a worker's heap.
 */
function dateExpression(column: string): string {
  return db.connection().dialect.name === 'postgres'
    ? `to_char(${column}, 'YYYY-MM-DD')`
    : `strftime('%Y-%m-%d', ${column})`
}

export default class AnalyticsService {
  /**
   * Sales over a window, day by day, plus what sold most.
   *
   * Revenue counts money actually kept — `total - refunded` — so an order that
   * was paid and then refunded contributes zero rather than its face value. A
   * dashboard that counts refunded sales as revenue is a dashboard that lies in
   * exactly the situation where the truth matters.
   */
  async sales(days = 30, currency?: string | null): Promise<SalesReport> {
    const window = Math.min(Math.max(Math.trunc(days), 1), 365)
    const store = await settings.getOrCreate()
    const since = DateTime.now()
      .minus({ days: window - 1 })
      .startOf('day')

    /**
     * **One currency at a time, always.**
     *
     * Summing orders across currencies would produce a number that means
     * nothing — this module has no exchange rates by design, so there is no
     * honest way to add €90 to $100. The report picks a currency, says which
     * one, and lists the others that had sales so nothing is hidden.
     */
    const reported = (currency ?? store.currency).toUpperCase()

    const activeRows = await db
      .from('ecommerce_orders')
      .whereNull('deleted_at')
      .whereNotNull('paid_at')
      .where('paid_at', '>=', since.toSQL()!)
      .distinct('currency')
      .select('currency')

    const currenciesWithSales = activeRows
      .map((row) => String(row.currency).toUpperCase())
      .sort((a, b) => a.localeCompare(b))

    const rows = await db
      .from('ecommerce_orders')
      .whereNull('deleted_at')
      .whereNotNull('paid_at')
      .where('currency', reported)
      .where('paid_at', '>=', since.toSQL()!)
      .select(db.raw(`${dateExpression('paid_at')} as day`))
      .sum({ gross: 'total_amount' })
      .sum({ refunded: 'refunded_amount' })
      .count({ orders: '*' })
      .groupByRaw(dateExpression('paid_at'))

    const byDay = new Map<string, { revenue: number; orders: number }>()
    for (const row of rows) {
      const day = String((row as { day: string }).day)
      byDay.set(day, {
        revenue: Math.max(toNumber(row.gross) - toNumber(row.refunded), 0),
        orders: toNumber(row.orders),
      })
    }

    /**
     * Every day in the window, including the empty ones. A series with gaps
     * makes a chart draw a straight line across a quiet week, which reads as
     * steady trade rather than none.
     */
    const series: SalesPoint[] = []
    for (let offset = 0; offset < window; offset++) {
      const date = since.plus({ days: offset }).toFormat('yyyy-MM-dd')
      const point = byDay.get(date)
      series.push({ date, revenue: point?.revenue ?? 0, orders: point?.orders ?? 0 })
    }

    const windowRevenue = series.reduce((sum, point) => sum + point.revenue, 0)
    const windowOrders = series.reduce((sum, point) => sum + point.orders, 0)

    return {
      currency: reported,
      days: window,
      currenciesWithSales,
      series,
      topProducts: await this.topProducts(since, reported, store.locale),
      windowRevenue: Money.toDto(windowRevenue, reported, store.locale),
      windowOrders,
    }
  }

  /**
   * What sold most over the window, by units.
   *
   * Grouped on the **snapshot title** rather than joined to the product, so a
   * line whose product was later deleted still appears — the sale happened, and
   * a report that quietly drops it is wrong about the past.
   */
  private async topProducts(
    since: DateTime,
    currency: string,
    locale: string
  ): Promise<TopProduct[]> {
    const rows = await db
      .from('ecommerce_order_items as i')
      .join('ecommerce_orders as o', 'o.id', 'i.order_id')
      .whereNull('o.deleted_at')
      .whereNotNull('o.paid_at')
      // Same currency as the report it belongs to, for the same reason.
      .where('o.currency', currency)
      .where('o.paid_at', '>=', since.toSQL()!)
      .groupBy('i.title', 'i.product_id')
      .select('i.title', 'i.product_id')
      .sum({ quantity: 'i.quantity' })
      .sum({ revenue: 'i.total_amount' })
      .orderBy('quantity', 'desc')
      .limit(5)

    return rows.map((row) => ({
      productId: row.product_id ? String(row.product_id) : null,
      title: String(row.title),
      quantity: toNumber(row.quantity),
      revenue: Money.toDto(toNumber(row.revenue), currency, locale),
    }))
  }

  /**
   * Baskets that were filled and never checked out.
   *
   * Read-only, and deliberately so for now: this is a list to look at, not a
   * campaign tool. Emailing someone because they left a basket is a marketing
   * decision with consent implications, and it needs `accepts_marketing` and an
   * unsubscribe path before it is anything but a way to get the store's domain
   * blocklisted.
   *
   * Only carts that are **past the checkout window** count — a basket someone
   * is still filling is not abandoned, it is in use.
   */
  async abandonedCarts(limit = 25): Promise<AbandonedCart[]> {
    const store = await settings.getOrCreate()
    const cutoff = DateTime.now().minus({ minutes: store.checkoutTtlMinutes })

    const rows = await db
      .from('ecommerce_carts as c')
      .join('ecommerce_cart_items as ci', 'ci.cart_id', 'c.id')
      .join('ecommerce_product_variants as v', 'v.id', 'ci.variant_id')
      // Carts are not soft-deleted; they simply expire. There is no
      // `deleted_at` on this table to filter by.
      .where('c.updated_at', '<', cutoff.toSQL()!)
      .groupBy('c.id', 'c.email', 'c.updated_at')
      .select('c.id', 'c.email', 'c.updated_at')
      .sum({ itemCount: 'ci.quantity' })
      /**
       * A raw `select`, not `.sum(db.raw(...))` — knex mangles a raw passed to
       * `sum()`, splitting the expression across bogus aliases and producing a
       * syntax error rather than a wrong number. Better to be explicit.
       */
      .select(db.raw('SUM(ci.quantity * v.price_amount) as value'))
      .orderBy('c.updated_at', 'desc')
      .limit(Math.min(Math.max(Math.trunc(limit), 1), 200))

    return rows.map((row) => ({
      id: String(row.id),
      email: row.email ? String(row.email) : null,
      itemCount: toNumber(row.itemCount),
      /**
       * Priced from the variant's **current** price, not a stored one — carts
       * deliberately have no price column, and inventing one here to make a
       * report prettier would be the first crack in "the client never sends a
       * price".
       */
      value: Money.toDto(toNumber(row.value), store.currency, store.locale),
      updatedAt: String(row.updated_at),
      reachable: Boolean(row.email),
    }))
  }
}

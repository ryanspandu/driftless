import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { renderPage } from '#helpers/inertia_render'
import { Money, type MoneyDto } from '#modules/ecommerce/services/money'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import AnalyticsService from '#modules/ecommerce/services/analytics_service'

const settings = new StoreSettingsService()
const analytics = new AnalyticsService()

export interface StoreStatsDto {
  currency: string
  revenue: MoneyDto
  averageOrderValue: MoneyDto
  ordersCount: number
  paidOrdersCount: number
  pendingOrdersCount: number
  productsCount: number
  activeProductsCount: number
  lowStockCount: number
  customersCount: number
}

/** Coerce a driver-dependent aggregate (pg returns strings) to a number. */
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'string' ? Number(value) : (value as number)
  return Number.isFinite(parsed) ? parsed : 0
}

export default class EcommerceDashboardController {
  async page({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/ecommerce/admin/index', {})
  }

  async stats({ response }: HttpContext) {
    const store = await settings.getOrCreate()
    const currency = store.currency

    /**
     * Revenue counts money actually collected, so it sums `total - refunded`
     * over orders that reached a paid state. An order that was paid and then
     * fully refunded contributes zero rather than its face value.
     */
    const revenueRow = await db
      .from('ecommerce_orders')
      .whereNull('deleted_at')
      .whereIn('payment_status', ['paid', 'partially_refunded'])
      .sum({ gross: 'total_amount' })
      .sum({ refunded: 'refunded_amount' })
      .count({ paid: '*' })
      .first()

    const gross = toNumber(revenueRow?.gross)
    const refunded = toNumber(revenueRow?.refunded)
    const paidOrdersCount = toNumber(revenueRow?.paid)
    const revenue = Math.max(gross - refunded, 0)

    const ordersRow = await db
      .from('ecommerce_orders')
      .whereNull('deleted_at')
      .count({ total: '*' })
      .first()

    const pendingRow = await db
      .from('ecommerce_orders')
      .whereNull('deleted_at')
      .where('payment_status', 'unpaid')
      .whereNotIn('status', ['cancelled'])
      .count({ total: '*' })
      .first()

    const productsRow = await db
      .from('ecommerce_products')
      .whereNull('deleted_at')
      .count({ total: '*' })
      .first()

    const activeProductsRow = await db
      .from('ecommerce_products')
      .whereNull('deleted_at')
      .where('status', 'active')
      .count({ total: '*' })
      .first()

    /** Variants with five or fewer sellable units — the restock prompt. */
    const lowStockRow = await db
      .from('ecommerce_product_variants')
      .whereNull('deleted_at')
      .where('track_inventory', true)
      .where('allow_backorder', false)
      .whereRaw('(stock_on_hand - stock_reserved) <= ?', [5])
      .count({ total: '*' })
      .first()

    const customersRow = await db
      .from('ecommerce_customers')
      .whereNull('deleted_at')
      .count({ total: '*' })
      .first()

    const ordersCount = toNumber(ordersRow?.total)
    const averageOrderValue = paidOrdersCount > 0 ? Math.round(revenue / paidOrdersCount) : 0

    const dto: StoreStatsDto = {
      currency,
      revenue: Money.toDto(revenue, currency, store.locale),
      averageOrderValue: Money.toDto(averageOrderValue, currency, store.locale),
      ordersCount,
      paidOrdersCount,
      pendingOrdersCount: toNumber(pendingRow?.total),
      productsCount: toNumber(productsRow?.total),
      activeProductsCount: toNumber(activeProductsRow?.total),
      lowStockCount: toNumber(lowStockRow?.total),
      customersCount: toNumber(customersRow?.total),
    }

    return response.json(dto)
  }

  /** Revenue and units over a window, for the dashboard chart. */
  async sales({ request, response }: HttpContext) {
    const days = Number(request.input('days', 30)) || 30
    // A currency code, defaulting to the store's base. Reports are single-
    // currency by design — see `AnalyticsService.sales`.
    return response.json(await analytics.sales(days, request.input('currency') || null))
  }

  /**
   * Baskets filled and never checked out.
   *
   * Behind `orders:read` rather than a permission of its own — an abandoned
   * cart is an order that did not happen, and it carries the same customer
   * email an order would.
   */
  async abandonedCarts({ response }: HttpContext) {
    return response.json(await analytics.abandonedCarts())
  }
}

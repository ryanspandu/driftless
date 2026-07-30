import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { publicError } from '#exceptions/public_error'
import { Money } from '#modules/ecommerce/services/money'
import { csvDocument } from '#modules/ecommerce/services/csv'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'

const settings = new StoreSettingsService()

export interface ExportRange {
  /** Inclusive, ISO date or datetime. */
  from?: string | null
  /** Inclusive, ISO date or datetime. */
  to?: string | null
}

/**
 * How many rows one export may contain.
 *
 * An export builds the whole document in memory before sending it, so an
 * unbounded query on a busy store is a way to exhaust a worker's heap with a
 * single authenticated request. The cap is generous — a year of orders for most
 * stores — and the caller is *told* when it bites rather than silently handed a
 * truncated file, which is the failure mode that gets discovered during an
 * audit.
 */
const MAX_ROWS = 50_000

function parseBoundary(value: string | null | undefined, endOfDay: boolean): string | null {
  if (!value) return null
  const parsed = DateTime.fromISO(value)
  if (!parsed.isValid) {
    throw publicError.unprocessable('That date could not be read.', 'invalid_date')
  }
  return (endOfDay ? parsed.endOf('day') : parsed.startOf('day')).toSQL()
}

/**
 * A range as SQL boundaries, or nulls.
 *
 * Returned rather than applied, because the two dialects and the several
 * builders involved make a generic "apply to any builder" helper a pile of
 * casts. Two `if`s at each call site read better and cannot be wrong.
 */
function boundaries(range: ExportRange): { from: string | null; to: string | null } {
  return { from: parseBoundary(range.from, false), to: parseBoundary(range.to, true) }
}

function guardSize(count: number, what: string): void {
  if (count > MAX_ROWS) {
    throw publicError.unprocessable(
      `That range covers ${count.toLocaleString()} ${what}, more than the ${MAX_ROWS.toLocaleString()} an export can hold. Narrow the date range.`,
      'export_too_large'
    )
  }
}

function rowCount(result: unknown): number {
  const first = Array.isArray(result) ? result[0] : result
  return Number((first as { total?: string | number } | undefined)?.total ?? 0)
}

export default class ExportService {
  /**
   * Orders, one row per order.
   *
   * Amounts go out as **integer minor units alongside the currency**, never as
   * a formatted string: a spreadsheet should receive a number it can sum, not a
   * currency symbol it will silently treat as text. Whoever opens this can
   * format it themselves; nobody can un-format `$1,234.56` back into a number
   * without a find-and-replace that will eventually eat a decimal point.
   */
  async orders(range: ExportRange = {}): Promise<string> {
    const { from, to } = boundaries(range)

    const counted = db.from('ecommerce_orders').whereNull('deleted_at')
    if (from) counted.where('created_at', '>=', from)
    if (to) counted.where('created_at', '<=', to)
    guardSize(rowCount(await counted.count('* as total')), 'orders')

    const query = db
      .from('ecommerce_orders')
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
      .select(
        'number',
        'status',
        'payment_status',
        'fulfillment_status',
        'email',
        'currency',
        'subtotal_amount',
        'discount_amount',
        'tax_amount',
        'shipping_amount',
        'total_amount',
        'refunded_amount',
        'discount_code',
        'affiliate_code',
        'shipping_address',
        'created_at',
        'paid_at'
      )

    if (from) query.where('created_at', '>=', from)
    if (to) query.where('created_at', '<=', to)
    const rows = await query

    const address = (raw: unknown): string => {
      if (!raw) return ''
      const parsed = typeof raw === 'string' ? safeJson(raw) : (raw as Record<string, unknown>)
      if (!parsed) return ''
      return [
        parsed.line1,
        parsed.line2,
        parsed.city,
        parsed.state,
        parsed.postalCode,
        parsed.country,
      ]
        .filter(Boolean)
        .join(', ')
    }

    return csvDocument(
      [
        'order_number',
        'status',
        'payment_status',
        'fulfillment_status',
        'email',
        'currency',
        'subtotal_minor',
        'discount_minor',
        'tax_minor',
        'shipping_minor',
        'total_minor',
        'refunded_minor',
        'total_major',
        'discount_code',
        'affiliate_code',
        'shipping_address',
        'placed_at',
        'paid_at',
      ],
      rows.map((row) => [
        row.number,
        row.status,
        row.payment_status,
        row.fulfillment_status,
        row.email,
        row.currency,
        Number(row.subtotal_amount ?? 0),
        Number(row.discount_amount ?? 0),
        Number(row.tax_amount ?? 0),
        Number(row.shipping_amount ?? 0),
        Number(row.total_amount ?? 0),
        Number(row.refunded_amount ?? 0),
        // The decimal rendering as well, because accountants ask for it. Derived
        // from the same integer, so the two columns cannot disagree.
        Money.toMajor(Number(row.total_amount ?? 0), String(row.currency ?? 'USD')),
        row.discount_code ?? '',
        row.affiliate_code ?? '',
        address(row.shipping_address),
        row.created_at,
        row.paid_at ?? '',
      ])
    )
  }

  /** Order lines, for anyone reconciling what actually sold. */
  async orderItems(range: ExportRange = {}): Promise<string> {
    const { from, to } = boundaries(range)

    const counted = db
      .from('ecommerce_order_items as i')
      .join('ecommerce_orders as o', 'o.id', 'i.order_id')
      .whereNull('o.deleted_at')
    if (from) counted.where('o.created_at', '>=', from)
    if (to) counted.where('o.created_at', '<=', to)
    guardSize(rowCount(await counted.count('* as total')), 'order lines')

    const query = db
      .from('ecommerce_order_items as i')
      .join('ecommerce_orders as o', 'o.id', 'i.order_id')
      .whereNull('o.deleted_at')
      .orderBy('o.created_at', 'desc')
      .select(
        'o.number as order_number',
        'o.currency',
        'o.created_at',
        'i.title',
        'i.variant_title',
        'i.sku',
        'i.quantity',
        'i.unit_amount',
        'i.total_amount',
        'i.refunded_quantity'
      )

    if (from) query.where('o.created_at', '>=', from)
    if (to) query.where('o.created_at', '<=', to)
    const rows = await query

    return csvDocument(
      [
        'order_number',
        'placed_at',
        'title',
        'variant',
        'sku',
        'quantity',
        'unit_minor',
        'line_total_minor',
        'currency',
        'refunded_quantity',
      ],
      rows.map((row) => [
        row.order_number,
        row.created_at,
        row.title,
        row.variant_title ?? '',
        row.sku ?? '',
        Number(row.quantity ?? 0),
        Number(row.unit_amount ?? 0),
        Number(row.total_amount ?? 0),
        row.currency,
        Number(row.refunded_quantity ?? 0),
      ])
    )
  }

  /**
   * Customers.
   *
   * Deliberately narrow. There is no password column here, no session token and
   * no address — an export is a file that ends up on a laptop, in an email and
   * in a backup, so it carries the minimum that makes it useful and nothing
   * that would matter if it leaked.
   */
  async customers(range: ExportRange = {}): Promise<string> {
    const { from, to } = boundaries(range)

    const counted = db.from('ecommerce_customers').whereNull('deleted_at')
    if (from) counted.where('created_at', '>=', from)
    if (to) counted.where('created_at', '<=', to)
    guardSize(rowCount(await counted.count('* as total')), 'customers')

    const store = await settings.getOrCreate()
    const query = db
      .from('ecommerce_customers')
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
      .select(
        'email',
        'first_name',
        'last_name',
        'status',
        'accepts_marketing',
        'orders_count',
        'total_spent_amount',
        'email_verified_at',
        'created_at'
      )

    if (from) query.where('created_at', '>=', from)
    if (to) query.where('created_at', '<=', to)
    const rows = await query

    return csvDocument(
      [
        'email',
        'first_name',
        'last_name',
        'status',
        'accepts_marketing',
        'orders_count',
        'total_spent_minor',
        'currency',
        'email_verified_at',
        'created_at',
      ],
      rows.map((row) => [
        row.email,
        row.first_name ?? '',
        row.last_name ?? '',
        row.status,
        row.accepts_marketing ? 'yes' : 'no',
        Number(row.orders_count ?? 0),
        Number(row.total_spent_amount ?? 0),
        store.currency,
        row.email_verified_at ?? '',
        row.created_at,
      ])
    )
  }

  /**
   * Products and their variants, one row per variant.
   *
   * This is the one export that includes `cost_amount`. It is behind
   * `products:read`, which is a staff permission — but it is worth stating
   * plainly, because cost price is the single field that must never reach a
   * storefront response, and an export is the one place it legitimately
   * appears.
   */
  async products(): Promise<string> {
    guardSize(
      rowCount(
        await db.from('ecommerce_product_variants').whereNull('deleted_at').count('* as total')
      ),
      'variants'
    )

    const rows = await db
      .from('ecommerce_product_variants as v')
      .join('ecommerce_products as p', 'p.id', 'v.product_id')
      .whereNull('p.deleted_at')
      .whereNull('v.deleted_at')
      .orderBy('p.title', 'asc')
      .select(
        'p.title as product',
        'p.slug',
        'p.status',
        'p.type',
        'p.currency',
        'v.title as variant',
        'v.sku',
        'v.price_amount',
        'v.compare_at_amount',
        'v.cost_amount',
        'v.stock_on_hand',
        'v.stock_reserved',
        'v.track_inventory'
      )

    return csvDocument(
      [
        'product',
        'slug',
        'status',
        'type',
        'variant',
        'sku',
        'currency',
        'price_minor',
        'compare_at_minor',
        'cost_minor',
        'stock_on_hand',
        'stock_reserved',
        'tracks_inventory',
      ],
      rows.map((row) => [
        row.product,
        row.slug,
        row.status,
        row.type,
        row.variant,
        row.sku ?? '',
        row.currency,
        Number(row.price_amount ?? 0),
        row.compare_at_amount === null ? '' : Number(row.compare_at_amount),
        row.cost_amount === null ? '' : Number(row.cost_amount),
        Number(row.stock_on_hand ?? 0),
        Number(row.stock_reserved ?? 0),
        row.track_inventory ? 'yes' : 'no',
      ])
    )
  }
}

function safeJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

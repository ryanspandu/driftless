import crypto from 'node:crypto'
import { DateTime } from 'luxon'
import { UAParser } from 'ua-parser-js'
import db from '@adonisjs/lucid/services/db'
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import { newUlid } from '#services/ulid_service'
import Product from '#modules/ecommerce/models/product'
import { csvDocument } from '#modules/ecommerce/services/csv'

/** One row of the "top products by outbound click" report. */
export interface OutboundClickRow {
  productId: string
  title: string
  slug: string
  externalUrl: string | null
  externalLabel: string | null
  clicks: number
  lastClickedAt: string | null
}

/**
 * One individual click, for a product's detail history.
 *
 * No IP field: the stored value is an HMAC hash (never the raw address, see
 * `hashIp` below), so there is nothing displayable to return — the same
 * privacy stance `analytics_service.ts` and `affiliate_service.ts` already
 * take on every other click/pageview table in this codebase.
 */
export interface ClickHistoryRow {
  createdAt: string
  deviceType: 'desktop' | 'mobile' | 'tablet'
  browser: string | null
  os: string | null
  referrer: string | null
}

/**
 * Bot User-Agents, recording nothing for these. Duplicated (not imported) from
 * `app/services/analytics_service.ts` — that helper isn't exported, and this is
 * the same small-duplication tradeoff `hashIp` already makes between
 * `analytics_service.ts` and `affiliate_service.ts` in this codebase, rather
 * than reaching across the module boundary for a ~10-line regex.
 */
const BOT_UA =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|monitor|pingdom|lighthouse|preview/i

/** Keyed so the stored value is not reversible from a rainbow table. */
function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  return crypto.createHmac('sha256', env.get('APP_KEY').release()).update(ip).digest('hex')
}

/**
 * Device/browser/OS from a stored User-Agent string. Duplicated (not
 * imported) from `analytics_service.ts`'s private `parseUa()` — same
 * ~10-line-helper tradeoff as `BOT_UA`/`hashIp` above.
 */
function parseUa(ua: string): {
  deviceType: ClickHistoryRow['deviceType']
  browser: string | null
  os: string | null
} {
  if (!ua) return { deviceType: 'desktop', browser: null, os: null }
  const r = new UAParser(ua).getResult()
  const t = r.device.type
  return {
    deviceType: t === 'mobile' ? 'mobile' : t === 'tablet' ? 'tablet' : 'desktop',
    browser: r.browser.name?.slice(0, 64) ?? null,
    os: r.os.name?.slice(0, 64) ?? null,
  }
}

/**
 * Click-tracking for a product's `external` (affiliate) buy button.
 *
 * Mirrors `AffiliateService.recordClick()`/`pruneClicks()` closely — this is
 * the same "record then redirect" shape, applied to a different link. Kept as
 * its own service/table rather than folded into the referral-affiliate system:
 * that one is keyed on a referral `code` and tied to the commission ledger,
 * an entirely unrelated concept from a product's own outbound buy-button link.
 */
export default class ProductCtaClickService {
  /**
   * Record a click and return the URL to redirect to, or `null` if this
   * product cannot legitimately be the target — unpublished, not an `external`
   * listing, or missing its URL. Nothing is written in that case either, the
   * same "unknown target writes nothing" guard `/ref/:code` uses.
   */
  async recordClick(ctx: HttpContext, productId: string): Promise<string | null> {
    const product = await Product.query().where('id', productId).whereNull('deleted_at').first()

    if (!product || product.status !== 'active') return null
    if (product.ctaMode !== 'external' || !product.externalUrl) return null

    const ua = ctx.request.header('user-agent') ?? ''
    if (!ua || BOT_UA.test(ua)) return product.externalUrl

    await db.table('ecommerce_product_cta_clicks').insert({
      id: newUlid(),
      product_id: product.id,
      url: product.externalUrl.slice(0, 500),
      referrer: ctx.request.header('referer')?.slice(0, 512) ?? null,
      ip_hash: hashIp(ctx.request.ip()),
      user_agent: ua.slice(0, 512),
      created_at: DateTime.now().toSQL(),
    })

    await Product.query().where('id', product.id).increment('external_clicks_count', 1)

    return product.externalUrl
  }

  /** Prune old click rows. The table grows fastest and matters least. */
  async pruneClicks(olderThanDays = 180): Promise<number> {
    const cutoff = DateTime.now().minus({ days: olderThanDays })
    const deleted = await db
      .from('ecommerce_product_cta_clicks')
      .where('created_at', '<', cutoff.toSQL()!)
      .delete()
    return Number(deleted ?? 0)
  }

  /**
   * Products ranked by outbound clicks in a window, most-clicked first.
   *
   * An inner join, not a left join off `ecommerce_products` — a product with
   * zero clicks in the window has nothing to report and correctly does not
   * appear, the same "top N by count" semantics `analytics_service.ts`'s
   * `topProducts()` uses.
   */
  async list(days: number | 'all' = 'all'): Promise<OutboundClickRow[]> {
    const query = db
      .from('ecommerce_product_cta_clicks as c')
      .join('ecommerce_products as p', 'p.id', 'c.product_id')
      .whereNull('p.deleted_at')

    if (days !== 'all') {
      query.where('c.created_at', '>=', DateTime.now().minus({ days }).toSQL()!)
    }

    const rows = await query
      .groupBy('p.id', 'p.title', 'p.slug', 'p.external_url', 'p.external_label')
      .select('p.id', 'p.title', 'p.slug', 'p.external_url', 'p.external_label')
      .count({ clicks: 'c.id' })
      .max({ lastClickedAt: 'c.created_at' })
      .orderBy('clicks', 'desc')
      .limit(50)

    return rows.map((row) => ({
      productId: String(row.id),
      title: String(row.title),
      slug: String(row.slug),
      externalUrl: row.external_url ?? null,
      externalLabel: row.external_label ?? null,
      clicks: Number(row.clicks),
      lastClickedAt: row.lastClickedAt
        ? DateTime.fromJSDate(new Date(row.lastClickedAt)).toISO()
        : null,
    }))
  }

  /**
   * Individual clicks on one product, most recent first — the detail view
   * behind a row in the ranked list above.
   */
  async history(
    productId: string,
    days: number | 'all' = 'all',
    limit = 200
  ): Promise<ClickHistoryRow[]> {
    const query = db.from('ecommerce_product_cta_clicks').where('product_id', productId)

    if (days !== 'all') {
      query.where('created_at', '>=', DateTime.now().minus({ days }).toSQL()!)
    }

    const rows = await query
      .select('created_at', 'user_agent', 'referrer')
      .orderBy('created_at', 'desc')
      .limit(limit)

    return rows.map((row) => {
      const ua = parseUa(row.user_agent ?? '')
      return {
        createdAt: DateTime.fromJSDate(new Date(row.created_at)).toISO()!,
        deviceType: ua.deviceType,
        browser: ua.browser,
        os: ua.os,
        referrer: row.referrer ?? null,
      }
    })
  }

  /** The same ranked list, as CSV. */
  async csv(days: number | 'all' = 'all'): Promise<string> {
    const rows = await this.list(days)
    return csvDocument(
      ['product', 'slug', 'external_url', 'external_label', 'clicks', 'last_clicked_at'],
      rows.map((r) => [r.title, r.slug, r.externalUrl, r.externalLabel, r.clicks, r.lastClickedAt])
    )
  }
}

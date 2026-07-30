import crypto from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import app from '@adonisjs/core/services/app'
import encryption from '@adonisjs/core/services/encryption'
import env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'
import { newUlid } from '#services/ulid_service'
import { publicError } from '#exceptions/public_error'
import Affiliate from '#modules/ecommerce/models/affiliate'
import Commission from '#modules/ecommerce/models/commission'
import type Order from '#modules/ecommerce/models/order'
import { Money } from '#modules/ecommerce/services/money'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import { csvDocument } from '#modules/ecommerce/services/csv'

/** Cookie holding the last-click referral code. */
export const AFFILIATE_COOKIE = 'dl_ref'

/** Purpose tag so payout details cannot be decrypted as some other secret. */
const PAYOUT_PURPOSE = 'ecommerce_affiliate_payout'

const settings = new StoreSettingsService()

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  return crypto.createHmac('sha256', env.get('APP_KEY').release()).update(ip).digest('hex')
}

function normaliseCode(code: string): string {
  return code.trim().toUpperCase().slice(0, 64)
}

export interface AffiliateDto {
  id: string
  code: string
  name: string
  email: string
  commissionPercent: number
  status: 'active' | 'paused' | 'blocked'
  /** Masked. The plaintext never leaves the server. */
  payoutDetailsMasked: string | null
  hasPayoutDetails: boolean
  notes: string | null
  clicksCount: number
  ordersCount: number
  totalCommission: { amount: number; formatted: string }
  paidCommission: { amount: number; formatted: string }
  outstanding: { amount: number; formatted: string }
  createdAt: string
}

export interface CommissionDto {
  id: string
  affiliateId: string
  affiliateName: string
  orderId: string
  orderNumber: string
  amount: { amount: number; formatted: string }
  status: Commission['status']
  ratePercent: number
  approvedAt: string | null
  paidAt: string | null
  voidReason: string | null
  createdAt: string
}

function maskPayout(value: string | null): string | null {
  if (!value) return null
  if (value.length <= 6) return '••••••'
  return `${'•'.repeat(Math.max(value.length - 4, 4))}${value.slice(-4)}`
}

export default class AffiliateService {
  /**
   * Record a referral click and set the attribution cookie.
   *
   * Last-click wins: a later referral overwrites an earlier one, which is the
   * convention affiliates expect and the one that is simplest to explain.
   *
   * The IP is hashed rather than stored. Clicks are append-only, unauthenticated
   * and the highest-volume table in the module, so they are also the easiest
   * thing to flood — hence the pruning below and the rate limit on the route.
   */
  async recordClick(
    ctx: HttpContext,
    code: string,
    landingPath: string | null
  ): Promise<Affiliate | null> {
    const normalised = normaliseCode(code)
    if (!normalised) return null

    const affiliate = await Affiliate.query()
      .where('code', normalised)
      .whereNull('deleted_at')
      .first()

    /**
     * An unknown or paused code sets no cookie and writes no row, so the
     * endpoint cannot be used to fill the table with junk codes.
     */
    if (!affiliate?.isEarning) return null

    const store = await settings.getOrCreate()

    await db.table('ecommerce_affiliate_clicks').insert({
      id: newUlid(),
      code: normalised,
      landing_path: landingPath?.slice(0, 512) ?? null,
      referrer: ctx.request.header('referer')?.slice(0, 512) ?? null,
      ip_hash: hashIp(ctx.request.ip()),
      user_agent: ctx.request.header('user-agent')?.slice(0, 512) ?? null,
      created_at: DateTime.now().toSQL(),
    })

    await Affiliate.query().where('id', affiliate.id).increment('clicks_count', 1)

    ctx.response.cookie(AFFILIATE_COOKIE, normalised, {
      httpOnly: true,
      secure: app.inProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: store.affiliateCookieDays * 24 * 60 * 60,
    })

    return affiliate
  }

  /** The referral code attached to this request, if any. */
  referralCode(ctx: HttpContext): string | null {
    const code = ctx.request.cookie(AFFILIATE_COOKIE) as string | undefined
    return typeof code === 'string' && code ? normaliseCode(code) : null
  }

  /**
   * Create the commission for a paid order.
   *
   * Called from the paid transition. `ecommerce_commissions.order_id` is
   * unique, so a replayed `order.paid` cannot pay an affiliate twice — the
   * insert simply fails and is swallowed.
   *
   * Commission is a percentage of the **subtotal**, not the total: paying a
   * cut of shipping and tax means paying a cut of money that was never margin.
   */
  async recordForOrder(order: Order, trx: TransactionClientContract): Promise<void> {
    if (!order.affiliateCode) return

    const affiliate = await Affiliate.query({ client: trx })
      .where('code', normaliseCode(order.affiliateCode))
      .whereNull('deleted_at')
      .first()

    if (!affiliate?.isEarning || affiliate.commissionPercentMilli <= 0) return

    const amount = Money.applyPercent(order.subtotalAmount, affiliate.commissionPercent)
    if (amount <= 0) return

    try {
      await Commission.create(
        {
          id: newUlid(),
          affiliateId: affiliate.id,
          orderId: order.id,
          amount,
          currency: order.currency,
          orderSubtotalAmount: order.subtotalAmount,
          ratePercentMilli: affiliate.commissionPercentMilli,
          status: 'pending',
        },
        { client: trx }
      )
    } catch {
      // Unique violation on `order_id` — already recorded. Not an error.
      return
    }

    await trx.from('ecommerce_affiliates').where('id', affiliate.id).increment('orders_count', 1)
    await trx
      .from('ecommerce_affiliates')
      .where('id', affiliate.id)
      .increment('total_commission_amount', amount)
  }

  /**
   * Move commissions past the refund window from `pending` to `approved`.
   *
   * Nothing is payable until the sale can no longer be reversed. A store that
   * approves immediately funds a refund cycle as a way of extracting money.
   */
  async approveMatured(now: DateTime = DateTime.now()): Promise<number> {
    const store = await settings.getOrCreate()
    const cutoff = now.minus({ days: store.refundWindowDays })

    const matured = await Commission.query()
      .where('status', 'pending')
      .where('created_at', '<=', cutoff.toSQL()!)
      .limit(500)

    let approved = 0
    for (const commission of matured) {
      /**
       * Guarded on the current status so a commission voided by a refund a
       * moment ago is not resurrected by this sweep.
       */
      const claimed = await db
        .from('ecommerce_commissions')
        .where('id', commission.id)
        .where('status', 'pending')
        .update({ status: 'approved', approved_at: now.toSQL(), updated_at: now.toSQL() })

      if (Number(claimed) > 0) approved++
    }

    return approved
  }

  /**
   * Mark commissions paid.
   *
   * Payout itself is manual — this only records that it happened. Automated
   * transfers would mean holding money-movement credentials and taking on KYC
   * obligations, which is a different product.
   */
  async markPaid(commissionIds: string[], userId: number): Promise<number> {
    if (commissionIds.length === 0) return 0

    return db.transaction(async (trx) => {
      const commissions = await Commission.query({ client: trx })
        .whereIn('id', commissionIds.slice(0, 500))
        .where('status', 'approved')

      if (commissions.length === 0) {
        throw publicError.unprocessable(
          'Only approved commissions can be marked as paid.',
          'no_approved_commissions'
        )
      }

      const now = DateTime.now()
      let paid = 0

      for (const commission of commissions) {
        const claimed = await trx
          .from('ecommerce_commissions')
          .where('id', commission.id)
          .where('status', 'approved')
          .update({
            status: 'paid',
            paid_at: now.toSQL(),
            paid_by_user_id: userId,
            updated_at: now.toSQL(),
          })

        if (Number(claimed) === 0) continue

        await trx
          .from('ecommerce_affiliates')
          .where('id', commission.affiliateId)
          .increment('paid_commission_amount', commission.amount)

        paid++
      }

      return paid
    })
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  async list(): Promise<AffiliateDto[]> {
    const rows = await Affiliate.query().whereNull('deleted_at').orderBy('created_at', 'desc')
    const store = await settings.getOrCreate()
    return rows.map((row) => this.toDto(row, store.currency, store.locale))
  }

  async create(input: {
    code: string
    name: string
    email: string
    commissionPercent: number
    payoutDetails?: string | null
    notes?: string | null
  }): Promise<AffiliateDto> {
    const code = normaliseCode(input.code)
    if (!code) throw publicError.unprocessable('An affiliate needs a code.', 'code_required')

    const existing = await Affiliate.query().where('code', code).whereNull('deleted_at').first()
    if (existing) {
      throw publicError.conflict(`The code "${code}" is already in use.`, 'code_taken')
    }

    const row = await Affiliate.create({
      id: newUlid(),
      code,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      commissionPercentMilli: this.encodePercent(input.commissionPercent),
      status: 'active',
      payoutDetailsEnc: input.payoutDetails
        ? encryption.encrypt(input.payoutDetails, undefined, PAYOUT_PURPOSE)
        : null,
      notes: input.notes ?? null,
      clicksCount: 0,
      ordersCount: 0,
      totalCommissionAmount: 0,
      paidCommissionAmount: 0,
    })

    const store = await settings.getOrCreate()
    return this.toDto(row, store.currency, store.locale)
  }

  async update(
    id: string,
    input: Partial<{
      name: string
      email: string
      commissionPercent: number
      status: 'active' | 'paused' | 'blocked'
      /** Omit to keep the stored details; empty string clears them. */
      payoutDetails: string | null
      notes: string | null
    }>
  ): Promise<AffiliateDto> {
    const row = await Affiliate.query().where('id', id).whereNull('deleted_at').first()
    if (!row) throw publicError.notFound('Affiliate not found.', 'affiliate_not_found')

    if (input.name !== undefined) row.name = input.name.trim()
    if (input.email !== undefined) row.email = input.email.trim().toLowerCase()
    if (input.commissionPercent !== undefined) {
      row.commissionPercentMilli = this.encodePercent(input.commissionPercent)
    }
    if (input.status !== undefined) row.status = input.status
    if (input.notes !== undefined) row.notes = input.notes
    if (input.payoutDetails !== undefined) {
      row.payoutDetailsEnc = input.payoutDetails
        ? encryption.encrypt(input.payoutDetails, undefined, PAYOUT_PURPOSE)
        : null
    }

    await row.save()
    const store = await settings.getOrCreate()
    return this.toDto(row, store.currency, store.locale)
  }

  async commissions(
    filter: { status?: Commission['status']; affiliateId?: string } = {}
  ): Promise<CommissionDto[]> {
    const store = await settings.getOrCreate()

    const query = db
      .from('ecommerce_commissions as c')
      .leftJoin('ecommerce_affiliates as a', 'a.id', 'c.affiliate_id')
      .leftJoin('ecommerce_orders as o', 'o.id', 'c.order_id')
      .select(
        'c.id',
        'c.affiliate_id',
        'c.order_id',
        'c.amount',
        'c.currency',
        'c.status',
        'c.rate_percent_milli',
        'c.approved_at',
        'c.paid_at',
        'c.void_reason',
        'c.created_at',
        'a.name as affiliate_name',
        'o.number as order_number'
      )
      .orderBy('c.created_at', 'desc')
      .limit(500)

    if (filter.status) query.where('c.status', filter.status)
    if (filter.affiliateId) query.where('c.affiliate_id', filter.affiliateId)

    const rows = await query

    return rows.map((row: Record<string, unknown>) => {
      const amount = Number(row.amount ?? 0)
      return {
        id: String(row.id),
        affiliateId: String(row.affiliate_id),
        affiliateName: String(row.affiliate_name ?? 'Unknown'),
        orderId: String(row.order_id),
        orderNumber: String(row.order_number ?? '—'),
        amount: {
          amount,
          formatted: Money.format(amount, String(row.currency ?? store.currency), store.locale),
        },
        status: row.status as Commission['status'],
        ratePercent: Number(row.rate_percent_milli ?? 0) / 1_000,
        approvedAt: row.approved_at ? String(row.approved_at) : null,
        paidAt: row.paid_at ? String(row.paid_at) : null,
        voidReason: row.void_reason ? String(row.void_reason) : null,
        createdAt: String(row.created_at),
      }
    })
  }

  /** Everything an operator needs to pay someone, as CSV. */
  async payoutCsv(): Promise<string> {
    const commissions = await this.commissions({ status: 'approved' })
    const store = await settings.getOrCreate()

    return csvDocument(
      ['affiliate', 'order', 'amount_minor', 'currency', 'approved_at'],
      commissions.map((c) => [
        c.affiliateName,
        c.orderNumber,
        // Raw minor units, not the formatted string: a spreadsheet should get a
        // number it can sum, not a currency symbol it will treat as text.
        c.amount.amount,
        store.currency,
        c.approvedAt ?? '',
      ])
    )
  }

  /** Prune old click rows. The table grows fastest and matters least. */
  async pruneClicks(olderThanDays = 180): Promise<number> {
    const cutoff = DateTime.now().minus({ days: olderThanDays })
    const deleted = await db
      .from('ecommerce_affiliate_clicks')
      .where('created_at', '<', cutoff.toSQL()!)
      .delete()
    return Number(deleted ?? 0)
  }

  private encodePercent(percent: number): number {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw publicError.unprocessable(
        'Commission must be between 0 and 100 percent.',
        'invalid_percent'
      )
    }
    return Math.round(percent * 1_000)
  }

  private toDto(row: Affiliate, currency: string, locale: string): AffiliateDto {
    const payout = row.payoutDetailsEnc
      ? encryption.decrypt<string>(row.payoutDetailsEnc, PAYOUT_PURPOSE)
      : null

    const money = (amount: number) => ({
      amount,
      formatted: Money.format(amount, currency, locale),
    })

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      email: row.email,
      commissionPercent: row.commissionPercent,
      status: row.status,
      payoutDetailsMasked: maskPayout(payout),
      hasPayoutDetails: Boolean(row.payoutDetailsEnc),
      notes: row.notes,
      clicksCount: row.clicksCount,
      ordersCount: row.ordersCount,
      totalCommission: money(row.totalCommissionAmount),
      paidCommission: money(row.paidCommissionAmount),
      outstanding: money(row.outstandingAmount),
      createdAt: row.createdAt.toISO()!,
    }
  }
}

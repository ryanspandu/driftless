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
import AffiliateWithdrawal from '#modules/ecommerce/models/affiliate_withdrawal'
import type Account from '#modules/ecommerce/models/account'
import type Order from '#modules/ecommerce/models/order'
import { Money } from '#modules/ecommerce/services/money'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import { csvDocument } from '#modules/ecommerce/services/csv'

/** Cookie holding the last-click referral code. */
export const AFFILIATE_COOKIE = 'dl_ref'

/** Purpose tag so the payout method cannot be decrypted as some other secret. */
const PAYOUT_METHOD_PURPOSE = 'ecommerce_affiliate_payout_method'

const settings = new StoreSettingsService()

/** A structured, self-service payout instrument. Stored encrypted as JSON. */
export type PayoutMethod =
  | { type: 'bank'; bankName: string; accountNumber: string; accountHolder: string }
  | { type: 'ewallet'; provider: string; accountNumber: string; accountHolder: string }
  | { type: 'paypal'; email: string }

/** The non-earning + earning states an affiliate can be in. */
export type AffiliateState = Affiliate['status'] | 'none'

interface Balances {
  /** Earned but still inside the refund window. */
  pending: number
  /** Approved and not yet attached to a withdrawal — withdrawable now. */
  available: number
  /** Approved and reserved by an open withdrawal request. */
  inWithdrawal: number
  /** Paid out. */
  paid: number
}

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  return crypto.createHmac('sha256', env.get('APP_KEY').release()).update(ip).digest('hex')
}

function normaliseCode(code: string): string {
  return code.trim().toUpperCase().slice(0, 64)
}

interface Money2 {
  amount: number
  formatted: string
}

export interface AffiliateDto {
  id: string
  code: string
  accountId: string | null
  name: string
  email: string
  commissionPercent: number
  status: Affiliate['status']
  /** A short, non-sensitive label for the saved payout method (never the details). */
  payoutMethodSummary: string | null
  hasPayoutMethod: boolean
  notes: string | null
  /** The applicant's own note (why they want in). Shown in the admin queue. */
  applicantMessage: string | null
  clicksCount: number
  ordersCount: number
  /** Computed from the commission ledger, so refund-voids can't leave it stale. */
  pendingCommission: Money2
  availableCommission: Money2
  paidCommission: Money2
  appliedAt: string | null
  createdAt: string
  updatedAt: string
}

/** What an affiliate sees in their own account portal. */
export interface AffiliateOverviewDto {
  state: AffiliateState
  code: string | null
  /** The path to share, e.g. `/ref/ABC123`. The client prefixes the origin. */
  referralPath: string | null
  commissionPercent: number
  clicksCount: number
  ordersCount: number
  pending: Money2
  available: Money2
  inWithdrawal: Money2
  paid: Money2
  minWithdrawal: Money2
  canWithdraw: boolean
  payoutMethod: { type: PayoutMethod['type']; summary: string } | null
  recentCommissions: CommissionDto[]
  withdrawals: WithdrawalDto[]
}

export interface WithdrawalDto {
  id: string
  affiliateId: string
  affiliateName: string
  amount: Money2
  status: AffiliateWithdrawal['status']
  requestedAt: string
  processedAt: string | null
  rejectionReason: string | null
  /** Admin-only: a label for the payout instrument to send money to. */
  payoutMethodSummary: string | null
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

function maskTail(value: string): string {
  const cleaned = value.trim()
  if (cleaned.length <= 4) return `••${cleaned.slice(-2)}`
  return `••••${cleaned.slice(-4)}`
}

/** A short, non-sensitive label for a payout method — safe to show and log. */
function summarisePayoutMethod(method: PayoutMethod): string {
  switch (method.type) {
    case 'bank':
      return `${method.bankName} ${maskTail(method.accountNumber)}`
    case 'ewallet':
      return `${method.provider} ${maskTail(method.accountNumber)}`
    case 'paypal':
      return `PayPal ${method.email}`
  }
}

function normalisePayoutMethod(input: PayoutMethod): PayoutMethod {
  const t = (s: unknown) => String(s ?? '').trim()
  if (input.type === 'bank') {
    return {
      type: 'bank',
      bankName: t(input.bankName),
      accountNumber: t(input.accountNumber),
      accountHolder: t(input.accountHolder),
    }
  }
  if (input.type === 'ewallet') {
    return {
      type: 'ewallet',
      provider: t(input.provider),
      accountNumber: t(input.accountNumber),
      accountHolder: t(input.accountHolder),
    }
  }
  return { type: 'paypal', email: t(input.email).toLowerCase() }
}

/** Validate a payout method has its required fields filled. */
function payoutMethodComplete(method: PayoutMethod): boolean {
  if (method.type === 'paypal') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(method.email)
  if (method.type === 'bank') {
    return Boolean(method.bankName && method.accountNumber && method.accountHolder)
  }
  return Boolean(method.provider && method.accountNumber && method.accountHolder)
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

  // ── Account-based enrolment ────────────────────────────────────────────────

  /** The affiliate row for an account, if one exists (any status). */
  async findByAccountId(accountId: string): Promise<Affiliate | null> {
    return Affiliate.query().where('account_id', accountId).whereNull('deleted_at').first()
  }

  /**
   * An account applies to become an affiliate (one per account).
   *
   * A first application creates a `pending` row. A **re-application** is allowed
   * only from `rejected` or `blocked` — it returns the row to `pending` with the
   * new message so the admin can reconsider. An already-pending or active account
   * cannot re-apply.
   */
  async apply(account: Account, message?: string | null): Promise<Affiliate> {
    const note = (message ?? '').trim().slice(0, 1_000) || null
    const existing = await this.findByAccountId(account.id)

    if (existing) {
      if (existing.status !== 'rejected' && existing.status !== 'blocked') {
        throw publicError.conflict(
          'You have already applied to the affiliate program.',
          'already_applied'
        )
      }
      existing.status = 'pending'
      existing.applicantMessage = note
      existing.appliedAt = DateTime.now()
      await existing.save()
      return existing
    }

    const store = await settings.getOrCreate()
    return Affiliate.create({
      id: newUlid(),
      code: await this.generateUniqueCode(account),
      name: account.fullName || account.email,
      email: account.email,
      accountId: account.id,
      commissionPercentMilli: store.affiliateDefaultCommissionMilli,
      status: 'pending',
      payoutMethodEnc: null,
      appliedAt: DateTime.now(),
      applicantMessage: note,
      notes: null,
      clicksCount: 0,
      ordersCount: 0,
      totalCommissionAmount: 0,
      paidCommissionAmount: 0,
    })
  }

  /** An affiliate (usually one they own) sets or replaces their payout method. */
  async setPayoutMethod(affiliate: Affiliate, method: PayoutMethod): Promise<void> {
    const normalised = normalisePayoutMethod(method)
    if (!payoutMethodComplete(normalised)) {
      throw publicError.unprocessable('Please fill in every payout field.', 'payout_incomplete')
    }
    affiliate.payoutMethodEnc = encryption.encrypt(
      JSON.stringify(normalised),
      undefined,
      PAYOUT_METHOD_PURPOSE
    )
    await affiliate.save()
  }

  private decodePayoutMethod(enc: string | null): PayoutMethod | null {
    if (!enc) return null
    const raw = encryption.decrypt<string>(enc, PAYOUT_METHOD_PURPOSE)
    if (!raw) return null
    try {
      return JSON.parse(raw) as PayoutMethod
    } catch {
      return null
    }
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  /** All affiliates (optionally filtered by status), newest first. */
  async list(filter: { status?: Affiliate['status'] } = {}): Promise<AffiliateDto[]> {
    const query = Affiliate.query().whereNull('deleted_at').orderBy('created_at', 'desc')
    if (filter.status) query.where('status', filter.status)
    const rows = await query
    const store = await settings.getOrCreate()
    return Promise.all(rows.map((row) => this.toDto(row, store.currency, store.locale)))
  }

  /** Approve a pending application (or re-activate). Sets the earning rate. */
  async approve(id: string, input: { commissionPercent?: number } = {}): Promise<AffiliateDto> {
    const row = await Affiliate.query().where('id', id).whereNull('deleted_at').first()
    if (!row) throw publicError.notFound('Affiliate not found.', 'affiliate_not_found')

    if (input.commissionPercent !== undefined) {
      row.commissionPercentMilli = this.encodePercent(input.commissionPercent)
    }
    if (!row.code) row.code = normaliseCode(newUlid().slice(-8))
    row.status = 'active'
    await row.save()

    const store = await settings.getOrCreate()
    return this.toDto(row, store.currency, store.locale)
  }

  /** Reject a pending application. */
  async reject(id: string, reason?: string | null): Promise<AffiliateDto> {
    const row = await Affiliate.query().where('id', id).whereNull('deleted_at').first()
    if (!row) throw publicError.notFound('Affiliate not found.', 'affiliate_not_found')
    row.status = 'rejected'
    if (reason) row.notes = reason
    await row.save()
    const store = await settings.getOrCreate()
    return this.toDto(row, store.currency, store.locale)
  }

  /** Edit an affiliate's rate / status / notes (not their payout method). */
  async update(
    id: string,
    input: Partial<{
      commissionPercent: number
      status: Affiliate['status']
      notes: string | null
    }>
  ): Promise<AffiliateDto> {
    const row = await Affiliate.query().where('id', id).whereNull('deleted_at').first()
    if (!row) throw publicError.notFound('Affiliate not found.', 'affiliate_not_found')

    if (input.commissionPercent !== undefined) {
      row.commissionPercentMilli = this.encodePercent(input.commissionPercent)
    }
    if (input.status !== undefined) row.status = input.status
    if (input.notes !== undefined) row.notes = input.notes

    await row.save()
    const store = await settings.getOrCreate()
    return this.toDto(row, store.currency, store.locale)
  }

  // ── Balances & withdrawals ──────────────────────────────────────────────────

  /**
   * Balances computed from the commission ledger (the source of truth), so a
   * refund-void can never leave a stale "owed" total — the bug the old
   * denormalised columns had.
   */
  async computeBalances(affiliateId: string): Promise<Balances> {
    const rows = await db
      .from('ecommerce_commissions')
      .where('affiliate_id', affiliateId)
      .select('status')
      .select(db.raw('(withdrawal_id IS NULL) as unlinked'))
      .sum('amount as total')
      .groupByRaw('status, (withdrawal_id IS NULL)')

    const balances: Balances = { pending: 0, available: 0, inWithdrawal: 0, paid: 0 }
    for (const row of rows as Array<Record<string, unknown>>) {
      const total = Number(row.total ?? 0)
      const status = String(row.status)
      const unlinked = row.unlinked === true || row.unlinked === 't' || row.unlinked === 1
      if (status === 'pending') balances.pending += total
      else if (status === 'paid') balances.paid += total
      else if (status === 'approved') {
        if (unlinked) balances.available += total
        else balances.inWithdrawal += total
      }
    }
    return balances
  }

  /**
   * Request a payout of the entire available balance.
   *
   * Bundles every approved, unlinked commission into one withdrawal (avoids
   * splitting individual commissions), gated by the store minimum. Requires a
   * saved payout method.
   */
  async requestWithdrawal(affiliate: Affiliate): Promise<AffiliateWithdrawal> {
    const method = this.decodePayoutMethod(affiliate.payoutMethodEnc)
    if (!method) {
      throw publicError.unprocessable('Add a payout method first.', 'no_payout_method')
    }
    const store = await settings.getOrCreate()

    return db.transaction(async (trx) => {
      const commissions = await Commission.query({ client: trx })
        .where('affiliate_id', affiliate.id)
        .where('status', 'approved')
        .whereNull('withdrawal_id')
        .forUpdate()

      const amount = commissions.reduce((sum, c) => sum + c.amount, 0)
      if (amount <= 0) {
        throw publicError.unprocessable(
          'You have nothing available to withdraw.',
          'nothing_available'
        )
      }
      if (amount < store.affiliateMinWithdrawalAmount) {
        throw publicError.unprocessable(
          `The minimum withdrawal is ${Money.format(store.affiliateMinWithdrawalAmount, store.currency, store.locale)}.`,
          'below_minimum'
        )
      }

      const now = DateTime.now()
      const withdrawal = await AffiliateWithdrawal.create(
        {
          id: newUlid(),
          affiliateId: affiliate.id,
          amount,
          currency: store.currency,
          status: 'requested',
          payoutMethodSnapshotEnc: encryption.encrypt(
            JSON.stringify(method),
            undefined,
            PAYOUT_METHOD_PURPOSE
          ),
          requestedAt: now,
          processedAt: null,
          processedByUserId: null,
          rejectionReason: null,
        },
        { client: trx }
      )

      await Commission.query({ client: trx })
        .whereIn(
          'id',
          commissions.map((c) => c.id)
        )
        .update({ withdrawal_id: withdrawal.id })

      return withdrawal
    })
  }

  /** Withdrawals for one affiliate (their own history). */
  async withdrawalsForAffiliate(affiliateId: string): Promise<WithdrawalDto[]> {
    const rows = await AffiliateWithdrawal.query()
      .where('affiliate_id', affiliateId)
      .orderBy('requested_at', 'desc')
      .limit(50)
    const store = await settings.getOrCreate()
    return rows.map((row) => this.withdrawalToDto(row, null, store.locale, false))
  }

  /** All withdrawals for the admin queue (optionally filtered by status). */
  async listWithdrawals(
    filter: { status?: AffiliateWithdrawal['status'] } = {}
  ): Promise<WithdrawalDto[]> {
    const query = db
      .from('ecommerce_affiliate_withdrawals as w')
      .leftJoin('ecommerce_affiliates as a', 'a.id', 'w.affiliate_id')
      .select('w.*', 'a.name as affiliate_name')
      .orderBy('w.requested_at', 'desc')
      .limit(500)
    if (filter.status) query.where('w.status', filter.status)
    const rows = await query
    const store = await settings.getOrCreate()

    return (rows as Array<Record<string, unknown>>).map((row) => {
      const amount = Number(row.amount ?? 0)
      const method = this.decodePayoutMethod((row.payout_method_snapshot_enc as string) ?? null)
      return {
        id: String(row.id),
        affiliateId: String(row.affiliate_id),
        affiliateName: String(row.affiliate_name ?? 'Unknown'),
        amount: {
          amount,
          formatted: Money.format(amount, String(row.currency ?? store.currency), store.locale),
        },
        status: row.status as AffiliateWithdrawal['status'],
        requestedAt: String(row.requested_at),
        processedAt: row.processed_at ? String(row.processed_at) : null,
        rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
        payoutMethodSummary: method ? summarisePayoutMethod(method) : null,
      }
    })
  }

  /**
   * Process a withdrawal: mark it paid (its commissions become `paid`) or reject
   * it (its commissions are unlinked and become available again).
   */
  async processWithdrawal(
    id: string,
    userId: number,
    action: 'paid' | 'reject',
    reason?: string | null
  ): Promise<void> {
    await db.transaction(async (trx) => {
      const withdrawal = await AffiliateWithdrawal.query({ client: trx })
        .where('id', id)
        .where('status', 'requested')
        .forUpdate()
        .first()
      if (!withdrawal) {
        throw publicError.unprocessable(
          'This withdrawal has already been processed.',
          'already_processed'
        )
      }

      const now = DateTime.now()
      if (action === 'paid') {
        await Commission.query({ client: trx })
          .where('withdrawal_id', id)
          .where('status', 'approved')
          .update({
            status: 'paid',
            paid_at: now.toSQL(),
            paid_by_user_id: userId,
            updated_at: now.toSQL(),
          })
        await trx
          .from('ecommerce_affiliates')
          .where('id', withdrawal.affiliateId)
          .increment('paid_commission_amount', withdrawal.amount)
        withdrawal.status = 'paid'
      } else {
        // Unlink the commissions so the balance returns to available.
        await Commission.query({ client: trx })
          .where('withdrawal_id', id)
          .update({ withdrawal_id: null })
        withdrawal.status = 'rejected'
        withdrawal.rejectionReason = reason ?? null
      }
      withdrawal.processedAt = now
      withdrawal.processedByUserId = userId
      await withdrawal.useTransaction(trx).save()
    })
  }

  // ── Storefront overview ─────────────────────────────────────────────────────

  /** Everything an account needs to render its affiliate tab. */
  async overviewForAccount(account: Account): Promise<AffiliateOverviewDto> {
    const store = await settings.getOrCreate()
    const money = (amount: number): Money2 => ({
      amount,
      formatted: Money.format(amount, store.currency, store.locale),
    })

    const affiliate = await this.findByAccountId(account.id)
    if (!affiliate) {
      return {
        state: 'none',
        code: null,
        referralPath: null,
        commissionPercent: store.affiliateDefaultCommissionMilli / 1_000,
        clicksCount: 0,
        ordersCount: 0,
        pending: money(0),
        available: money(0),
        inWithdrawal: money(0),
        paid: money(0),
        minWithdrawal: money(store.affiliateMinWithdrawalAmount),
        canWithdraw: false,
        payoutMethod: null,
        recentCommissions: [],
        withdrawals: [],
      }
    }

    const balances = await this.computeBalances(affiliate.id)
    const method = this.decodePayoutMethod(affiliate.payoutMethodEnc)
    const recentCommissions =
      affiliate.status === 'active' ? await this.commissions({ affiliateId: affiliate.id }) : []
    const withdrawals =
      affiliate.status === 'active' ? await this.withdrawalsForAffiliate(affiliate.id) : []

    const canWithdraw =
      affiliate.status === 'active' &&
      Boolean(method) &&
      balances.available > 0 &&
      balances.available >= store.affiliateMinWithdrawalAmount

    return {
      state: affiliate.status,
      code: affiliate.code,
      referralPath: `/ref/${affiliate.code}`,
      commissionPercent: affiliate.commissionPercent,
      clicksCount: affiliate.clicksCount,
      ordersCount: affiliate.ordersCount,
      pending: money(balances.pending),
      available: money(balances.available),
      inWithdrawal: money(balances.inWithdrawal),
      paid: money(balances.paid),
      minWithdrawal: money(store.affiliateMinWithdrawalAmount),
      canWithdraw,
      payoutMethod: method ? { type: method.type, summary: summarisePayoutMethod(method) } : null,
      recentCommissions: recentCommissions.slice(0, 20),
      withdrawals,
    }
  }

  /** Auto-generate a short, unique referral code from an account. */
  private async generateUniqueCode(account: Account): Promise<string> {
    const base = normaliseCode(
      (account.firstName || account.email.split('@')[0] || 'REF').replace(/[^A-Za-z0-9]/g, '')
    ).slice(0, 8)
    for (let i = 0; i < 6; i++) {
      const suffix = crypto.randomBytes(2).toString('hex').toUpperCase()
      const code = normaliseCode(`${base || 'REF'}${suffix}`)
      const taken = await Affiliate.query().where('code', code).whereNull('deleted_at').first()
      if (!taken) return code
    }
    // Extremely unlikely; fall back to a longer random code.
    return normaliseCode(newUlid().slice(-12))
  }

  private withdrawalToDto(
    row: AffiliateWithdrawal,
    affiliateName: string | null,
    locale: string,
    includePayout: boolean
  ): WithdrawalDto {
    return {
      id: row.id,
      affiliateId: row.affiliateId,
      affiliateName: affiliateName ?? '',
      amount: { amount: row.amount, formatted: Money.format(row.amount, row.currency, locale) },
      status: row.status,
      requestedAt: row.requestedAt.toISO()!,
      processedAt: row.processedAt?.toISO() ?? null,
      rejectionReason: row.rejectionReason,
      payoutMethodSummary: includePayout
        ? (() => {
            const m = this.decodePayoutMethod(row.payoutMethodSnapshotEnc)
            return m ? summarisePayoutMethod(m) : null
          })()
        : null,
    }
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

  private async toDto(row: Affiliate, currency: string, locale: string): Promise<AffiliateDto> {
    const method = this.decodePayoutMethod(row.payoutMethodEnc)
    const balances = await this.computeBalances(row.id)

    const money = (amount: number): Money2 => ({
      amount,
      formatted: Money.format(amount, currency, locale),
    })

    return {
      id: row.id,
      code: row.code,
      accountId: row.accountId,
      name: row.name,
      email: row.email,
      commissionPercent: row.commissionPercent,
      status: row.status,
      payoutMethodSummary: method ? summarisePayoutMethod(method) : null,
      hasPayoutMethod: Boolean(row.payoutMethodEnc),
      notes: row.notes,
      applicantMessage: row.applicantMessage,
      clicksCount: row.clicksCount,
      ordersCount: row.ordersCount,
      pendingCommission: money(balances.pending),
      availableCommission: money(balances.available),
      paidCommission: money(balances.paid),
      appliedAt: row.appliedAt?.toISO() ?? null,
      createdAt: row.createdAt.toISO()!,
      updatedAt: row.updatedAt.toISO()!,
    }
  }
}

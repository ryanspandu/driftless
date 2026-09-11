import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { renderPage } from '#helpers/inertia_render'
import { apiFail } from '#helpers/api_error_response'
import AuditLogService from '#services/audit_log_service'
import type User from '#models/user'
import Account from '#modules/ecommerce/models/account'
import DiscountService from '#modules/ecommerce/services/discount_service'
import AffiliateService from '#modules/ecommerce/services/affiliate_service'

const discountValidator = vine.compile(
  vine.object({
    code: vine.string().trim().minLength(1).maxLength(64),
    name: vine.string().trim().maxLength(160).nullable().optional(),
    description: vine.string().trim().maxLength(1_000).nullable().optional(),
    type: vine.enum(['percent', 'fixed', 'free_shipping'] as const),
    /** Percentage for `percent`; integer minor units for `fixed`. */
    value: vine.number().min(0),
    minSubtotalAmount: vine.number().min(0).withoutDecimals().nullable().optional(),
    maxDiscountAmount: vine.number().min(0).withoutDecimals().nullable().optional(),
    startsAt: vine.string().nullable().optional(),
    endsAt: vine.string().nullable().optional(),
    usageLimit: vine.number().min(1).withoutDecimals().nullable().optional(),
    usageLimitPerCustomer: vine.number().min(1).withoutDecimals().nullable().optional(),
    enabled: vine.boolean().optional(),
  })
)

const discountUpdateValidator = vine.compile(
  vine.object({
    code: vine.string().trim().minLength(1).maxLength(64).optional(),
    name: vine.string().trim().maxLength(160).nullable().optional(),
    description: vine.string().trim().maxLength(1_000).nullable().optional(),
    type: vine.enum(['percent', 'fixed', 'free_shipping'] as const).optional(),
    value: vine.number().min(0).optional(),
    minSubtotalAmount: vine.number().min(0).withoutDecimals().nullable().optional(),
    maxDiscountAmount: vine.number().min(0).withoutDecimals().nullable().optional(),
    startsAt: vine.string().nullable().optional(),
    endsAt: vine.string().nullable().optional(),
    usageLimit: vine.number().min(1).withoutDecimals().nullable().optional(),
    usageLimitPerCustomer: vine.number().min(1).withoutDecimals().nullable().optional(),
    enabled: vine.boolean().optional(),
  })
)

/** Admin adds an affiliate directly for an existing storefront account. */
const affiliateAddValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email().maxLength(254),
    commissionPercent: vine.number().min(0).max(100).optional(),
  })
)

const affiliateApproveValidator = vine.compile(
  vine.object({
    commissionPercent: vine.number().min(0).max(100).optional(),
  })
)

const affiliateRejectValidator = vine.compile(
  vine.object({
    reason: vine.string().trim().maxLength(500).nullable().optional(),
  })
)

const affiliateUpdateValidator = vine.compile(
  vine.object({
    commissionPercent: vine.number().min(0).max(100).optional(),
    status: vine.enum(['pending', 'active', 'paused', 'blocked', 'rejected'] as const).optional(),
    notes: vine.string().trim().maxLength(2_000).nullable().optional(),
  })
)

const withdrawalProcessValidator = vine.compile(
  vine.object({
    action: vine.enum(['paid', 'reject'] as const),
    reason: vine.string().trim().maxLength(500).nullable().optional(),
  })
)

const payoutValidator = vine.compile(
  vine.object({
    commissionIds: vine.array(vine.string().trim().maxLength(40)).minLength(1).maxLength(500),
  })
)

const discounts = new DiscountService()
const affiliates = new AffiliateService()
const audit = new AuditLogService()

const fail = (response: HttpContext['response'], error: unknown) =>
  apiFail(response, error, 'ecommerce/marketing')

export default class MarketingController {
  // ── Pages ────────────────────────────────────────────────────────────────

  async discountsPage({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/ecommerce/admin/marketing/discounts', {})
  }

  async affiliatesPage({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/ecommerce/admin/marketing/affiliates', {})
  }

  async commissionsPage({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/ecommerce/admin/marketing/commissions', {})
  }

  async withdrawalsPage({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/ecommerce/admin/marketing/withdrawals', {})
  }

  // ── Discounts ────────────────────────────────────────────────────────────

  async listDiscounts({ response }: HttpContext) {
    return response.json(await discounts.list())
  }

  async createDiscount(ctx: HttpContext) {
    const { request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(discountValidator)
      const discount = await discounts.create({
        ...payload,
        createdByUserId: (auth.user as User).id,
      })

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'discount.created',
        subjectType: 'discount',
        subjectId: discount.id,
        changes: { code: discount.code, type: discount.type, value: discount.value },
        ctx,
      })

      return response.status(201).json(discount)
    } catch (error) {
      return fail(response, error)
    }
  }

  async updateDiscount(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(discountUpdateValidator)
      const discount = await discounts.update(String(params.id), payload)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'discount.updated',
        subjectType: 'discount',
        subjectId: discount.id,
        changes: payload,
        ctx,
      })

      return response.json(discount)
    } catch (error) {
      return fail(response, error)
    }
  }

  async destroyDiscount(ctx: HttpContext) {
    const { params, response, auth } = ctx
    try {
      const id = String(params.id)
      await discounts.remove(id)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'discount.deleted',
        subjectType: 'discount',
        subjectId: id,
        ctx,
      })

      return response.status(204).send('')
    } catch (error) {
      return fail(response, error)
    }
  }

  // ── Affiliates ───────────────────────────────────────────────────────────

  async listAffiliates({ request, response }: HttpContext) {
    const status = request.input('status')
    return response.json(await affiliates.list(status ? { status } : {}))
  }

  /** Type-ahead search over storefront accounts, for the "add affiliate" picker. */
  async searchAccounts({ request, response }: HttpContext) {
    const q = String(request.input('q') ?? '').trim()
    const builder = Account.query().whereNull('deleted_at')
    if (q) {
      const term = `%${q.toLowerCase()}%`
      builder.where((query) => {
        query
          .whereRaw('LOWER(email) LIKE ?', [term])
          .orWhereRaw("LOWER(COALESCE(first_name, '')) LIKE ?", [term])
          .orWhereRaw("LOWER(COALESCE(last_name, '')) LIKE ?", [term])
      })
    }
    const rows = await builder.orderBy('created_at', 'desc').limit(20)
    return response.json(
      rows.map((a) => ({ id: a.id, email: a.email, name: a.fullName || a.email }))
    )
  }

  /** Add an affiliate directly for an existing account (activated immediately). */
  async addAffiliate(ctx: HttpContext) {
    const { request, response, auth } = ctx
    try {
      const { email, commissionPercent } = await request.validateUsing(affiliateAddValidator)
      const account = await Account.query()
        .whereRaw('LOWER(email) = ?', [email.toLowerCase()])
        .whereNull('deleted_at')
        .first()
      if (!account) {
        return response
          .status(422)
          .json({ message: 'No storefront account has that email.', reason: 'account_not_found' })
      }

      const existing = await affiliates.findByAccountId(account.id)
      const affiliateRow = existing ?? (await affiliates.apply(account))
      const affiliate = await affiliates.approve(affiliateRow.id, { commissionPercent })

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'affiliate.created',
        subjectType: 'affiliate',
        subjectId: affiliate.id,
        changes: { code: affiliate.code, commissionPercent: affiliate.commissionPercent },
        ctx,
      })

      return response.status(201).json(affiliate)
    } catch (error) {
      return fail(response, error)
    }
  }

  async approveAffiliate(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const { commissionPercent } = await request.validateUsing(affiliateApproveValidator)
      const affiliate = await affiliates.approve(String(params.id), { commissionPercent })

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'affiliate.updated',
        subjectType: 'affiliate',
        subjectId: affiliate.id,
        changes: { status: affiliate.status, commissionPercent: affiliate.commissionPercent },
        ctx,
      })

      return response.json(affiliate)
    } catch (error) {
      return fail(response, error)
    }
  }

  async rejectAffiliate(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const { reason } = await request.validateUsing(affiliateRejectValidator)
      const affiliate = await affiliates.reject(String(params.id), reason)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'affiliate.updated',
        subjectType: 'affiliate',
        subjectId: affiliate.id,
        changes: { status: affiliate.status },
        ctx,
      })

      return response.json(affiliate)
    } catch (error) {
      return fail(response, error)
    }
  }

  async updateAffiliate(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(affiliateUpdateValidator)
      const affiliate = await affiliates.update(String(params.id), payload)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'affiliate.updated',
        subjectType: 'affiliate',
        subjectId: affiliate.id,
        changes: { status: affiliate.status, commissionPercent: affiliate.commissionPercent },
        ctx,
      })

      return response.json(affiliate)
    } catch (error) {
      return fail(response, error)
    }
  }

  // ── Withdrawals ────────────────────────────────────────────────────────────

  async listWithdrawals({ request, response }: HttpContext) {
    const status = request.input('status')
    return response.json(await affiliates.listWithdrawals(status ? { status } : {}))
  }

  /** Mark a withdrawal paid (its commissions become paid) or reject it. */
  async processWithdrawal(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const { action, reason } = await request.validateUsing(withdrawalProcessValidator)
      await affiliates.processWithdrawal(String(params.id), (auth.user as User).id, action, reason)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: action === 'paid' ? 'commission.paid' : 'affiliate.updated',
        subjectType: 'affiliate_withdrawal',
        subjectId: String(params.id),
        changes: { action },
        ctx,
      })

      return response.json({ ok: true })
    } catch (error) {
      return fail(response, error)
    }
  }

  // ── Commissions ──────────────────────────────────────────────────────────

  async listCommissions({ request, response }: HttpContext) {
    return response.json(
      await affiliates.commissions({
        status: request.input('status') || undefined,
        affiliateId: request.input('affiliateId') || undefined,
      })
    )
  }

  /**
   * Mark commissions paid.
   *
   * Behind `ecommerce:commissions:approve`, separate from
   * `affiliates:manage` — recording that money left the building is a
   * different job from editing a referral rate.
   */
  async payCommissions(ctx: HttpContext) {
    const { request, response, auth } = ctx
    try {
      const { commissionIds } = await request.validateUsing(payoutValidator)
      const paid = await affiliates.markPaid(commissionIds, (auth.user as User).id)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'commission.paid',
        subjectType: 'commission',
        subjectId: commissionIds.join(','),
        changes: { count: paid },
        ctx,
      })

      return response.json({ paid })
    } catch (error) {
      return fail(response, error)
    }
  }

  /** Approved commissions as CSV, for whoever actually sends the money. */
  async exportPayouts({ response }: HttpContext) {
    const csv = await affiliates.payoutCsv()
    return response
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="affiliate-payouts.csv"')
      .send(csv)
  }
}

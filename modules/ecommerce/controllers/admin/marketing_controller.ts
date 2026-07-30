import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { renderPage } from '#helpers/inertia_render'
import { apiFail } from '#helpers/api_error_response'
import AuditLogService from '#services/audit_log_service'
import type User from '#models/user'
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

const affiliateValidator = vine.compile(
  vine.object({
    code: vine.string().trim().minLength(1).maxLength(64),
    name: vine.string().trim().minLength(1).maxLength(160),
    email: vine.string().trim().email().maxLength(254),
    commissionPercent: vine.number().min(0).max(100),
    payoutDetails: vine.string().trim().maxLength(2_000).nullable().optional(),
    notes: vine.string().trim().maxLength(2_000).nullable().optional(),
  })
)

const affiliateUpdateValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(160).optional(),
    email: vine.string().trim().email().maxLength(254).optional(),
    commissionPercent: vine.number().min(0).max(100).optional(),
    status: vine.enum(['active', 'paused', 'blocked'] as const).optional(),
    /** Omit to keep the stored details; empty string clears them. */
    payoutDetails: vine.string().maxLength(2_000).nullable().optional(),
    notes: vine.string().trim().maxLength(2_000).nullable().optional(),
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

  async listAffiliates({ response }: HttpContext) {
    return response.json(await affiliates.list())
  }

  async createAffiliate(ctx: HttpContext) {
    const { request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(affiliateValidator)
      const affiliate = await affiliates.create(payload)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'affiliate.created',
        subjectType: 'affiliate',
        subjectId: affiliate.id,
        // The sanitiser would redact payout details anyway; the DTO does not
        // carry them in the first place.
        changes: { code: affiliate.code, commissionPercent: affiliate.commissionPercent },
        ctx,
      })

      return response.status(201).json(affiliate)
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
        changes: {
          status: affiliate.status,
          commissionPercent: affiliate.commissionPercent,
          payoutDetailsChanged: payload.payoutDetails !== undefined,
        },
        ctx,
      })

      return response.json(affiliate)
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

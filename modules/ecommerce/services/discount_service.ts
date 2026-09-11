import crypto from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import env from '#start/env'
import { newUlid } from '#services/ulid_service'
import { publicError } from '#exceptions/public_error'
import Discount from '#modules/ecommerce/models/discount'
import type { DiscountType } from '#modules/ecommerce/models/discount'
import { Money } from '#modules/ecommerce/services/money'
import type { PricedOrder } from '#modules/ecommerce/services/pricing_service'

/**
 * Discount codes.
 *
 * Two things here are load-bearing:
 *
 * 1. **Quota is claimed atomically.** The usage counter is incremented by an
 *    UPDATE whose WHERE clause also enforces the limit, so the check and the
 *    claim are one statement. The read-then-write pattern used elsewhere in
 *    this codebase is a TOCTOU race, and on a discount that races the prize for
 *    winning is money.
 *
 * 2. **Validation is separate from redemption.** `validate` is safe to call on
 *    every basket change; `claim` runs once, inside the checkout transaction,
 *    and is what actually consumes a use.
 */

/** Hash an email so the per-customer cap also covers guest checkouts. */
function emailHash(email: string): string {
  return crypto
    .createHmac('sha256', env.get('APP_KEY').release())
    .update(email.trim().toLowerCase())
    .digest('hex')
}

function normaliseCode(code: string): string {
  return code.trim().toUpperCase().slice(0, 64)
}

export interface DiscountEvaluation {
  discount: Discount
  /** Minor units to take off the order subtotal. */
  amount: number
  /** True when the code covers shipping rather than the goods. */
  freeShipping: boolean
}

export interface DiscountDto {
  id: string
  code: string
  name: string | null
  description: string | null
  type: DiscountType
  /** Percentage for `percent`, minor units for `fixed`. */
  value: number
  minSubtotalAmount: number | null
  maxDiscountAmount: number | null
  startsAt: string | null
  endsAt: string | null
  usageLimit: number | null
  usageLimitPerCustomer: number | null
  usageCount: number
  enabled: boolean
  live: boolean
}

export default class DiscountService {
  /**
   * Check a code against a basket without consuming it.
   *
   * Every rejection throws a `PublicError` whose message is safe to show —
   * "this code has expired" is genuinely useful, and reveals nothing an
   * attacker could not learn by trying the code a moment later. What it does
   * *not* do is distinguish "no such code" from "not valid for you": both
   * produce the same message, so the endpoint cannot be used to enumerate which
   * codes exist. The tight rate limit on it is the other half of that.
   */
  async validate(
    code: string,
    basket: PricedOrder,
    email: string | null
  ): Promise<DiscountEvaluation> {
    const normalised = normaliseCode(code)
    const unknown = () =>
      publicError.unprocessable('That code is not valid for this basket.', 'discount_invalid')

    if (!normalised) throw unknown()

    const discount = await Discount.query()
      .where('code', normalised)
      .whereNull('deleted_at')
      .first()

    if (!discount || !discount.isLiveAt()) throw unknown()

    if (discount.minSubtotalAmount && basket.subtotalAmount < discount.minSubtotalAmount) {
      throw publicError.unprocessable(
        `Spend ${Money.format(discount.minSubtotalAmount, basket.currency)} to use this code.`,
        'discount_min_subtotal'
      )
    }

    if (discount.usageLimitPerCustomer !== null && email) {
      const used = await db
        .from('ecommerce_discount_redemptions')
        .where('discount_id', discount.id)
        .where('email_hash', emailHash(email))
        .count('* as total')
        .first()

      const count = Number((used as { total?: string | number } | undefined)?.total ?? 0)
      if (count >= discount.usageLimitPerCustomer) {
        throw publicError.unprocessable(
          'You have already used this code.',
          'discount_customer_limit'
        )
      }
    }

    return {
      discount,
      amount: this.amountFor(discount, basket),
      freeShipping: discount.type === 'free_shipping',
    }
  }

  /**
   * How much this discount takes off, in minor units.
   *
   * Scope-aware: a code limited to certain products only discounts the value of
   * those lines, not the whole basket.
   */
  private amountFor(discount: Discount, basket: PricedOrder): number {
    if (discount.type === 'free_shipping') return 0

    const scope = discount.appliesTo ?? {}
    const scoped = scope.productIds?.length
      ? basket.lines.filter((line) => scope.productIds!.includes(line.productId))
      : basket.lines

    const eligible = Money.sum(...scoped.map((line) => line.subtotalAmount))
    if (eligible <= 0) return 0

    const raw =
      discount.type === 'percent'
        ? Money.applyPercent(eligible, discount.percent)
        : Math.min(discount.value, eligible)

    const capped = discount.maxDiscountAmount ? Math.min(raw, discount.maxDiscountAmount) : raw

    // Never more than the eligible lines are worth — a discount must not turn
    // into a refund.
    return Math.min(capped, eligible)
  }

  /**
   * Consume one use, atomically.
   *
   * ```sql
   * UPDATE … SET usage_count = usage_count + 1
   * WHERE id = ? AND (usage_limit IS NULL OR usage_count < usage_limit)
   * ```
   *
   * Zero rows means the last use went to someone else between validation and
   * checkout — the database decided, not us. Called inside the checkout
   * transaction, so a failed checkout releases the use along with everything
   * else.
   */
  async claim(
    discountId: string,
    orderId: string,
    amount: number,
    context: { email: string | null; accountId: string | null },
    trx: TransactionClientContract
  ): Promise<void> {
    const claimed = await trx
      .from('ecommerce_discounts')
      .where('id', discountId)
      .whereRaw('(usage_limit IS NULL OR usage_count < usage_limit)')
      .increment('usage_count', 1)

    if (Number(claimed) === 0) {
      throw publicError.conflict('That code has just run out.', 'discount_exhausted')
    }

    await trx.table('ecommerce_discount_redemptions').insert({
      id: newUlid(),
      discount_id: discountId,
      order_id: orderId,
      account_id: context.accountId,
      email_hash: context.email ? emailHash(context.email) : null,
      amount,
      created_at: DateTime.now().toSQL(),
    })
  }

  /**
   * Give a use back when an order is cancelled before payment.
   *
   * Floored at zero so a double release cannot drive the counter negative,
   * which would silently hand out extra uses.
   */
  async release(orderId: string, trx: TransactionClientContract): Promise<void> {
    const redemption = await trx
      .from('ecommerce_discount_redemptions')
      .where('order_id', orderId)
      .first()

    if (!redemption) return

    const floor = db.connection().dialect.name === 'postgres' ? 'GREATEST' : 'MAX'
    await trx
      .from('ecommerce_discounts')
      .where('id', redemption.discount_id)
      .update({ usage_count: db.raw(`${floor}(usage_count - 1, 0)`) })

    await trx.from('ecommerce_discount_redemptions').where('order_id', orderId).delete()
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  async list(): Promise<DiscountDto[]> {
    const rows = await Discount.query().whereNull('deleted_at').orderBy('created_at', 'desc')
    return rows.map((row) => this.toDto(row))
  }

  async create(input: {
    code: string
    name?: string | null
    description?: string | null
    type: DiscountType
    /** Percentage for `percent`, minor units for `fixed`. */
    value: number
    minSubtotalAmount?: number | null
    maxDiscountAmount?: number | null
    startsAt?: string | null
    endsAt?: string | null
    usageLimit?: number | null
    usageLimitPerCustomer?: number | null
    enabled?: boolean
    createdByUserId?: number | null
  }): Promise<DiscountDto> {
    const code = normaliseCode(input.code)
    if (!code) {
      throw publicError.unprocessable('A discount needs a code.', 'code_required')
    }

    const existing = await Discount.query().where('code', code).whereNull('deleted_at').first()
    if (existing) {
      throw publicError.conflict(`The code "${code}" is already in use.`, 'code_taken')
    }

    const row = await Discount.create({
      id: newUlid(),
      code,
      name: input.name ?? null,
      description: input.description ?? null,
      type: input.type,
      value: this.encodeValue(input.type, input.value),
      minSubtotalAmount: input.minSubtotalAmount ?? null,
      maxDiscountAmount: input.maxDiscountAmount ?? null,
      startsAt: input.startsAt ? DateTime.fromISO(input.startsAt) : null,
      endsAt: input.endsAt ? DateTime.fromISO(input.endsAt) : null,
      usageLimit: input.usageLimit ?? null,
      usageLimitPerCustomer: input.usageLimitPerCustomer ?? null,
      usageCount: 0,
      appliesTo: {},
      enabled: input.enabled ?? true,
      createdByUserId: input.createdByUserId ?? null,
    })

    return this.toDto(row)
  }

  async update(
    id: string,
    input: Partial<Parameters<DiscountService['create']>[0]>
  ): Promise<DiscountDto> {
    const row = await Discount.query().where('id', id).whereNull('deleted_at').first()
    if (!row) throw publicError.notFound('Discount not found.', 'discount_not_found')

    if (input.code !== undefined) {
      const code = normaliseCode(input.code)
      if (code !== row.code) {
        const clash = await Discount.query()
          .where('code', code)
          .whereNot('id', id)
          .whereNull('deleted_at')
          .first()
        if (clash) throw publicError.conflict(`The code "${code}" is already in use.`, 'code_taken')
        row.code = code
      }
    }

    if (input.name !== undefined) row.name = input.name ?? null
    if (input.description !== undefined) row.description = input.description ?? null
    if (input.type !== undefined) row.type = input.type
    if (input.value !== undefined) row.value = this.encodeValue(input.type ?? row.type, input.value)
    if (input.minSubtotalAmount !== undefined)
      row.minSubtotalAmount = input.minSubtotalAmount ?? null
    if (input.maxDiscountAmount !== undefined)
      row.maxDiscountAmount = input.maxDiscountAmount ?? null
    if (input.startsAt !== undefined) {
      row.startsAt = input.startsAt ? DateTime.fromISO(input.startsAt) : null
    }
    if (input.endsAt !== undefined) {
      row.endsAt = input.endsAt ? DateTime.fromISO(input.endsAt) : null
    }
    if (input.usageLimit !== undefined) row.usageLimit = input.usageLimit ?? null
    if (input.usageLimitPerCustomer !== undefined) {
      row.usageLimitPerCustomer = input.usageLimitPerCustomer ?? null
    }
    if (input.enabled !== undefined) row.enabled = input.enabled

    await row.save()
    return this.toDto(row)
  }

  /**
   * Soft delete.
   *
   * Never a hard delete: redemption rows reference the discount, and an order
   * that quoted a code should stay explicable afterwards.
   */
  async remove(id: string): Promise<void> {
    const row = await Discount.query().where('id', id).whereNull('deleted_at').first()
    if (!row) throw publicError.notFound('Discount not found.', 'discount_not_found')

    row.deletedAt = DateTime.now()
    row.enabled = false
    await row.save()
  }

  /** Percent → millipercent; fixed amounts are already minor units. */
  private encodeValue(type: DiscountType, value: number): number {
    if (type === 'percent') {
      if (value < 0 || value > 100) {
        throw publicError.unprocessable(
          'A percentage must be between 0 and 100.',
          'invalid_percent'
        )
      }
      return Math.round(value * 1_000)
    }

    if (!Number.isSafeInteger(value) || value < 0) {
      throw publicError.unprocessable(
        'A fixed discount must be a whole number of minor units.',
        'invalid_amount'
      )
    }
    return value
  }

  private toDto(row: Discount): DiscountDto {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      type: row.type,
      value: row.type === 'percent' ? row.percent : row.value,
      minSubtotalAmount: row.minSubtotalAmount,
      maxDiscountAmount: row.maxDiscountAmount,
      startsAt: row.startsAt?.toISO() ?? null,
      endsAt: row.endsAt?.toISO() ?? null,
      usageLimit: row.usageLimit,
      usageLimitPerCustomer: row.usageLimitPerCustomer,
      usageCount: row.usageCount,
      enabled: row.enabled,
      live: row.isLiveAt(),
    }
  }
}

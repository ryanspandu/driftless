import type { HttpContext } from '@adonisjs/core/http'
import { apiFail } from '#helpers/api_error_response'
import AuditLogService from '#services/audit_log_service'
import type User from '#models/user'
import ExportService, { type ExportRange } from '#modules/ecommerce/services/export_service'

const exports = new ExportService()
const audit = new AuditLogService()

const fail = (response: HttpContext['response'], error: unknown) =>
  apiFail(response, error, 'ecommerce/exports')

function rangeFrom(request: HttpContext['request']): ExportRange {
  return {
    from: request.input('from') || null,
    to: request.input('to') || null,
  }
}

export default class ExportsController {
  private async send(
    ctx: HttpContext,
    kind: string,
    filename: string,
    build: () => Promise<string>
  ) {
    const { response, auth } = ctx
    try {
      const csv = await build()

      /**
       * Every export is audited.
       *
       * These files carry the whole customer list or the whole order book, so
       * "who pulled this, and when" is the only question that matters after a
       * leak — and it cannot be answered retrospectively unless it was recorded
       * at the time.
       */
      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'ecommerce.exported',
        subjectType: 'export',
        subjectId: kind,
        changes: { kind, bytes: Buffer.byteLength(csv) },
        ctx,
      })

      return response
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .send(csv)
    } catch (error) {
      return fail(response, error)
    }
  }

  async orders(ctx: HttpContext) {
    return this.send(ctx, 'orders', 'orders.csv', () => exports.orders(rangeFrom(ctx.request)))
  }

  async orderItems(ctx: HttpContext) {
    return this.send(ctx, 'order_items', 'order-items.csv', () =>
      exports.orderItems(rangeFrom(ctx.request))
    )
  }

  async customers(ctx: HttpContext) {
    return this.send(ctx, 'customers', 'customers.csv', () =>
      exports.customers(rangeFrom(ctx.request))
    )
  }

  async products(ctx: HttpContext) {
    return this.send(ctx, 'products', 'products.csv', () => exports.products())
  }
}

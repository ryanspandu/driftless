import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import AnalyticsService from '#services/analytics_service'

const service = new AnalyticsService()

const GRANULARITIES = ['day', 'week', 'month'] as const
type Granularity = (typeof GRANULARITIES)[number]

export default class AnalyticsController {
  /**
   * Public beacon endpoint — one pageview. Unauthenticated (visitors have no
   * account), CSRF-exempt and rate-limited; it only ever writes one small row.
   */
  async collect(ctx: HttpContext) {
    const { request, response } = ctx
    const path = String(request.input('path') ?? '')
    if (!path) return response.noContent()

    try {
      await service.record(ctx, {
        path,
        referrer: request.input('referrer') ? String(request.input('referrer')) : null,
        title: request.input('title') ? String(request.input('title')) : null,
      })
    } catch {
      // Analytics must never break a page. Swallow and move on.
    }
    return response.noContent()
  }

  /** Aggregated report for the admin dashboard, over a date range + granularity. */
  async report({ request, response }: HttpContext) {
    const today = DateTime.now()
    const to = parseDate(request.input('to')) ?? today
    const from = parseDate(request.input('from')) ?? to.minus({ days: 29 })

    const g = String(request.input('granularity') ?? 'day')
    const granularity: Granularity = (GRANULARITIES as readonly string[]).includes(g)
      ? (g as Granularity)
      : 'day'

    const report = await service.report({
      from: from.toISODate()!,
      to: to.toISODate()!,
      granularity,
    })
    return response.json(report)
  }
}

function parseDate(value: unknown): DateTime | null {
  if (typeof value !== 'string' || !value) return null
  const d = DateTime.fromISO(value)
  return d.isValid ? d : null
}

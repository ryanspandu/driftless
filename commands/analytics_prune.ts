/**
 * Deletes analytics events older than the retention window.
 *
 * Usage:  node ace analytics:prune
 *         node ace analytics:prune --days=180
 *
 * Meant for cron, e.g. nightly:
 *
 *   0 3 * * * cd /srv/driftless && node ace analytics:prune >> /var/log/driftless-analytics.log 2>&1
 *
 * Analytics is append-only and the highest-volume table in the app, so without
 * a prune it grows without bound. The reports only ever look back a bounded
 * window anyway, so old raw events carry no value.
 */
import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import AnalyticsService from '#services/analytics_service'

export default class AnalyticsPrune extends BaseCommand {
  static commandName = 'analytics:prune'
  static description = 'Delete analytics events older than the retention window'

  static options: CommandOptions = { startApp: true }

  @flags.number({ description: 'Retention window in days (default: 400)' })
  declare days?: number

  async run() {
    const days = this.days && this.days > 0 ? this.days : 400
    const deleted = await new AnalyticsService().prune(days)
    this.logger.info(`Pruned ${deleted} analytics event(s) older than ${days} days.`)
  }
}

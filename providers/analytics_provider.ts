import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Runs the analytics write-buffer's flush loop.
 *
 * Pageviews are buffered in memory and written in bulk (see
 * `#services/analytics_service`). This provider starts the periodic flush when
 * the app boots and — crucially — does a final flush on shutdown, so a graceful
 * restart doesn't drop the events collected since the last tick. The flush timer
 * is unref'd, so it never keeps the process alive by itself.
 */
export default class AnalyticsProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    const { startAnalyticsFlushing, stopAnalyticsFlushing, flushAnalytics } =
      await import('#services/analytics_service')
    startAnalyticsFlushing()

    this.app.terminating(async () => {
      stopAnalyticsFlushing()
      await flushAnalytics()
    })
  }
}

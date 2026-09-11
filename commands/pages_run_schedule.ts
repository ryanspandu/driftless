/**
 * Applies due scheduled publish / unpublish transitions on builder pages.
 *
 * Usage:  node ace pages:run-schedule
 *
 * Meant for cron, e.g. every five minutes (crontab minute field "star/5"):
 *
 *   [*]/5 * * * * cd /srv/driftless && node ace pages:run-schedule >> /var/log/driftless-pages.log 2>&1
 *
 * A page can carry `scheduled_publish_at` (flip DRAFT → PUBLISHED, promoting any
 * staged draft) and `scheduled_unpublish_at` (flip PUBLISHED → DRAFT, e.g. a
 * promo that ends). There is no in-app scheduler, so an OS cron drives this.
 */
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import PagesService from '#services/pages_service'

export default class PagesRunSchedule extends BaseCommand {
  static commandName = 'pages:run-schedule'
  static description = 'Publish/unpublish pages whose scheduled time has arrived'

  static options: CommandOptions = { startApp: true }

  async run() {
    const { published, unpublished } = await new PagesService().runScheduled()
    this.logger.info(`Scheduled run: published ${published}, unpublished ${unpublished}.`)
  }
}

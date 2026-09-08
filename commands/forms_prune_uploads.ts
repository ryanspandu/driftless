/**
 * Deletes form-upload files that were never attached to a submission.
 *
 * Usage:  node ace forms:prune-uploads
 *         node ace forms:prune-uploads --hours=24
 *
 * Meant for cron, e.g. hourly:
 *
 *   0 * * * * cd /srv/driftless && node ace forms:prune-uploads >> /var/log/driftless-forms.log 2>&1
 *
 * A public upload mints a file before the form is submitted, so an abandoned
 * form (or an attacker probing the endpoint) leaves an orphan on disk. Files
 * bound to a submission are never touched; only unbound uploads older than the
 * window are removed.
 */
import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import FormUploadService from '#services/form_upload_service'

export default class FormsPruneUploads extends BaseCommand {
  static commandName = 'forms:prune-uploads'
  static description = 'Delete form uploads that were never bound to a submission'

  static options: CommandOptions = { startApp: true }

  @flags.number({ description: 'Age in hours before an unbound upload is removed (default: 24)' })
  declare hours?: number

  async run() {
    const hours = this.hours && this.hours > 0 ? this.hours : 24
    const removed = await new FormUploadService().gcOrphans(hours)
    this.logger.info(`Removed ${removed} orphaned form upload(s) older than ${hours}h.`)
  }
}

import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type MailDeliveryStatus = 'queued' | 'sent' | 'failed'

/**
 * One attempt to deliver one message.
 *
 * Holds no body — see the migration. `queued` is not success: it means the
 * queue accepted the job, and a worker that never runs leaves the row there,
 * which is exactly the failure this table exists to make visible.
 */
export default class MailDelivery extends BaseModel {
  static table = 'mail_deliveries'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare eventKey: string | null

  @column()
  declare toAddress: string

  @column()
  declare subject: string | null

  @column()
  declare status: MailDeliveryStatus

  @column()
  declare error: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime()
  declare completedAt: DateTime | null
}

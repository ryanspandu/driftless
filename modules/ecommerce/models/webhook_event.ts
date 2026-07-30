import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { jsonColumn } from '#models/_columns'
import type { GatewayName } from '#modules/ecommerce/models/gateway_credential'

export type WebhookEventStatus = 'received' | 'processed' | 'failed' | 'ignored'

/**
 * A raw webhook delivery.
 *
 * Written **before** it is acted on, and `(gateway, event_id)` is unique — that
 * pair is the idempotency boundary for the entire payment flow. Gateways retry
 * aggressively and deliver out of order; without this a retried
 * `payment_succeeded` would run its side effects twice.
 */
export default class WebhookEvent extends BaseModel {
  static table = 'ecommerce_webhook_events'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare gateway: GatewayName

  @column()
  declare eventId: string

  @column()
  declare eventType: string

  @column(jsonColumn)
  declare payload: Record<string, unknown>

  @column()
  declare status: WebhookEventStatus

  @column()
  declare attempts: number

  @column()
  declare lastError: string | null

  @column.dateTime()
  declare processedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

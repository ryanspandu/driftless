import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** One pageview. See the migration for the privacy rationale. */
export default class AnalyticsEvent extends BaseModel {
  static table = 'analytics_events'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare visitorId: string

  @column()
  declare sessionId: string

  @column()
  declare path: string

  @column()
  declare title: string | null

  @column()
  declare referrer: string | null

  @column()
  declare referrerHost: string | null

  @column()
  declare source: 'direct' | 'search' | 'social' | 'referral' | 'internal'

  @column()
  declare deviceType: 'desktop' | 'mobile' | 'tablet'

  @column()
  declare browser: string | null

  @column()
  declare os: string | null

  @column({ serializeAs: null })
  declare ipHash: string | null

  @column.dateTime()
  declare createdAt: DateTime
}

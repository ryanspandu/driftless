import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** One buyer's right to download one asset from one paid order. */
export default class DownloadGrant extends BaseModel {
  static table = 'ecommerce_download_grants'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare orderId: string

  @column()
  declare orderItemId: string

  @column()
  declare assetId: string

  @column()
  declare downloadsCount: number

  /** `0` means unlimited. Copied from the asset so later edits do not retroactively shrink a quota someone paid for. */
  @column()
  declare maxDownloads: number

  @column.dateTime()
  declare expiresAt: DateTime | null

  @column.dateTime()
  declare revokedAt: DateTime | null

  @column.dateTime()
  declare lastDownloadedAt: DateTime | null

  @column({ serializeAs: null })
  declare lastDownloadIpHash: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * Whether this grant would be honoured right now.
   *
   * Read-only convenience for building DTOs and admin views. It is **not** the
   * check that guards a download — that one is a conditional UPDATE in
   * `DigitalDeliveryService.redeem`, because anything read-then-written here
   * would let two concurrent requests both pass the last remaining use.
   */
  get isLive(): boolean {
    if (this.revokedAt) return false
    if (this.expiresAt && this.expiresAt < DateTime.now()) return false
    if (this.maxDownloads > 0 && this.downloadsCount >= this.maxDownloads) return false
    return true
  }
}

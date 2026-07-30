import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * A downloadable file attached to a variant.
 *
 * `storagePath` is an absolute path under `storage/protected/`, deliberately
 * outside anything the static server will hand out. Nothing in this model ever
 * reaches a storefront DTO — a buyer sees a filename and a size, never a path.
 */
export default class DigitalAsset extends BaseModel {
  static table = 'ecommerce_digital_assets'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare variantId: string

  /** What the buyer's browser will save it as. */
  @column()
  declare filename: string

  @column({ serializeAs: null })
  declare storagePath: string

  @column()
  declare mimeType: string | null

  @column()
  declare sizeBytes: number | null

  /** Per-grant download quota. `0` means unlimited. */
  @column()
  declare maxDownloads: number

  /** How long a grant stays usable. `0` means it never expires. */
  @column()
  declare linkTtlHours: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null
}

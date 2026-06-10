import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class IntegrationSetting extends BaseModel {
  static table = 'integration_settings'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare googleAuthEnabled: boolean

  @column()
  declare googleClientId: string | null

  @column()
  declare googleClientSecretEnc: string | null

  @column()
  declare captchaEnabled: boolean

  @column()
  declare captchaProvider: string | null

  @column()
  declare captchaSiteKey: string | null

  @column()
  declare captchaSecretEnc: string | null

  @column()
  declare captchaOnLogin: boolean

  @column()
  declare captchaOnRegister: boolean

  @column()
  declare ga4Enabled: boolean

  @column()
  declare ga4MeasurementId: string | null

  @column()
  declare clarityEnabled: boolean

  @column()
  declare clarityProjectId: string | null

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

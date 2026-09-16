import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class IntegrationSetting extends BaseModel {
  static table = 'integration_settings'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare googleAuthEnabled: boolean

  /** Independent toggle for the ecommerce storefront's customer login/register. */
  @column()
  declare googleAuthEnabledForShop: boolean

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
  declare captchaOnCheckout: boolean

  @column()
  declare captchaOnForms: boolean

  @column()
  declare captchaOnDiscount: boolean

  // Explicit column names: the default snake_case strategy turns `ga4Enabled`
  // into `ga_4_enabled`, which doesn't match the `ga4_enabled` migration column.
  @column({ columnName: 'ga4_enabled' })
  declare ga4Enabled: boolean

  @column({ columnName: 'ga4_measurement_id' })
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

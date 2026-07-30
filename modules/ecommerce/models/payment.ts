import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { jsonColumn, moneyColumn } from '#models/_columns'
import type { GatewayMode, GatewayName } from '#modules/ecommerce/models/gateway_credential'

/**
 * Who took the money.
 *
 * `manual` is not a gateway and has no driver — it records that a human
 * confirmed payment arrived some other way (cash, a bank transfer, a terminal
 * in the shop). Keeping it out of `GatewayName` is deliberate: that type drives
 * driver lookup, and there must be no path on which the code goes looking for a
 * `manual` driver to refund against.
 */
export type PaymentGateway = GatewayName | 'manual'

export type PaymentRecordStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'expired'

export default class Payment extends BaseModel {
  static table = 'ecommerce_payments'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare orderId: string

  @column()
  declare gateway: PaymentGateway

  @column()
  declare mode: GatewayMode

  /**
   * The gateway's identifier — a Stripe Checkout Session id, a PayPal order id.
   *
   * Unique at the database level, and that uniqueness is load-bearing: it is
   * how a duplicate webhook or a redirect-and-webhook race resolves to one
   * payment rather than two.
   */
  @column()
  declare gatewayPaymentId: string

  @column()
  declare gatewayCustomerId: string | null

  @column()
  declare status: PaymentRecordStatus

  @column(moneyColumn)
  declare amount: number

  @column()
  declare currency: string

  /** Raw gateway response, kept for support and dispute handling. */
  @column(jsonColumn)
  declare gatewayPayload: Record<string, unknown>

  @column()
  declare failureMessage: string | null

  @column.dateTime()
  declare authorizedAt: DateTime | null

  @column.dateTime()
  declare capturedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

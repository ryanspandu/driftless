import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { jsonColumn, moneyColumn } from '#models/_columns'
import OrderItem from '#modules/ecommerce/models/order_item'

/** Fulfilment-facing state: is this order still live? */
export type OrderStatus =
  | 'draft'
  | 'pending'
  | 'confirmed'
  | 'fulfilled'
  | 'completed'
  | 'cancelled'

/** Money-facing state. Moves independently of `status`. */
export type PaymentStatus =
  | 'unpaid'
  | 'authorized'
  | 'paid'
  | 'partially_refunded'
  | 'refunded'
  | 'failed'

export type FulfillmentStatus = 'unfulfilled' | 'partially_fulfilled' | 'fulfilled'

/** Snapshot copied onto the order — never a reference to a mutable address row. */
export interface AddressSnapshot {
  firstName?: string | null
  lastName?: string | null
  company?: string | null
  line1?: string
  line2?: string | null
  city?: string
  state?: string | null
  postalCode?: string | null
  country?: string
  phone?: string | null
}

export default class Order extends BaseModel {
  static table = 'ecommerce_orders'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare number: string

  @column()
  declare status: OrderStatus

  @column()
  declare paymentStatus: PaymentStatus

  @column()
  declare fulfillmentStatus: FulfillmentStatus

  @column()
  declare accountId: string | null

  @column()
  declare email: string

  /** Hashed guest access token — what every lookup matches. Never serialise. */
  @column({ serializeAs: null })
  declare accessTokenHash: string | null

  /**
   * The same token, encrypted so it can be read back.
   *
   * Exists only so the confirmation email can carry the buyer's own order link:
   * that email is sent from `markOrderPaid`, reached by a webhook that holds no
   * plaintext token. Never serialise, and never return it from an endpoint —
   * the one legitimate reader is the mail builder.
   */
  @column({ serializeAs: null })
  declare accessTokenEnc: string | null

  @column(jsonColumn)
  declare shippingAddress: AddressSnapshot

  @column(jsonColumn)
  declare billingAddress: AddressSnapshot

  @column()
  declare currency: string

  @column(moneyColumn)
  declare subtotalAmount: number

  @column(moneyColumn)
  declare discountAmount: number

  @column(moneyColumn)
  declare shippingAmount: number

  @column(moneyColumn)
  declare taxAmount: number

  @column(moneyColumn)
  declare totalAmount: number

  @column(moneyColumn)
  declare refundedAmount: number

  @column()
  declare discountCode: string | null

  @column()
  declare affiliateCode: string | null

  @column()
  declare shippingMethodId: string | null

  @column()
  declare shippingMethodLabel: string | null

  /** Who is carrying it, and how the buyer follows it. Physical orders only. */
  @column()
  declare carrier: string | null

  @column()
  declare trackingNumber: string | null

  @column()
  declare trackingUrl: string | null

  @column.dateTime()
  declare shippedAt: DateTime | null

  @column({ serializeAs: null })
  declare idempotencyKey: string | null

  @column()
  declare customerNote: string | null

  /** Staff-only. Must never reach a storefront DTO. */
  @column({ serializeAs: null })
  declare internalNote: string | null

  @column.dateTime()
  declare reservationExpiresAt: DateTime | null

  @column.dateTime()
  declare paidAt: DateTime | null

  @column.dateTime()
  declare cancelledAt: DateTime | null

  @column.dateTime()
  declare fulfilledAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @hasMany(() => OrderItem, { foreignKey: 'orderId' })
  declare items: HasMany<typeof OrderItem>

  /** How much of this order could still be refunded. */
  get refundableAmount(): number {
    return Math.max(this.totalAmount - this.refundedAmount, 0)
  }

  get isPaid(): boolean {
    return ['paid', 'partially_refunded', 'refunded'].includes(this.paymentStatus)
  }
}

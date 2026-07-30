import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { booleanColumn, moneyColumn } from '#models/_columns'

/**
 * A buyer.
 *
 * Deliberately **not** a row in `users`. That table is the admin-area identity:
 * it carries RBAC roles, it is what `ctx.auth.user` resolves to, and everything
 * under `/admin` trusts it. Putting shoppers there would make one mistake in
 * role assignment the difference between a customer and an administrator.
 *
 * Keeping them apart makes the guarantee structural rather than procedural:
 * `ctx.auth.user` can never be a customer, because a customer has no row in the
 * table those guards read.
 */
export default class Customer extends BaseModel {
  static table = 'ecommerce_customers'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  /** Stored lower-cased; uniqueness is enforced by the database. */
  @column()
  declare email: string

  /**
   * Null for guest checkout — the common case. A password only exists once
   * someone deliberately creates an account.
   */
  @column({ serializeAs: null })
  declare passwordHash: string | null

  @column()
  declare firstName: string | null

  @column()
  declare lastName: string | null

  @column()
  declare phone: string | null

  @column()
  declare status: 'active' | 'blocked'

  @column.dateTime()
  declare emailVerifiedAt: DateTime | null

  @column(booleanColumn)
  declare acceptsMarketing: boolean

  /**
   * One-click opt-out, minted lazily the first time a marketing email is sent.
   * Unguessable so the link needs no login — an email address would not be.
   */
  @column({ serializeAs: null })
  declare unsubscribeToken: string | null

  /**
   * Recorded as an event with a date rather than only flipping
   * `acceptsMarketing`, so an opt-out survives someone editing a profile.
   */
  @column.dateTime()
  declare unsubscribedAt: DateTime | null

  @column()
  declare ordersCount: number

  @column(moneyColumn)
  declare totalSpentAmount: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  get fullName(): string {
    return [this.firstName, this.lastName].filter(Boolean).join(' ')
  }

  /**
   * May this customer sign in and check out?
   *
   * Truthiness on `deletedAt` rather than `=== null`: a freshly created
   * instance leaves it `undefined`, and `undefined === null` is false.
   */
  get isActive(): boolean {
    return this.status === 'active' && !this.deletedAt
  }
}

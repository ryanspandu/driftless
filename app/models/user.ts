import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import Role from '#models/role'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare fullName: string | null

  @column()
  declare email: string

  @column({ serializeAs: null })
  declare password: string

  @column()
  declare username: string | null

  @column()
  declare firstName: string | null

  @column()
  declare lastName: string | null

  @column()
  declare phone: string | null

  @column()
  declare address: string | null

  @column()
  declare status: 'ACTIVE' | 'INACTIVE'

  @column()
  declare googleSub: string | null

  @column.dateTime()
  declare emailVerifiedAt: DateTime | null

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @manyToMany(() => Role, {
    pivotTable: 'role_user',
    localKey: 'id',
    pivotForeignKey: 'user_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'role_id',
  })
  declare roles: ManyToMany<typeof Role>

  get initials() {
    const name = this.fullName || `${this.firstName ?? ''} ${this.lastName ?? ''}`.trim()
    if (name) {
      const parts = name.split(' ')
      if (parts.length >= 2) {
        return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
      }
      return name.slice(0, 2).toUpperCase()
    }
    return this.email.slice(0, 2).toUpperCase()
  }

  get displayName() {
    if (this.firstName || this.lastName) {
      return `${this.firstName ?? ''} ${this.lastName ?? ''}`.trim()
    }
    return this.fullName || this.email
  }
}

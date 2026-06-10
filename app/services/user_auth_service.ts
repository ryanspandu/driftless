import User from '#models/user'
import hash from '@adonisjs/core/services/hash'

export default class UserAuthService {
  static isBcryptHash(stored: string): boolean {
    return stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')
  }

  static async findByLogin(identifier: string): Promise<User | null> {
    const normalized = identifier.trim().toLowerCase()
    if (!normalized) return null

    const byEmail = await User.query()
      .whereRaw('LOWER(email) = ?', [normalized])
      .whereNull('deleted_at')
      .first()
    if (byEmail) return byEmail

    return User.query()
      .whereRaw('LOWER(username) = ?', [normalized])
      .whereNull('deleted_at')
      .first()
  }

  static async verifyPassword(user: User, password: string): Promise<boolean> {
    const stored = user.password
    if (this.isBcryptHash(stored)) {
      const valid = await hash.use('bcrypt').verify(stored, password)
      if (valid) {
        user.password = password
        await user.save()
      }
      return valid
    }
    return hash.use('scrypt').verify(stored, password)
  }

  static async verifyCredentialsForLogin(identifier: string, password: string): Promise<User> {
    const user = await this.findByLogin(identifier)
    if (!user) {
      throw new Error('Invalid credentials')
    }

    const valid = await this.verifyPassword(user, password)
    if (!valid) {
      throw new Error('Invalid credentials')
    }

    return user
  }
}

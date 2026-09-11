import User from '#models/user'
import Role from '#models/role'

export interface UserPublic {
  id: number
  email: string
  username: string | null
  firstName: string | null
  lastName: string | null
  fullName: string | null
  status: string
  roles: string[]
  createdAt: string
  updatedAt: string
}

export interface ListUsersQuery {
  page?: number
  pageSize?: number
  search?: string
  role?: string[]
  status?: string
}

export interface CreateUserDto {
  email: string
  password: string
  username?: string
  firstName?: string
  lastName?: string
  fullName?: string
  status?: string
  roles?: string[]
}

export interface UpdateUserDto {
  email?: string
  password?: string
  username?: string
  firstName?: string
  lastName?: string
  fullName?: string
  status?: string
  roles?: string[]
}

export interface PaginatedList<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export default class UsersService {
  async paginate(query: ListUsersQuery): Promise<PaginatedList<UserPublic>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20

    const q = User.query()
      .whereNull('deleted_at')
      .preload('roles')
      .orderBy('created_at', 'desc')

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`
      q.where((b) =>
        b
          .whereLike('email', term)
          .orWhereLike('username', term)
          .orWhereLike('first_name', term)
          .orWhereLike('last_name', term)
      )
    }

    if (query.status) {
      q.where('status', query.status)
    }

    if (query.role?.length) {
      q.whereHas('roles', (rq) => rq.whereIn('name', query.role!))
    }

    const paginated = await q.paginate(page, pageSize)

    return {
      items: paginated.all().map((u) => this.toDto(u)),
      page,
      pageSize,
      total: paginated.total,
      totalPages: paginated.lastPage,
    }
  }

  async findOne(id: number): Promise<UserPublic> {
    const user = await User.query()
      .where('id', id)
      .whereNull('deleted_at')
      .preload('roles')
      .firstOrFail()
    return this.toDto(user)
  }

  async create(dto: CreateUserDto): Promise<UserPublic> {
    const existing = await User.query()
      .where('email', dto.email)
      .whereNull('deleted_at')
      .first()
    if (existing) throw new Error('Email already registered')

    if (dto.username) {
      const byUsername = await User.query()
        .where('username', dto.username)
        .whereNull('deleted_at')
        .first()
      if (byUsername) throw new Error('Username already taken')
    }

    const user = await User.create({
      email: dto.email,
      password: dto.password,
      username: dto.username ?? null,
      firstName: dto.firstName ?? null,
      lastName: dto.lastName ?? null,
      fullName: dto.fullName ?? null,
      status: (dto.status as 'ACTIVE' | 'INACTIVE') ?? 'ACTIVE',
    })

    if (dto.roles?.length) {
      const roleRecords = await Role.query().whereIn('name', dto.roles).whereNull('deleted_at')
      await user.related('roles').sync(roleRecords.map((r) => r.id))
    }

    await user.load('roles')
    return this.toDto(user)
  }

  async update(id: number, dto: UpdateUserDto): Promise<UserPublic> {
    const user = await User.query()
      .where('id', id)
      .whereNull('deleted_at')
      .preload('roles')
      .firstOrFail()

    if (dto.email && dto.email !== user.email) {
      const existing = await User.query()
        .where('email', dto.email)
        .whereNull('deleted_at')
        .whereNot('id', id)
        .first()
      if (existing) throw new Error('Email already registered')
    }

    if (dto.username && dto.username !== user.username) {
      const existing = await User.query()
        .where('username', dto.username)
        .whereNull('deleted_at')
        .whereNot('id', id)
        .first()
      if (existing) throw new Error('Username already taken')
    }

    if (dto.email !== undefined) user.email = dto.email
    if (dto.username !== undefined) user.username = dto.username ?? null
    if (dto.firstName !== undefined) user.firstName = dto.firstName ?? null
    if (dto.lastName !== undefined) user.lastName = dto.lastName ?? null
    if (dto.fullName !== undefined) user.fullName = dto.fullName ?? null
    if (dto.status !== undefined) user.status = dto.status as 'ACTIVE' | 'INACTIVE'
    if (dto.password !== undefined) {
      // Assign the plaintext: `withAuthFinder`'s `beforeSave` hook hashes any
      // dirty password column on save. Hashing here as well stored a hash of a
      // hash, so admin-set passwords could never be used to log in.
      user.password = dto.password
    }

    await user.save()

    if (dto.roles !== undefined) {
      const roleRecords = await Role.query().whereIn('name', dto.roles).whereNull('deleted_at')
      await user.related('roles').sync(roleRecords.map((r) => r.id))
    }

    await user.load('roles')
    return this.toDto(user)
  }

  async remove(id: number, requesterId: number): Promise<void> {
    if (id === requesterId) throw new Error('You cannot delete your own account')

    const user = await User.query().where('id', id).whereNull('deleted_at').firstOrFail()

    user.deletedAt = new Date() as any
    user.email = `__deleted_${id}__${user.email}`
    if (user.username) user.username = `__deleted_${id}__${user.username}`
    await user.save()
  }

  /** Soft-deleted users (the Trash). Email and username are restored to their display form. */
  async findTrashed(): Promise<UserPublic[]> {
    const rows = await User.query()
      .whereNotNull('deleted_at')
      .preload('roles')
      .orderBy('updated_at', 'desc')
    return rows.map((u) => {
      const dto = this.toDto(u)
      dto.email = this.stripDeletedPrefix(u.id, dto.email)
      if (dto.username) dto.username = this.stripDeletedPrefix(u.id, dto.username)
      return dto
    })
  }

  /** Restore a soft-deleted user, recovering its original email/username (suffixed if it now clashes). */
  async restore(id: number): Promise<UserPublic> {
    const user = await User.query()
      .where('id', id)
      .whereNotNull('deleted_at')
      .preload('roles')
      .firstOrFail()

    const cleanEmail = this.stripDeletedPrefix(id, user.email)
    const emailClash = await User.query()
      .where('email', cleanEmail)
      .whereNull('deleted_at')
      .whereNot('id', id)
      .first()
    user.email = emailClash ? `restored-${id}-${cleanEmail}` : cleanEmail

    if (user.username) {
      const cleanUsername = this.stripDeletedPrefix(id, user.username)
      const usernameClash = await User.query()
        .where('username', cleanUsername)
        .whereNull('deleted_at')
        .whereNot('id', id)
        .first()
      user.username = usernameClash ? `${cleanUsername}-restored-${id}` : cleanUsername
    }

    user.deletedAt = null as any
    await user.save()
    await user.load('roles')
    return this.toDto(user)
  }

  /** Permanently delete a user that is already in the Trash. */
  async forceDelete(id: number): Promise<void> {
    const user = await User.query().where('id', id).whereNotNull('deleted_at').firstOrFail()
    await user.delete()
  }

  private stripDeletedPrefix(id: number, value: string): string {
    const prefix = `__deleted_${id}__`
    return value.startsWith(prefix) ? value.slice(prefix.length) : value
  }

  generatePassword(length = 16): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    let pw = ''
    for (let i = 0; i < length; i++) {
      pw += chars[Math.floor(Math.random() * chars.length)]
    }
    return pw
  }

  private toDto(user: User): UserPublic {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      status: user.status,
      roles: user.roles?.map((r) => r.name) ?? [],
      createdAt: user.createdAt.toISO()!,
      updatedAt: user.updatedAt?.toISO() ?? user.createdAt.toISO()!,
    }
  }
}

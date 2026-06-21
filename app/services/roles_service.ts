import Role from '#models/role'
import Permission from '#models/permission'
import { newUlid } from '#services/ulid_service'

export interface RoleDto {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  permissions: string[]
  userCount?: number
  createdAt: string
  updatedAt: string
}

export default class RolesService {
  async list(): Promise<RoleDto[]> {
    const rows = await Role.query()
      .whereNull('deleted_at')
      .preload('permissions', (q) => q.whereNull('deleted_at'))
      .withCount('users', (q) => q.whereNull('deleted_at'))
      .orderByRaw('is_system DESC, name ASC')
    return rows.map((r) => this.toDto(r))
  }

  async findOne(id: string): Promise<RoleDto> {
    const row = await Role.query()
      .where('id', id)
      .whereNull('deleted_at')
      .preload('permissions', (q) => q.whereNull('deleted_at'))
      .withCount('users', (q) => q.whereNull('deleted_at'))
      .firstOrFail()
    return this.toDto(row)
  }

  async create(dto: { name: string; description?: string; permissions?: string[] }): Promise<RoleDto> {
    const existing = await Role.query().where('name', dto.name).whereNull('deleted_at').first()
    if (existing) throw new Error(`Role "${dto.name}" already exists`)

    const role = await Role.create({
      id: newUlid(),
      name: dto.name,
      description: dto.description ?? null,
      isSystem: false,
    })

    if (dto.permissions?.length) {
      const perms = await Permission.query()
        .whereIn('name', dto.permissions)
        .whereNull('deleted_at')
      const missing = dto.permissions.filter((n) => !perms.find((p) => p.name === n))
      if (missing.length) throw new Error(`Unknown permissions: ${missing.join(', ')}`)
      await role.related('permissions').sync(perms.map((p) => p.id))
    }

    await role.load('permissions')
    return this.toDto(role)
  }

  async update(
    id: string,
    dto: { name?: string; description?: string; permissions?: string[] }
  ): Promise<RoleDto> {
    const role = await Role.query()
      .where('id', id)
      .whereNull('deleted_at')
      .preload('permissions')
      .firstOrFail()

    if (role.isSystem && dto.name && dto.name !== role.name) {
      throw new Error('System roles cannot be renamed')
    }

    if (dto.name && dto.name !== role.name) {
      const dup = await Role.query().where('name', dto.name).whereNull('deleted_at').first()
      if (dup) throw new Error(`Role "${dto.name}" already exists`)
    }

    if (dto.permissions !== undefined) {
      if (role.name === 'SUPERADMIN' && !dto.permissions.includes('*')) {
        throw new Error('The SUPERADMIN role must retain the "*" permission.')
      }
      const perms = await Permission.query()
        .whereIn('name', dto.permissions)
        .whereNull('deleted_at')
      const missing = dto.permissions.filter((n) => !perms.find((p) => p.name === n))
      if (missing.length) throw new Error(`Unknown permissions: ${missing.join(', ')}`)
      await role.related('permissions').sync(perms.map((p) => p.id))
    }

    if (dto.name !== undefined) role.name = dto.name
    if (dto.description !== undefined) role.description = dto.description ?? null
    await role.save()

    await role.load('permissions')
    return this.toDto(role)
  }

  async remove(id: string): Promise<void> {
    const role = await Role.query()
      .where('id', id)
      .whereNull('deleted_at')
      .withCount('users', (q) => q.whereNull('deleted_at'))
      .firstOrFail()

    if (role.isSystem) throw new Error('System roles cannot be deleted')

    const userCount = Number((role as any).$extras.users_count ?? 0)
    if (userCount > 0) {
      throw new Error(
        `Cannot delete role "${role.name}" — it is still assigned to ${userCount} user(s).`
      )
    }

    role.deletedAt = new Date() as any
    role.name = `__deleted_${id}__${role.name}`
    await role.save()
  }

  /** Soft-deleted roles (the Trash). Name is restored to its display form. */
  async findTrashed(): Promise<RoleDto[]> {
    const rows = await Role.query()
      .whereNotNull('deleted_at')
      .preload('permissions', (q) => q.whereNull('deleted_at'))
      .orderBy('updated_at', 'desc')
    return rows.map((r) => {
      const dto = this.toDto(r)
      dto.name = this.stripDeletedPrefix(r.id, dto.name)
      return dto
    })
  }

  /** Restore a soft-deleted role, recovering its original name (suffixed if it now clashes). */
  async restore(id: string): Promise<RoleDto> {
    const role = await Role.query()
      .where('id', id)
      .whereNotNull('deleted_at')
      .preload('permissions', (q) => q.whereNull('deleted_at'))
      .firstOrFail()
    const cleanName = this.stripDeletedPrefix(id, role.name)
    const clash = await Role.query()
      .where('name', cleanName)
      .whereNull('deleted_at')
      .whereNot('id', id)
      .first()
    role.name = clash ? `${cleanName}-restored-${id.slice(-6)}` : cleanName
    role.deletedAt = null
    await role.save()
    return this.toDto(role)
  }

  /** Permanently delete a role that is already in the Trash. */
  async forceDelete(id: string): Promise<void> {
    const role = await Role.query().where('id', id).whereNotNull('deleted_at').firstOrFail()
    await role.delete()
  }

  private stripDeletedPrefix(id: string, value: string): string {
    const prefix = `__deleted_${id}__`
    return value.startsWith(prefix) ? value.slice(prefix.length) : value
  }

  private toDto(role: Role): RoleDto {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions?.map((p) => p.name) ?? [],
      userCount: Number((role as any).$extras?.users_count ?? 0) || undefined,
      createdAt: role.createdAt.toISO()!,
      updatedAt: role.updatedAt.toISO()!,
    }
  }
}

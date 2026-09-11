import Permission from '#models/permission'
import { newUlid } from '#services/ulid_service'

export interface PermissionDto {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  roleCount?: number
  createdAt: string
  updatedAt: string
}

export default class PermissionsService {
  async list(): Promise<PermissionDto[]> {
    const rows = await Permission.query()
      .whereNull('deleted_at')
      .withCount('roles')
      .orderByRaw('is_system DESC, name ASC')
    return rows.map((r) => this.toDto(r))
  }

  async findOne(id: string): Promise<PermissionDto> {
    const row = await Permission.query()
      .where('id', id)
      .whereNull('deleted_at')
      .withCount('roles')
      .firstOrFail()
    return this.toDto(row)
  }

  async create(dto: { name: string; description?: string }): Promise<PermissionDto> {
    const existing = await Permission.query().where('name', dto.name).whereNull('deleted_at').first()
    if (existing) throw new Error(`Permission "${dto.name}" already exists`)

    const perm = await Permission.create({
      id: newUlid(),
      name: dto.name,
      description: dto.description ?? null,
      isSystem: false,
    })

    return this.toDto(perm)
  }

  async update(id: string, dto: { name?: string; description?: string }): Promise<PermissionDto> {
    const perm = await Permission.query().where('id', id).whereNull('deleted_at').firstOrFail()

    if (perm.isSystem && dto.name && dto.name !== perm.name) {
      throw new Error('System permissions cannot be renamed')
    }

    if (dto.name && dto.name !== perm.name) {
      const dup = await Permission.query().where('name', dto.name).whereNull('deleted_at').first()
      if (dup) throw new Error(`Permission "${dto.name}" already exists`)
    }

    if (dto.name !== undefined) perm.name = dto.name
    if (dto.description !== undefined) perm.description = dto.description ?? null
    await perm.save()

    return this.toDto(perm)
  }

  async remove(id: string): Promise<void> {
    const perm = await Permission.query().where('id', id).whereNull('deleted_at').firstOrFail()
    if (perm.isSystem) throw new Error('System permissions cannot be deleted')

    perm.deletedAt = new Date() as any
    perm.name = `__deleted_${id}__${perm.name}`
    await perm.save()
  }

  /** Soft-deleted permissions (the Trash). Name is restored to its display form. */
  async findTrashed(): Promise<PermissionDto[]> {
    const rows = await Permission.query()
      .whereNotNull('deleted_at')
      .orderBy('updated_at', 'desc')
    return rows.map((r) => {
      const dto = this.toDto(r)
      dto.name = this.stripDeletedPrefix(r.id, dto.name)
      return dto
    })
  }

  /** Restore a soft-deleted permission, recovering its original name (suffixed if it now clashes). */
  async restore(id: string): Promise<PermissionDto> {
    const perm = await Permission.query()
      .where('id', id)
      .whereNotNull('deleted_at')
      .firstOrFail()
    const cleanName = this.stripDeletedPrefix(id, perm.name)
    const clash = await Permission.query()
      .where('name', cleanName)
      .whereNull('deleted_at')
      .whereNot('id', id)
      .first()
    perm.name = clash ? `${cleanName}-restored-${id.slice(-6)}` : cleanName
    perm.deletedAt = null
    await perm.save()
    return this.toDto(perm)
  }

  /** Permanently delete a permission that is already in the Trash. */
  async forceDelete(id: string): Promise<void> {
    const perm = await Permission.query().where('id', id).whereNotNull('deleted_at').firstOrFail()
    await perm.delete()
  }

  private stripDeletedPrefix(id: string, value: string): string {
    const prefix = `__deleted_${id}__`
    return value.startsWith(prefix) ? value.slice(prefix.length) : value
  }

  private toDto(perm: Permission): PermissionDto {
    return {
      id: perm.id,
      name: perm.name,
      description: perm.description,
      isSystem: perm.isSystem,
      roleCount: Number((perm as any).$extras?.roles_count ?? 0) || undefined,
      createdAt: perm.createdAt.toISO()!,
      updatedAt: perm.updatedAt.toISO()!,
    }
  }
}

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

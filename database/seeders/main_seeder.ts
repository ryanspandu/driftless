import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import IntegrationSetting from '#models/integration_setting'
import { newUlid } from '#services/ulid_service'
import env from '#start/env'
import { BUILTIN_PERMISSIONS, BUILTIN_ROLES, ROLE_PERMISSIONS } from '../seeder_constants.js'

/**
 * Built-in roles, permissions and the first admin.
 *
 * Idempotent, which is what makes it usable both on a fresh deploy and before
 * every test.
 *
 * Written to do a **fixed, small number of queries** rather than one per row.
 * The obvious shape — a SELECT and an INSERT per permission, then more queries
 * inside the role loop — is roughly 150 round trips, and the test suite pays
 * that before every single test. Batching is worth far more here than the few
 * lines of care it costs.
 */
export default class extends BaseSeeder {
  async run() {
    await this.syncPermissions()
    await this.syncRoles()
    await this.syncRolePermissions()

    const integration = await IntegrationSetting.find('default')
    if (!integration) {
      await IntegrationSetting.create({ id: 'default' })
    }

    await this.seedAdmin()
  }

  /** One SELECT for the lot, one batched INSERT for whatever is missing. */
  private async syncPermissions() {
    const existing = await Permission.query().whereIn(
      'name',
      BUILTIN_PERMISSIONS.map((p) => p.name)
    )
    const byName = new Map(existing.map((row) => [row.name, row]))

    const missing: { id: string; name: string; description: string; isSystem: boolean }[] = []

    for (const { name, description } of BUILTIN_PERMISSIONS) {
      const row = byName.get(name)
      if (!row) {
        missing.push({ id: newUlid(), name, description, isSystem: true })
        continue
      }

      /**
       * Written only when something actually differs. An unconditional `save()`
       * is a write per permission on every run — pure cost on a re-seed, which
       * is the case that happens hundreds of times in the test suite.
       */
      if (row.description !== description || !row.isSystem) {
        row.description = description
        row.isSystem = true
        await row.save()
      }
    }

    if (missing.length > 0) await Permission.createMany(missing)
  }

  private async syncRoles() {
    const existing = await Role.query().whereIn(
      'name',
      BUILTIN_ROLES.map((r) => r.name)
    )
    const byName = new Map(existing.map((row) => [row.name, row]))

    const missing: { id: string; name: string; description: string; isSystem: boolean }[] = []

    for (const { name, description } of BUILTIN_ROLES) {
      const row = byName.get(name)
      if (!row) {
        missing.push({ id: newUlid(), name, description, isSystem: true })
        continue
      }
      if (row.description !== description || !row.isSystem) {
        row.description = description
        row.isSystem = true
        await row.save()
      }
    }

    if (missing.length > 0) await Role.createMany(missing)
  }

  /**
   * Attach each built-in role's permissions.
   *
   * Both lookups are hoisted out of the loop — the original re-queried the role
   * and its permission set on every iteration. `sync()` still runs per role
   * because it has to diff the pivot, but it is now the only query in there.
   */
  private async syncRolePermissions() {
    const roles = await Role.query().whereIn(
      'name',
      BUILTIN_ROLES.map((r) => r.name)
    )
    const permissions = await Permission.all()
    const idByName = new Map(permissions.map((p) => [p.name, p.id]))

    for (const role of roles) {
      const codes = ROLE_PERMISSIONS[role.name] ?? []
      const ids = [...codes]
        .map((code) => idByName.get(code))
        .filter((id): id is string => Boolean(id))

      await role.related('permissions').sync(ids)
    }
  }

  private async seedAdmin() {
    const email = env.get('SEED_ADMIN_EMAIL', 'admin@driftless.local')
    const password = env.get('SEED_ADMIN_PASSWORD', 'Driftless#333')
    const username = env.get('SEED_ADMIN_USERNAME', 'johndoe')

    const forcePassword = env.get('FORCE_SEED_PASSWORD') === '1'
    const existing = await User.query().where('email', email).whereNull('deleted_at').first()

    if (existing) {
      if (forcePassword) {
        existing.password = password
        await existing.save()
      }
      return
    }

    const user = await User.create({
      email,
      username,
      firstName: 'John',
      lastName: 'Doe',
      fullName: 'John Doe',
      password,
      status: 'ACTIVE',
    })

    const superadmin = await Role.query().where('name', 'SUPERADMIN').firstOrFail()
    await user.related('roles').sync([superadmin.id])
  }
}

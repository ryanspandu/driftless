import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import IntegrationSetting from '#models/integration_setting'
import { newUlid } from '#services/ulid_service'
import env from '#start/env'
import { BUILTIN_PERMISSIONS, BUILTIN_ROLES, ROLE_PERMISSIONS } from '../seeder_constants.js'

export default class extends BaseSeeder {
  async run() {
    for (const { name, description } of BUILTIN_PERMISSIONS) {
      const existing = await Permission.query().where('name', name).first()
      if (existing) {
        existing.description = description
        existing.isSystem = true
        await existing.save()
      } else {
        await Permission.create({ id: newUlid(), name, description, isSystem: true })
      }
    }

    for (const { name, description } of BUILTIN_ROLES) {
      const existing = await Role.query().where('name', name).first()
      if (existing) {
        existing.description = description
        existing.isSystem = true
        await existing.save()
      } else {
        await Role.create({ id: newUlid(), name, description, isSystem: true })
      }
    }

    for (const { name: roleName } of BUILTIN_ROLES) {
      const codes = ROLE_PERMISSIONS[roleName] ?? []
      const role = await Role.query().where('name', roleName).firstOrFail()
      const perms = await Permission.query().whereIn('name', [...codes])
      await role.related('permissions').sync(perms.map((p) => p.id))
    }

    const integration = await IntegrationSetting.find('default')
    if (!integration) {
      await IntegrationSetting.create({ id: 'default' })
    }

    const email = env.get('SEED_ADMIN_EMAIL', 'admin@driftless.local')
    const password = env.get('SEED_ADMIN_PASSWORD', 'Driftless#333')
    const username = env.get('SEED_ADMIN_USERNAME', 'johndoe')

    const forcePassword = env.get('FORCE_SEED_PASSWORD') === '1'
    const existing = await User.query().where('email', email).whereNull('deleted_at').first()
    if (!existing) {
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
    } else if (forcePassword) {
      existing.password = password
      await existing.save()
    }
  }
}

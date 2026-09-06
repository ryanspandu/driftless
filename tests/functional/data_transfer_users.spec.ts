import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import { newUlid } from '#services/ulid_service'
import SiteExportService from '#services/data_transfer/site_export_service'
import SiteImportService from '#services/data_transfer/site_import_service'
import { registerCoreDataSections } from '#services/data_transfer/core_sections'

/**
 * The `users` section: core RBAC (users, roles, permissions + pivots) survives
 * an export/import round-trip, re-linking the `role_user` pivot across the
 * integer-user-id / ULID-role-id id remap.
 */
test.group('Data transfer | users & roles', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    registerCoreDataSections()
    return cleanup
  })

  test('round-trips a user, a role and their pivot link', async ({ assert }) => {
    const role = await Role.create({ id: newUlid(), name: 'Editor' })
    const user = await User.create({ email: 'e@x.test', password: 'x', status: 'ACTIVE' })
    await user.related('roles').attach([role.id])

    const archive = await new SiteExportService().export({ only: ['users'] })

    // Wipe what this test created (the pivot first — it FKs both sides).
    await db.from('role_user').where('user_id', user.id).delete()
    await User.query().where('email', 'e@x.test').delete()
    await Role.query().where('name', 'Editor').delete()

    assert.isNull(await User.query().where('email', 'e@x.test').first())
    assert.isNull(await Role.query().where('name', 'Editor').first())

    const result = await new SiteImportService().import(archive, { only: ['users'] })

    const restoredRole = await Role.query().where('name', 'Editor').first()
    const restoredUser = await User.query().where('email', 'e@x.test').first()
    assert.isNotNull(restoredRole)
    assert.isNotNull(restoredUser)

    // The pivot links the RESTORED ids (the user got a fresh integer id).
    const link = await db
      .from('role_user')
      .where({ role_id: restoredRole!.id, user_id: restoredUser!.id })
      .first()
    assert.isNotNull(link)

    assert.isTrue(result.sections.some((s) => s.name === 'users'))
  })
})

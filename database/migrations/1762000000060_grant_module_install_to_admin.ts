import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Grant `module:install` to the ADMIN role.
 *
 * The seeder covers fresh installs. It does **not** touch an installation that
 * has already been seeded — so without this migration, every existing
 * deployment's admins would keep seeing no install button and no explanation.
 *
 * Idempotent both ways: it inserts nothing if the grant is already there, and
 * it only removes the grant it added.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      const role = await db.from('roles').where('name', 'ADMIN').select('id').first()
      const permission = await db
        .from('permissions')
        .where('name', 'module:install')
        .select('id')
        .first()

      /**
       * Both are seeded rows, so either being absent means this database has not
       * been seeded yet — in which case the seeder will grant it and there is
       * nothing to do here.
       */
      if (!role || !permission) return

      const existing = await db
        .from('permission_role')
        .where('role_id', role.id)
        .where('permission_id', permission.id)
        .first()

      if (existing) return

      await db.table('permission_role').insert({
        role_id: role.id,
        permission_id: permission.id,
      })
    })
  }

  async down() {
    this.defer(async (db) => {
      const role = await db.from('roles').where('name', 'ADMIN').select('id').first()
      const permission = await db
        .from('permissions')
        .where('name', 'module:install')
        .select('id')
        .first()

      if (!role || !permission) return

      await db
        .from('permission_role')
        .where('role_id', role.id)
        .where('permission_id', permission.id)
        .delete()
    })
  }
}

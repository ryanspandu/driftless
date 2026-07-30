import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Folds the `plugins` system into `modules`.
 *
 * The two were 85% the same code, and the copy that saw less traffic drifted —
 * the plugin enabled-cache had no TTL and was simply wrong on a multi-worker
 * deployment. What used to be two implementations is now one, with `kind` on
 * the manifest deciding the trust tier.
 *
 * Four of the five steps below are bookkeeping. The first is the one that
 * breaks a live installation if it is missed.
 */
export default class extends BaseSchema {
  async up() {
    /**
     * Forget the old paths. `announcements` moved from `plugins/announcements/`
     * to `modules/announcements/`, and Lucid keys a migration by its **path**,
     * so the old rows now describe files that no longer exist.
     *
     * Deleted rather than renamed, and the distinction is not cosmetic: the
     * migrator fixes its pending list *before* running anything, so by the time
     * this executes it has already decided the moved file is new and recorded
     * it under `modules/…`. Renaming would collide with that fresh row; the
     * move survives because the moved migration itself is idempotent.
     */
    this.defer(async (db) => {
      await db.from('adonis_schema').where('name', 'like', 'plugins/%').delete()
    })

    this.schema.alterTable('modules', (table) => {
      /**
       * `app` by default so every existing row keeps the fuller contract it
       * already had. Only packages that opt into `plugin` get the smaller one.
       */
      table.string('kind').notNullable().defaultTo('app')

      /**
       * Why a module was disabled automatically, when it was the boot hook that
       * threw rather than an operator flipping the switch. Null for every
       * ordinary row.
       */
      table.text('boot_error').nullable()

      /**
       * Where the folder came from. `bundled` ships with the CMS; the other two
       * arrive after it. Needed before the marketplace can tell an operator
       * which packages it may update.
       */
      table.string('source').notNullable().defaultTo('bundled')
    })

    /**
     * Carry the rows across, preserving whether the operator had each one
     * enabled. `insert … select` rather than a read-modify-write loop so the
     * whole move is one statement and cannot half-apply.
     *
     * `where not exists` guards the case where a module of the same name is
     * already present — the unique index on `name` would otherwise abort the
     * migration, and refusing to boot over a name collision helps nobody.
     */
    this.defer(async (db) => {
      const hasPlugins = await db.schema.hasTable('plugins')
      if (!hasPlugins) return

      await db.rawQuery(`
        INSERT INTO modules (id, name, enabled, version, installed_at, kind, source, created_at, updated_at)
        SELECT p.id, p.name, p.enabled, p.version, p.installed_at, 'plugin', 'bundled', p.created_at, p.updated_at
          FROM plugins p
         WHERE NOT EXISTS (SELECT 1 FROM modules m WHERE m.name = p.name)
      `)
    })

    /**
     * Rename the permission rather than mint a new one, so the roles that
     * already hold `plugin:manage` keep their grant. Creating `module:manage`
     * fresh would silently take the capability away from every admin.
     */
    this.defer(async (db) => {
      const collision = await db
        .from('permissions')
        .where('name', 'module:manage')
        .first()

      if (collision) {
        // Already unified — drop the old name instead of colliding on it.
        await db.from('permissions').where('name', 'plugin:manage').delete()
        return
      }

      await db
        .from('permissions')
        .where('name', 'plugin:manage')
        .update({
          name: 'module:manage',
          description: 'Enable or disable installed modules and plugins.',
        })
    })

    this.schema.dropTableIfExists('plugins')
  }

  /**
   * Deliberately not reversible.
   *
   * Rolling back would have to split `modules` rows by `kind` and move the
   * `adonis_schema` names back, and it would do so against a codebase that no
   * longer has a plugin system to receive them. A down migration that leaves
   * the database in a shape nothing can read is worse than none.
   */
  async down() {
    throw new Error(
      'unify_plugins_into_modules cannot be rolled back — restore from a backup instead.'
    )
  }
}

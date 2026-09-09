import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Per-kit activation state.
 *
 * Kits are filesystem folders under `inertia/custom/kits/<slug>/` (no DB row of
 * their own); this table holds only the mutable "is this kit active?" flag,
 * keyed by the folder slug — mirroring how `modules` holds `enabled` for a
 * manifest-defined module. Fail-closed: no row (or `active = false`) means the
 * kit's templates and file-pages stay hidden, so an imported kit can never
 * surface itself until an operator turns it on.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('template_kits', (table) => {
      table.string('slug').primary()
      table.boolean('active').notNullable().defaultTo(false)
      table.timestamps(true, true)
    })
  }

  async down() {
    this.schema.dropTable('template_kits')
  }
}

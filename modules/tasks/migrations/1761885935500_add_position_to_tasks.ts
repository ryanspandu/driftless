import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'tasks'

  async up() {
    const hasPosition = await this.schema.hasColumn(this.tableName, 'position')
    if (hasPosition) return

    // Ordering rank WITHIN a status column. Fractional float indexing so a single
    // drag writes one row (midpoint of its neighbours) instead of renumbering.
    this.schema.alterTable(this.tableName, (table) => {
      table.double('position').notNullable().defaultTo(0)
      table.index(['status', 'position'], 'tasks_status_position_index')
    })

    // Seed existing rows per status preserving their current visible order
    // (newest-first), with gaps of 1000 so the first dozen drops never normalize.
    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE tasks AS t
         SET position = sub.rn * 1000
         FROM (
           SELECT id, row_number() OVER (PARTITION BY status ORDER BY created_at DESC) AS rn
           FROM tasks
           WHERE deleted_at IS NULL
         ) AS sub
         WHERE t.id = sub.id`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['status', 'position'], 'tasks_status_position_index')
      table.dropColumn('position')
    })
  }
}

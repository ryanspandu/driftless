import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * One row per module install started from the admin UI.
 *
 * The row **is** the state. Installing ends by restarting the web process, so
 * nothing held in memory survives to report the outcome — and the process that
 * started the work is not the process that finishes it. Every write comes from
 * the detached installer child, which means the web process dying mid-install is
 * a non-event rather than a lost job.
 *
 * Named for what it is rather than `jobs`: a generic name collides with the
 * BullMQ queue and invites someone to unify two things that must stay apart.
 */
export default class extends BaseSchema {
  protected tableName = 'module_install_jobs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('id').primary()
      table.string('module_name').notNullable()

      /** queued | running | awaiting_restart | succeeded | failed | abandoned */
      table.string('state').notNullable().defaultTo('queued')
      /** migrate | build | enable | restart — for the progress display. */
      table.string('step').nullable()

      /**
       * Fleet-wide single flight, expressed as a nullable column with a plain
       * unique index.
       *
       * `'1'` while the job is active, NULL once it reaches any terminal state.
       * NULLs are distinct in both Postgres and SQLite, so unlimited finished
       * rows coexist and at most one unfinished row can exist at a time.
       *
       * A partial index (`WHERE state IN (…)`) would express this more directly
       * on Postgres and not exist at all on SQLite — and this is precisely the
       * guard that has to be covered by the fast test suite rather than only by
       * `tests/pg`.
       *
       * Deliberately one active job across **all** modules, not one per module:
       * two installs at once would race over `build/`, `releases/` and the
       * migrator.
       */
      table.string('active_lock', 1).nullable()
      table.unique(['active_lock'], { indexName: 'module_install_jobs_active' })

      table.boolean('requires_build').notNullable().defaultTo(false)
      table.boolean('requires_restart').notNullable().defaultTo(true)

      /** The installer child. Informational — liveness comes from the heartbeat. */
      table.integer('pid').nullable()

      /**
       * Refreshed by the child every few seconds.
       *
       * Liveness is a heartbeat rather than `process.kill(pid, 0)` because pids
       * are reused, and because in a multi-machine deployment the pid means
       * nothing to whoever is checking.
       */
      table.timestamp('heartbeat_at').nullable()

      table.timestamp('started_at').nullable()
      table.timestamp('finished_at').nullable()

      table.json('applied_migrations').nullable()
      /** Which release the build produced, so resume can tell if we restarted into it. */
      table.string('release_stamp').nullable()
      /** What we told the operator would happen, kept for the audit trail. */
      table.string('restart_kind').nullable()

      table.string('error_reason').nullable()
      table.text('error_message').nullable()
      /** Tail of the child's output — enough to diagnose, not a full build log. */
      table.text('log_tail').nullable()

      table.integer('requested_by_user_id').nullable()
      /** Joins the child's audit rows back to the operator's original request. */
      table.string('request_id').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['state'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

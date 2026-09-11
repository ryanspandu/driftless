import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * First-party web analytics events (one row per pageview).
 *
 * Deliberately minimal and privacy-preserving: the IP is stored only as a keyed
 * HMAC (never raw), the visitor is a random first-party id (no cross-site
 * tracking), and no personal data is kept. Every metric — visitors, sessions,
 * top pages, sources, devices, bounce rate — is derived from this one table.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('analytics_events', (table) => {
      table.string('id').primary()

      // A persistent first-party visitor id (cookie `dl_vid`), and a per-visit
      // session id (30-min sliding cookie). Both are opaque random ids.
      table.string('visitor_id', 40).notNullable()
      table.string('session_id', 40).notNullable()

      // The page visited (pathname only — no query string, to avoid capturing
      // anything sensitive) and an optional document title.
      table.string('path', 512).notNullable()
      table.string('title', 300).nullable()

      // Raw referrer + a derived classification.
      table.string('referrer', 512).nullable()
      table.string('referrer_host', 255).nullable()
      // direct | search | social | referral | internal
      table.string('source', 16).notNullable().defaultTo('direct')

      // Parsed from the User-Agent. `device_type` ∈ desktop | mobile | tablet.
      table.string('device_type', 16).notNullable().defaultTo('desktop')
      table.string('browser', 64).nullable()
      table.string('os', 64).nullable()

      // Keyed HMAC of the IP — never the raw address.
      table.string('ip_hash', 64).nullable()

      table.timestamp('created_at').notNullable()

      // Reporting queries always filter by time; several also group by path or
      // session, so those get composite indexes.
      table.index(['created_at'], 'analytics_events_created_index')
      table.index(['created_at', 'path'], 'analytics_events_path_index')
      table.index(['session_id'], 'analytics_events_session_index')
      table.index(['visitor_id', 'created_at'], 'analytics_events_visitor_index')
    })
  }

  async down() {
    this.schema.dropTable('analytics_events')
  }
}

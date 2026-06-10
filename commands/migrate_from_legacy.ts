/**
 * One-time data migration from a legacy Prisma/PostgreSQL stack into Driftless (Lucid/PostgreSQL).
 *
 * Usage:
 *   LEGACY_DATABASE_URL=postgresql://... DATABASE_URL=postgresql://... node ace migrate:from-legacy
 *
 * The legacy stack uses ULID string user IDs; Driftless uses integer user IDs. Users are inserted with
 * new IDs and a mapping table is built for role_user / content author_id.
 */
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import pg from 'pg'

type Row = Record<string, unknown>

function jsonText(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value ?? {})
}

export default class MigrateFromLegacy extends BaseCommand {
  static commandName = 'migrate:from-legacy'
  static description = 'Copy PostgreSQL data from a legacy Prisma schema into Driftless'

  static options: CommandOptions = {
    startApp: false,
  }

  private skipped = 0

  async run() {
    const sourceUrl = process.env.LEGACY_DATABASE_URL
    const targetUrl = process.env.DRIFTLESS_DATABASE_URL ?? process.env.DATABASE_URL

    if (!sourceUrl || !targetUrl) {
      this.logger.error('Set LEGACY_DATABASE_URL and DATABASE_URL (or DRIFTLESS_DATABASE_URL)')
      this.exitCode = 1
      return
    }

    const source = new pg.Client({ connectionString: sourceUrl })
    const target = new pg.Client({ connectionString: targetUrl })

    await source.connect()
    await target.connect()

    const userIdMap = new Map<string, number>()

    try {
      await target.query('BEGIN')

      await this.migratePermissions(source, target)
      await this.migrateRoles(source, target)
      await this.migrateUsers(source, target, userIdMap)
      await this.migrateRoleUser(source, target, userIdMap)
      await this.migratePermissionRole(source, target)
      await this.migrateContent(source, target, userIdMap)
      await this.migrateCmsCollections(source, target)
      await this.migrateCmsFields(source, target)
      await this.migrateIntegrationSettings(source, target)

      await target.query('COMMIT')
      this.logger.success(
        `Migration complete (${userIdMap.size} users mapped). Run \`node ace db:seed\` to reconcile native CMS collections.`
      )
      if (this.skipped > 0) {
        this.logger.warning(`Skipped ${this.skipped} row(s) due to mapping or constraint errors`)
      }
    } catch (error) {
      await target.query('ROLLBACK')
      throw error
    } finally {
      await source.end()
      await target.end()
    }
  }

  private async insertRow(
    target: pg.Client,
    table: string,
    row: Row,
    onConflict = 'DO NOTHING'
  ): Promise<boolean> {
    const cols = Object.keys(row)
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
    const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders}) ON CONFLICT ${onConflict}`
    try {
      await target.query(
        sql,
        cols.map((c) => row[c])
      )
      return true
    } catch (error) {
      this.skipped++
      this.logger.warning(`Skipped ${table} row: ${(error as Error).message}`)
      return false
    }
  }

  private async migratePermissions(source: pg.Client, target: pg.Client) {
    const { rows } = await source.query(`SELECT * FROM "Permission"`)
    if (!rows.length) {
      this.logger.info('Skipping empty Permission')
      return
    }

    let count = 0
    for (const row of rows as Row[]) {
      const ok = await this.insertRow(target, 'permissions', {
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        is_system: row.is_system ?? false,
        deleted_at: row.deleted_at ?? null,
        created_at: row.created_at ?? new Date(),
        updated_at: row.updated_at ?? new Date(),
      })
      if (ok) count++
    }
    this.logger.success(`Migrated ${count}/${rows.length} permissions`)
  }

  private async migrateRoles(source: pg.Client, target: pg.Client) {
    const { rows } = await source.query(`SELECT * FROM "Role"`)
    if (!rows.length) {
      this.logger.info('Skipping empty Role')
      return
    }

    let count = 0
    for (const row of rows as Row[]) {
      const ok = await this.insertRow(target, 'roles', {
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        is_system: row.is_system ?? false,
        deleted_at: row.deleted_at ?? null,
        created_at: row.created_at ?? new Date(),
        updated_at: row.updated_at ?? new Date(),
      })
      if (ok) count++
    }
    this.logger.success(`Migrated ${count}/${rows.length} roles`)
  }

  private async migrateUsers(source: pg.Client, target: pg.Client, userIdMap: Map<string, number>) {
    const { rows } = await source.query(`SELECT * FROM "User"`)
    if (!rows.length) {
      this.logger.info('Skipping empty User')
      return
    }

    let count = 0
    for (const row of rows as Row[]) {
      const password = row.password_hash ?? row.password
      if (!password) {
        this.skipped++
        this.logger.warning(`Skipped user ${row.email}: no password_hash`)
        continue
      }

      const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || null

      try {
        const result = await target.query(
          `INSERT INTO "users" (
            email, username, first_name, last_name, full_name, phone, address,
            email_verified_at, status, password, google_sub, deleted_at, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT (email) DO NOTHING
          RETURNING id`,
          [
            row.email,
            row.username,
            row.first_name,
            row.last_name ?? null,
            fullName,
            row.phone ?? null,
            row.address ?? null,
            row.email_verified_at ?? null,
            row.status ?? 'ACTIVE',
            password,
            row.google_sub ?? null,
            row.deleted_at ?? null,
            row.created_at ?? new Date(),
            row.updated_at ?? row.created_at ?? new Date(),
          ]
        )

        const newId = result.rows[0]?.id as number | undefined
        if (newId && row.id) {
          userIdMap.set(String(row.id), newId)
          count++
        } else if (!newId) {
          const existing = await target.query(`SELECT id FROM "users" WHERE email = $1 LIMIT 1`, [
            row.email,
          ])
          const existingId = existing.rows[0]?.id as number | undefined
          if (existingId && row.id) {
            userIdMap.set(String(row.id), existingId)
          }
        }
      } catch (error) {
        this.skipped++
        this.logger.warning(`Skipped user ${row.email}: ${(error as Error).message}`)
      }
    }
    this.logger.success(`Migrated ${count}/${rows.length} users (${userIdMap.size} ID mappings)`)
  }

  private async migrateRoleUser(
    source: pg.Client,
    target: pg.Client,
    userIdMap: Map<string, number>
  ) {
    const { rows } = await source.query(`SELECT "A" AS role_id, "B" AS user_id FROM "_RoleToUser"`)
    if (!rows.length) return

    let count = 0
    for (const row of rows as Row[]) {
      const userId = userIdMap.get(String(row.user_id))
      if (!userId) {
        this.skipped++
        continue
      }
      const ok = await this.insertRow(target, 'role_user', {
        role_id: row.role_id,
        user_id: userId,
      })
      if (ok) count++
    }
    this.logger.success(`Migrated ${count}/${rows.length} role_user rows`)
  }

  private async migratePermissionRole(source: pg.Client, target: pg.Client) {
    const { rows } = await source.query(
      `SELECT "A" AS permission_id, "B" AS role_id FROM "_PermissionToRole"`
    )
    if (!rows.length) return

    let count = 0
    for (const row of rows as Row[]) {
      const ok = await this.insertRow(target, 'permission_role', {
        permission_id: row.permission_id,
        role_id: row.role_id,
      })
      if (ok) count++
    }
    this.logger.success(`Migrated ${count}/${rows.length} permission_role rows`)
  }

  private async migrateContent(
    source: pg.Client,
    target: pg.Client,
    userIdMap: Map<string, number>
  ) {
    const { rows } = await source.query(`SELECT * FROM "Content"`)
    if (!rows.length) {
      this.logger.info('Skipping empty Content')
      return
    }

    let count = 0
    for (const row of rows as Row[]) {
      const authorId = userIdMap.get(String(row.authorId ?? row.author_id)) ?? null
      const ok = await this.insertRow(target, 'contents', {
        id: row.id,
        title: row.title,
        slug: row.slug,
        body: row.body ?? '',
        status: row.status ?? 'DRAFT',
        author_id: authorId,
        deleted_at: row.deleted_at ?? row.deletedAt ?? null,
        created_at: row.createdAt ?? row.created_at ?? new Date(),
        updated_at: row.updatedAt ?? row.updated_at ?? new Date(),
      })
      if (ok) count++
    }
    this.logger.success(`Migrated ${count}/${rows.length} content rows`)
  }

  private async migrateCmsCollections(source: pg.Client, target: pg.Client) {
    const { rows } = await source.query(`SELECT * FROM "cms_collection"`)
    if (!rows.length) {
      this.logger.info('Skipping empty cms_collection')
      return
    }

    let count = 0
    for (const row of rows as Row[]) {
      const ok = await this.insertRow(target, 'cms_collections', {
        id: row.id,
        key: row.key,
        label: row.label,
        icon: row.icon ?? null,
        group: row.group ?? null,
        source: row.source ?? 'DYNAMIC',
        model_name: row.model_name ?? null,
        table_name: row.table_name ?? null,
        list_config: jsonText(row.list_config),
        revisions_on: row.revisions_on ?? true,
        drafts_on: row.drafts_on ?? true,
        deleted_at: row.deleted_at ?? null,
        created_at: row.created_at ?? new Date(),
        updated_at: row.updated_at ?? new Date(),
      })
      if (ok) count++
    }
    this.logger.success(`Migrated ${count}/${rows.length} cms_collections`)
  }

  private async migrateCmsFields(source: pg.Client, target: pg.Client) {
    const { rows } = await source.query(`SELECT * FROM "cms_field"`)
    if (!rows.length) {
      this.logger.info('Skipping empty cms_field')
      return
    }

    let count = 0
    for (const row of rows as Row[]) {
      const ok = await this.insertRow(target, 'cms_fields', {
        id: row.id,
        collection_id: row.collection_id,
        key: row.key,
        label: row.label,
        type: row.type,
        required: row.required ?? false,
        unique: row.unique ?? false,
        order: row.order ?? 0,
        config: jsonText(row.config),
        deleted_at: row.deleted_at ?? null,
        created_at: row.created_at ?? new Date(),
        updated_at: row.updated_at ?? new Date(),
      })
      if (ok) count++
    }
    this.logger.success(`Migrated ${count}/${rows.length} cms_fields`)
  }

  private async migrateIntegrationSettings(source: pg.Client, target: pg.Client) {
    const { rows } = await source.query(`SELECT * FROM "integration_settings"`)
    if (!rows.length) {
      this.logger.info('Skipping empty integration_settings')
      return
    }

    let count = 0
    for (const row of rows as Row[]) {
      const ok = await this.insertRow(target, 'integration_settings', {
        id: row.id ?? 'default',
        google_auth_enabled: row.google_auth_enabled ?? false,
        google_client_id: row.google_client_id ?? null,
        google_client_secret_enc: row.google_client_secret_enc ?? null,
        captcha_enabled: row.captcha_enabled ?? false,
        captcha_provider: row.captcha_provider ?? null,
        captcha_site_key: row.captcha_site_key ?? null,
        captcha_secret_enc: row.captcha_secret_enc ?? null,
        captcha_on_login: row.captcha_on_login ?? false,
        captcha_on_register: row.captcha_on_register ?? false,
        ga4_enabled: row.ga4_enabled ?? false,
        ga4_measurement_id: row.ga4_measurement_id ?? null,
        clarity_enabled: row.clarity_enabled ?? false,
        clarity_project_id: row.clarity_project_id ?? null,
        deleted_at: row.deleted_at ?? null,
        updated_at: row.updated_at ?? new Date(),
      })
      if (ok) count++
    }
    this.logger.success(`Migrated ${count}/${rows.length} integration_settings rows`)
  }
}

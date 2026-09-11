import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Permission from '#models/permission'
import Role from '#models/role'
import { newUlid } from '#services/ulid_service'
import { emptyReport, type DataSection } from '../registry.js'

/**
 * Core RBAC: users, roles, permissions and their pivots
 * (`permission_role`, `role_user`).
 *
 * The tricky part is two id spaces that must NOT be preserved blindly:
 *
 * - `roles`/`permissions` ids are ULIDs but a freshly-installed target already
 *   seeds the same roles/permissions with *different* ULIDs, so we match by the
 *   natural key (`name`) and reuse the target's id when it already exists.
 * - `users.id` is an INTEGER auto-increment, environment-local by nature. We
 *   never force the old integer id; the DB assigns a fresh one and we remap.
 *
 * Because everything upserts by a natural key (`name` for roles/permissions,
 * `email` for users), this section behaves identically in `preserve` and
 * `regenerate` mode — no ref rewriting is needed. The pivots are rewired purely
 * through the local old→resolved id maps built while importing each table.
 *
 * Secrets never travel: the export is an explicit allowlist of columns, so the
 * TOTP secret (`two_factor_secret_enc`), hashed recovery codes and any reset /
 * remember tokens are simply never read. The password *hash* is kept on
 * purpose (a one-way scrypt digest) and is written with a raw insert/update so
 * the auth model's `beforeSave` hook can't re-hash it.
 */
export const usersSection: DataSection = {
  name: 'users',
  owner: 'core',
  order: 15,
  label: 'Users & roles',
  tables: ['permissions', 'roles', 'users', 'permission_role', 'role_user'],

  async export() {
    const permissions = await db
      .from('permissions')
      .whereNull('deleted_at')
      .select('id', 'name', 'description', 'is_system')

    const roles = await db
      .from('roles')
      .whereNull('deleted_at')
      .select('id', 'name', 'description', 'is_system')

    const userRows = await db.from('users').whereNull('deleted_at')
    const users = userRows.map((u) => ({
      // The original integer id — kept ONLY so `role_user` can be remapped on
      // import. It is never used as the restored user's id.
      oldId: u.id,
      email: u.email,
      password: u.password, // one-way hash — kept per product decision
      fullName: u.full_name ?? null,
      username: u.username ?? null,
      firstName: u.first_name ?? null,
      lastName: u.last_name ?? null,
      phone: u.phone ?? null,
      address: u.address ?? null,
      status: u.status ?? 'ACTIVE',
      googleSub: u.google_sub ?? null,
      emailVerifiedAt: u.email_verified_at ?? null,
    }))

    const permissionRole = await db.from('permission_role').select('permission_id', 'role_id')
    const roleUser = await db.from('role_user').select('role_id', 'user_id')

    return { permissions, roles, users, permission_role: permissionRole, role_user: roleUser }
  },

  async import(ctx, data) {
    const report = emptyReport('users')
    const payload = (data ?? {}) as {
      permissions?: Array<{
        id?: string
        name: string
        description?: string | null
        is_system?: boolean
      }>
      roles?: Array<{ id?: string; name: string; description?: string | null; is_system?: boolean }>
      users?: Array<{
        oldId?: number | string
        email: string
        password?: string
        fullName?: string | null
        username?: string | null
        firstName?: string | null
        lastName?: string | null
        phone?: string | null
        address?: string | null
        status?: string
        googleSub?: string | null
        emailVerifiedAt?: string | null
      }>
      permission_role?: Array<{ permission_id: string; role_id: string }>
      role_user?: Array<{ role_id: string; user_id: number | string }>
    }

    // old id -> resolved id in the target install.
    const permMap = new Map<string, string>()
    const roleMap = new Map<string, string>()
    const userMap = new Map<string, number>()

    // 1) permissions — upsert by natural key `name`.
    for (const p of payload.permissions ?? []) {
      const oldId = String(p.id ?? '')
      try {
        const existing = await Permission.query().where('name', p.name).first()
        if (existing) {
          if (oldId) permMap.set(oldId, existing.id)
          report.skipped++
          continue
        }
        // Preserve the ULID unless it already belongs to a different row.
        const idTaken = p.id ? await Permission.query().where('id', p.id).first() : null
        const id = p.id && !idTaken ? p.id : newUlid()
        await Permission.create({
          id,
          name: p.name,
          description: p.description ?? null,
          isSystem: !!p.is_system,
        })
        if (oldId) permMap.set(oldId, id)
        report.created++
      } catch (e) {
        report.warnings.push(`permission "${p.name}": ${(e as Error).message}`)
      }
    }

    // 2) roles — upsert by natural key `name`.
    for (const r of payload.roles ?? []) {
      const oldId = String(r.id ?? '')
      try {
        const existing = await Role.query().where('name', r.name).first()
        if (existing) {
          if (oldId) roleMap.set(oldId, existing.id)
          report.skipped++
          continue
        }
        const idTaken = r.id ? await Role.query().where('id', r.id).first() : null
        const id = r.id && !idTaken ? r.id : newUlid()
        await Role.create({
          id,
          name: r.name,
          description: r.description ?? null,
          isSystem: !!r.is_system,
        })
        if (oldId) roleMap.set(oldId, id)
        report.created++
      } catch (e) {
        report.warnings.push(`role "${r.name}": ${(e as Error).message}`)
      }
    }

    // 3) users — upsert by natural key `email`. Raw SQL so the password hash is
    // stored verbatim (the auth model would otherwise re-hash it on save).
    for (const u of payload.users ?? []) {
      const oldId = u.oldId !== null && u.oldId !== undefined ? String(u.oldId) : ''
      try {
        const existing = await db.from('users').where('email', u.email).select('id').first()
        if (existing) {
          const resolvedId = Number(existing.id)
          if (oldId) userMap.set(oldId, resolvedId)
          if (ctx.conflict === 'skip') {
            report.skipped++
            continue
          }
          await db
            .from('users')
            .where('id', resolvedId)
            .update({
              password: String(u.password ?? ''),
              full_name: u.fullName ?? null,
              username: u.username ?? null,
              first_name: u.firstName ?? null,
              last_name: u.lastName ?? null,
              phone: u.phone ?? null,
              address: u.address ?? null,
              status: u.status ?? 'ACTIVE',
              google_sub: u.googleSub ?? null,
              email_verified_at: u.emailVerifiedAt ?? null,
              updated_at: DateTime.now().toSQL(),
            })
          report.updated++
          continue
        }

        const now = DateTime.now().toSQL()
        await db.table('users').insert({
          email: u.email,
          password: String(u.password ?? ''),
          full_name: u.fullName ?? null,
          username: u.username ?? null,
          first_name: u.firstName ?? null,
          last_name: u.lastName ?? null,
          phone: u.phone ?? null,
          address: u.address ?? null,
          status: u.status ?? 'ACTIVE',
          google_sub: u.googleSub ?? null,
          email_verified_at: u.emailVerifiedAt ?? null,
          created_at: now,
          updated_at: now,
        })
        // The DB assigned a fresh integer id — read it back to remap the pivot.
        const created = await db.from('users').where('email', u.email).select('id').first()
        if (created && oldId) userMap.set(oldId, Number(created.id))
        report.created++
      } catch (e) {
        report.warnings.push(`user "${u.email}": ${(e as Error).message}`)
      }
    }

    // 4) permission_role — wire with the resolved ULIDs, one row at a time.
    for (const link of payload.permission_role ?? []) {
      const permissionId = permMap.get(String(link.permission_id))
      const roleId = roleMap.get(String(link.role_id))
      if (!permissionId || !roleId) continue // an endpoint didn't resolve — skip
      try {
        const present = await db
          .from('permission_role')
          .where({ permission_id: permissionId, role_id: roleId })
          .first()
        if (present) continue
        await db.table('permission_role').insert({ permission_id: permissionId, role_id: roleId })
        report.created++
      } catch (e) {
        report.warnings.push(`permission_role link: ${(e as Error).message}`)
      }
    }

    // 5) role_user — resolved role ULID + resolved integer user id.
    for (const link of payload.role_user ?? []) {
      const roleId = roleMap.get(String(link.role_id))
      const userId = userMap.get(String(link.user_id))
      if (!roleId || userId === null || userId === undefined) continue
      try {
        const present = await db
          .from('role_user')
          .where({ role_id: roleId, user_id: userId })
          .first()
        if (present) continue
        await db.table('role_user').insert({ role_id: roleId, user_id: userId })
        report.created++
      } catch (e) {
        report.warnings.push(`role_user link: ${(e as Error).message}`)
      }
    }

    return report
  },
}

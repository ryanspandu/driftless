import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import SchemaInstallerService from '#services/schema_installer_service'
import ModulesService from '#services/modules_service'
import AuditLogService from '#services/audit_log_service'
import PublicError from '#exceptions/public_error'
import type User from '#models/user'

const installValidator = vine.compile(
  vine.object({
    /** Refuse unless this module actually has a pending migration. */
    expectOwner: vine.string().trim().maxLength(64).optional(),
  })
)

const uninstallValidator = vine.compile(
  vine.object({
    /**
     * The operator must type the module name. Not security — they already hold
     * `module:uninstall` — but a deliberate speed bump in front of an
     * irreversible drop.
     */
    confirm: vine.string().trim(),
  })
)

const installer = new SchemaInstallerService()
const modules = new ModulesService()
const audit = new AuditLogService()

export default class SchemaController {
  /**
   * Migrations that have not run yet, grouped so the confirmation dialog can
   * show exactly what an install will apply.
   *
   * This matters because Lucid cannot scope a run to one module: pressing
   * install applies *every* pending migration, including unrelated core ones.
   * Showing the list is what turns that from a surprise into a decision.
   */
  async pending({ response }: HttpContext) {
    const pending = await installer.pending()
    return response.json({
      total: pending.length,
      migrations: pending,
    })
  }

  async install(ctx: HttpContext) {
    const { request, response, auth } = ctx
    const { expectOwner } = await request.validateUsing(installValidator)

    try {
      const result = await installer.install({ expectOwner })

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'schema.installed',
        subjectType: 'database',
        subjectId: expectOwner ?? 'all',
        changes: { applied: result.applied, durationMs: result.durationMs },
        ctx,
      })

      return response.json(result)
    } catch (error) {
      const { status, body } = PublicError.toResponse(error)
      if (status === 500 && !PublicError.is(error)) {
        // Not one of ours — do not echo it. Report it and return a generic body.
        console.error('[schema] install failed', error)
      }
      return response.status(status).json(body)
    }
  }

  /**
   * Drop a module's tables and delete its data. Irreversible.
   *
   * Guarded four ways: the `module:uninstall` permission (SUPERADMIN only by
   * default), a typed confirmation, the module's own `canUninstall()` veto, and
   * the requirement that the manifest declares its tables at all.
   */
  async uninstallModule(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    const name = String(params.name)
    const { confirm } = await request.validateUsing(uninstallValidator)

    if (confirm !== name) {
      return response.status(422).json({
        message: `Type "${name}" to confirm.`,
        reason: 'confirmation_mismatch',
      })
    }

    const verdict = await modules.canUninstall(name)
    if (!verdict.ok) {
      return response.status(422).json({
        message: verdict.reason ?? 'This module cannot be uninstalled right now.',
        reason: 'uninstall_refused',
      })
    }

    const tables = modules.tablesFor(name)

    // Record the intent *before* dropping anything: if the drop takes the data,
    // the audit row is the only thing left that says it happened.
    await audit.record({
      actor: { type: 'user', user: auth.user as User },
      action: 'schema.uninstall_started',
      subjectType: 'module',
      subjectId: name,
      changes: { tables },
      ctx,
    })

    try {
      // Disable first so no request can reach a half-dropped module.
      await modules.setEnabled(name, false)

      const result = await installer.uninstall({ name, tables })

      // Revoke the module's RBAC permissions, matching the CLI uninstall path
      // (`commands/modules_uninstall.ts`). `revokePermissions` only removes codes
      // no other module still claims, so shared permissions are left intact.
      const revokedPermissions = await modules.revokePermissions(name)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'schema.uninstalled',
        subjectType: 'module',
        subjectId: name,
        changes: { ...result, revokedPermissions },
        ctx,
      })

      return response.json(result)
    } catch (error) {
      const { status, body } = PublicError.toResponse(error)
      if (!PublicError.is(error)) console.error('[schema] uninstall failed', error)
      return response.status(status).json(body)
    }
  }
}

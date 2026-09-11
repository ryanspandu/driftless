import type { HttpContext } from '@adonisjs/core/http'
import ModulesService from '#services/modules_service'
import SchemaInstallerService from '#services/schema_installer_service'
import AuditLogService from '#services/audit_log_service'
import { getModule } from '#modules/registry'
import type User from '#models/user'

const modulesService = new ModulesService()
const installer = new SchemaInstallerService()
const audit = new AuditLogService()

export default class ModulesController {
  /** Full module list with enabled state — drives the Settings panel toggle. */
  async index({ response }: HttpContext) {
    const modules = await modulesService.list()
    return response.json(modules)
  }

  /** Enabled modules' sidebar nav groups (any admin, no module:manage needed). */
  async menu({ response }: HttpContext) {
    const items = await modulesService.enabledMenu()
    return response.json(items)
  }

  /** Enable / disable a module at runtime (no restart). */
  async toggle(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    const name = String(params.name)
    const enabled = request.input('enabled')

    if (typeof enabled !== 'boolean') {
      return response.status(422).json({ message: '`enabled` must be a boolean.' })
    }

    /**
     * Unknown module is the only genuine 404 here.
     *
     * This used to be a blanket `catch` that turned *every* failure — a dropped
     * database connection, a constraint violation — into a 404, and the client
     * renders nothing for it. Any real problem was therefore completely silent:
     * the switch just snapped back.
     */
    const manifest = getModule(name)
    if (!manifest) {
      return response.status(404).json({ message: `Unknown module: ${name}` })
    }

    /**
     * Refuse to enable a module whose tables do not exist.
     *
     * Enabling it anyway "worked" — the sidebar entry appeared and the page
     * rendered — right up until the first API call failed on a missing
     * relation, with nothing in the UI to explain why. The client is expected
     * to install first; this is the backstop for anything that skips that.
     */
    if (enabled) {
      const ready = await installer.tablesReady(manifest.tables ?? [])
      if (!ready) {
        return response.status(409).json({
          message: `${manifest.label} needs its database tables installed first.`,
          reason: 'schema_not_ready',
        })
      }
    }

    const mod = await modulesService.setEnabled(name, enabled)

    await audit.record({
      actor: { type: 'user', user: auth.user as User },
      action: enabled ? 'module.enabled' : 'module.disabled',
      subjectType: 'module',
      subjectId: name,
      ctx,
    })

    return response.json(mod)
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import ModuleInstallJob from '#models/module_install_job'
import ModuleInstallJobService from '#services/module_install_job_service'
import { apiFail } from '#helpers/api_error_response'
import { deploymentInfo } from '#services/supervisor'
import { getModule } from '#modules/registry'

/**
 * Module folder names.
 *
 * Validated for shape here and then **resolved through the on-disk allow-list**
 * in the service — the resolved value, an element of `readdirSync`'s output, is
 * what reaches `spawn`. The regex is the first gate, not the only one.
 */
const nameValidator = vine.compile(
  vine.object({
    name: vine
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  })
)

const jobs = new ModuleInstallJobService()

/** What the client needs; never the internal error text or the pid. */
function toDto(job: ModuleInstallJob) {
  return {
    id: job.id,
    module: job.moduleName,
    state: job.state,
    step: job.step,
    requiresBuild: job.requiresBuild,
    requiresRestart: job.requiresRestart,
    restartKind: job.restartKind,
    appliedMigrations: job.appliedMigrations,
    errorReason: job.errorReason,
    errorMessage: job.errorMessage,
    logTail: job.logTail,
    startedAt: job.startedAt?.toISO() ?? null,
    finishedAt: job.finishedAt?.toISO() ?? null,
  }
}

export default class ModuleInstallController {
  /**
   * How this deployment restarts, so the install dialog can tell the operator
   * what pressing the button will do to their visitors.
   *
   * Separate from `/api/admin/health` deliberately: health answers **503** when
   * the built assets are stale, and that is exactly the moment someone opens
   * this dialog. A query against a 503 renders nothing.
   */
  async deployment({ response }: HttpContext) {
    return response.json(deploymentInfo())
  }

  /**
   * Module folders present on disk.
   *
   * Includes folders this process never loaded — a package dropped in after
   * boot cannot be in `MODULES` and never will be until a restart. That is the
   * entire case the install button exists for, so it has to be visible.
   *
   * Only the folder name is reported for those. Importing an unknown manifest
   * to read its label would mean executing arbitrary code in the live process
   * with no way to unload it; the folder name is honest and sufficient.
   */
  async detected({ response }: HttpContext) {
    const folders = jobs.detected()

    return response.json({
      modules: folders.map((name) => ({
        name,
        loaded: Boolean(getModule(name)),
        requiresBuild: jobs.requiresBuild(name),
      })),
    })
  }

  async install(ctx: HttpContext) {
    const { params, response, auth, request } = ctx

    try {
      const { name } = await nameValidator.validate({ name: params.name })

      const started = await jobs.start({
        module: name,
        userId: (auth.user as { id?: number } | undefined)?.id ?? null,
        requestId: request.id() ?? null,
      })

      return response.status(202).json(started)
    } catch (error) {
      return apiFail(response, error, 'module-install')
    }
  }

  /**
   * The job to display: the active one, or a recently finished one.
   *
   * Because at most one job can be active, "latest" is unambiguous — which is
   * what makes an install result survive a page reload, a different tab, or a
   * different admin looking at the same screen.
   */
  async latest({ response }: HttpContext) {
    const job = await jobs.latest()
    return response.json({ job: job ? toDto(job) : null })
  }

  async show({ params, response }: HttpContext) {
    const job = await ModuleInstallJob.find(String(params.id))
    if (!job) return response.status(404).json({ message: 'No such job.', reason: 'not_found' })

    return response.json({ job: toDto(job) })
  }
}

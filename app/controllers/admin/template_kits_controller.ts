import type { HttpContext } from '@adonisjs/core/http'
import { readFile } from 'node:fs/promises'
import TemplateKitsService from '#services/template_kits_service'

const service = new TemplateKitsService()

/**
 * Custom-code template-kit manager. Import installs executable code, so every
 * route here is gated on the highest privilege (see `start/routes.ts`).
 */
export default class TemplateKitsController {
  async page({ inertia }: HttpContext) {
    return inertia.render('admin/template-kits/index', {})
  }

  async list({ response }: HttpContext) {
    return response.json({ items: service.list() })
  }

  async exportOne({ params, response }: HttpContext) {
    try {
      const buffer = await service.exportKit(params.id)
      return response
        .header('Content-Type', 'application/gzip')
        .header('Content-Disposition', `attachment; filename="${params.id}.tar.gz"`)
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .send(buffer)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async importOne({ request, response }: HttpContext) {
    const file = request.file('archive', { size: '20mb' })
    if (!file || !file.tmpPath) {
      return response.status(422).json({ message: 'An `archive` file is required' })
    }
    const buffer = await readFile(file.tmpPath)
    const name = request.input('name')
    try {
      const result = await service.importKit(buffer, typeof name === 'string' ? name : undefined)
      return response.status(201).json({ ...result, rebuildRequired: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }
}

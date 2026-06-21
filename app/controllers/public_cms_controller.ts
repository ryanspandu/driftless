import type { HttpContext } from '@adonisjs/core/http'
import CmsService from '#services/cms_service'

const cmsService = new CmsService()

/** Public, read-only access to PUBLISHED records of a CMS collection. */
export default class PublicCmsController {
  async records({ params, request, response }: HttpContext) {
    const limitRaw = request.qs().limit
    const pageSize =
      limitRaw !== undefined && limitRaw !== '' ? Math.min(Math.max(Number(limitRaw) || 12, 1), 100) : 12

    try {
      const result = await cmsService.listRecords(params.key, { pageSize, status: 'PUBLISHED' })
      return response.json({ items: result.items, total: result.total })
    } catch {
      return response.notFound({ message: 'Collection not found' })
    }
  }

  async record({ params, response }: HttpContext) {
    try {
      const record = await cmsService.findRecord(params.key, params.id)
      if (record.status !== 'PUBLISHED') {
        return response.notFound({ message: 'Record not found' })
      }
      return response.json(record)
    } catch {
      return response.notFound({ message: 'Record not found' })
    }
  }
}

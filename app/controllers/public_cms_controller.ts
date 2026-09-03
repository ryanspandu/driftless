import type { HttpContext } from '@adonisjs/core/http'
import CmsService from '#services/cms_service'

const cmsService = new CmsService()

/** Public, read-only access to PUBLISHED records of a CMS collection. */
export default class PublicCmsController {
  async records({ params, request, response }: HttpContext) {
    const qs = request.qs()
    const limitRaw = qs.limit
    const pageSize =
      limitRaw !== undefined && limitRaw !== ''
        ? Math.min(Math.max(Number(limitRaw) || 12, 1), 100)
        : 12
    const page = qs.page !== undefined && qs.page !== '' ? Math.max(Number(qs.page) || 1, 1) : 1

    try {
      const result = await cmsService.listRecords(
        params.key,
        {
          pageSize,
          page,
          status: 'PUBLISHED',
          // Server-side shaping for CollectionList (all optional).
          filterField: typeof qs.filterField === 'string' ? qs.filterField : undefined,
          filterValue: typeof qs.filterValue === 'string' ? qs.filterValue : undefined,
          sortField: typeof qs.sortField === 'string' ? qs.sortField : undefined,
          sortDir: qs.sortDir === 'asc' ? 'asc' : qs.sortDir === 'desc' ? 'desc' : undefined,
          search: typeof qs.search === 'string' ? qs.search : undefined,
        },
        // Public render path: show related records' labels, not raw ids.
        { resolveRelations: true }
      )
      return response.json({
        items: result.items,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      })
    } catch {
      return response.notFound({ message: 'Collection not found' })
    }
  }

  async record({ params, response }: HttpContext) {
    try {
      const record = await cmsService.findRecord(params.key, params.id, { resolveRelations: true })
      if (record.status !== 'PUBLISHED') {
        return response.notFound({ message: 'Record not found' })
      }
      return response.json(record)
    } catch {
      return response.notFound({ message: 'Record not found' })
    }
  }
}

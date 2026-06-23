import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import CmsService from '#services/cms_service'

const cmsService = new CmsService()

/**
 * External, token-authenticated v1 CMS records API. Thin wrapper over
 * CmsService — `params.key` is the collection key. The CmsRecordDto returned
 * by the service is the stable external contract.
 */
export default class CmsRecordsController {
  /**
   * @index
   * @summary List CMS records in a collection
   * @description Requires the `cms:read` token ability.
   * @paramPath key - Collection key - @type(string)
   * @paramQuery page - Page number - @type(number)
   * @paramQuery pageSize - Items per page - @type(number)
   * @paramQuery search - Search term - @type(string)
   * @paramQuery status - Filter by status - @enum(DRAFT,PUBLISHED)
   * @responseBody 200 - {"data":[{"id":"string","status":"DRAFT","authorId":"string","data":{},"createdAt":"string","updatedAt":"string"}],"meta":{}} - Paginated records
   * @responseBody 401 - Unauthorized
   * @responseBody 403 - Forbidden
   */
  async index({ params, request, response }: HttpContext) {
    const page = request.input('page')
    const pageSize = request.input('pageSize')
    const search = request.input('search')
    const status = request.input('status')

    const result = await cmsService.listRecords(params.key, {
      page: page !== undefined ? Number(page) : undefined,
      pageSize: pageSize !== undefined ? Number(pageSize) : undefined,
      search,
      status,
    })
    return response.json(result)
  }

  /**
   * @show
   * @summary Get a CMS record by id
   * @paramPath key - Collection key - @type(string)
   * @paramPath id - Record id - @type(string)
   * @responseBody 200 - {"id":"string","status":"DRAFT","authorId":"string","data":{},"createdAt":"string","updatedAt":"string"} - The record
   * @responseBody 404 - Not found
   */
  async show({ params, response }: HttpContext) {
    try {
      const record = await cmsService.findRecord(params.key, params.id)
      return response.json(record)
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  /**
   * @store
   * @summary Create a CMS record
   * @description Requires the `cms:write` token ability. `data` holds the collection's field values.
   * @paramPath key - Collection key - @type(string)
   * @requestBody {"data":{},"status":"DRAFT"}
   * @responseBody 201 - {"id":"string","status":"DRAFT","authorId":"string","data":{},"createdAt":"string","updatedAt":"string"} - Created record
   * @responseBody 422 - Validation error
   */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.user! as User
    const data = request.input('data', {}) as Record<string, unknown>
    const status = request.input('status')
    try {
      const record = await cmsService.createRecord(params.key, user.id, { data, status })
      return response.status(201).json(record)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /**
   * @update
   * @summary Update a CMS record
   * @description Requires the `cms:write` token ability.
   * @paramPath key - Collection key - @type(string)
   * @paramPath id - Record id - @type(string)
   * @requestBody {"data":{},"status":"DRAFT"}
   * @responseBody 200 - {"id":"string","status":"DRAFT","authorId":"string","data":{},"createdAt":"string","updatedAt":"string"} - Updated record
   * @responseBody 422 - Validation error
   */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.user! as User
    const data = request.input('data') as Record<string, unknown> | undefined
    const status = request.input('status')
    try {
      const record = await cmsService.updateRecord(params.key, params.id, user.id, { data, status })
      return response.json(record)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /**
   * @destroy
   * @summary Delete a CMS record
   * @description Requires the `cms:write` token ability.
   * @paramPath key - Collection key - @type(string)
   * @paramPath id - Record id - @type(string)
   * @responseBody 200 - {"success":true} - Deleted
   * @responseBody 422 - Error
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await cmsService.deleteRecord(params.key, params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }
}

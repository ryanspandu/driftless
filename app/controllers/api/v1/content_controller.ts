import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import vine from '@vinejs/vine'
import ContentService from '#services/content_service'

const contentService = new ContentService()

const createContentValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1),
    slug: vine.string().trim().minLength(1),
    body: vine.string(),
    status: vine.enum(['DRAFT', 'PUBLISHED'] as const).optional(),
  })
)

const updateContentValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).optional(),
    slug: vine.string().trim().minLength(1).optional(),
    body: vine.string().optional(),
    status: vine.enum(['DRAFT', 'PUBLISHED'] as const).optional(),
  })
)

/**
 * External, token-authenticated v1 Content API. Thin wrapper over
 * ContentService — the curated DTO it returns is the stable external contract.
 */
export default class ContentController {
  /**
   * @index
   * @summary List content records
   * @description Requires the `content:read` token ability.
   * @responseBody 200 - <Content[]> - Content records
   * @responseBody 401 - Unauthorized (missing or invalid token)
   * @responseBody 403 - Forbidden (token lacks ability or owner lacks permission)
   */
  async index({ response }: HttpContext) {
    const items = await contentService.findAll()
    return response.json(items)
  }

  /**
   * @show
   * @summary Get a content record by id
   * @paramPath id - Content record id - @type(string)
   * @responseBody 200 - <Content> - The content record
   * @responseBody 404 - Not found
   */
  async show({ params, response }: HttpContext) {
    const item = await contentService.findOne(params.id)
    return response.json(item)
  }

  /**
   * @store
   * @summary Create a content record
   * @description Requires the `content:write` token ability.
   * @requestBody {"title":"string","slug":"string","body":"string","status":"DRAFT"}
   * @responseBody 201 - <Content> - Created content record
   * @responseBody 422 - Validation error
   */
  async store({ request, auth, response }: HttpContext) {
    const user = auth.user! as User
    const payload = await request.validateUsing(createContentValidator)
    try {
      const item = await contentService.create(user.id, {
        title: payload.title,
        slug: payload.slug,
        body: payload.body,
        status: payload.status ?? 'DRAFT',
      })
      return response.status(201).json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /**
   * @update
   * @summary Update a content record
   * @description Requires the `content:write` token ability.
   * @paramPath id - Content record id - @type(string)
   * @requestBody {"title":"string","slug":"string","body":"string","status":"DRAFT"}
   * @responseBody 200 - <Content> - Updated content record
   * @responseBody 422 - Validation error
   */
  async update({ params, request, response }: HttpContext) {
    const payload = await request.validateUsing(updateContentValidator)
    try {
      const item = await contentService.update(params.id, payload)
      return response.json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /**
   * @destroy
   * @summary Delete a content record
   * @description Requires the `content:write` token ability.
   * @paramPath id - Content record id - @type(string)
   * @responseBody 200 - {"success":true} - Deleted
   * @responseBody 422 - Error
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await contentService.remove(params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }
}

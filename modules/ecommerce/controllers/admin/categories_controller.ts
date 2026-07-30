import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { apiFail } from '#helpers/api_error_response'
import AuditLogService from '#services/audit_log_service'
import type User from '#models/user'
import CatalogService from '#modules/ecommerce/services/catalog_service'

const createValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(160),
    slug: vine.string().trim().maxLength(160).optional(),
    description: vine.string().trim().maxLength(2_000).nullable().optional(),
    imageUrl: vine.string().trim().maxLength(1024).nullable().optional(),
    parentId: vine.string().trim().nullable().optional(),
    position: vine.number().withoutDecimals().optional(),
  })
)

const updateValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(160).optional(),
    slug: vine.string().trim().maxLength(160).optional(),
    description: vine.string().trim().maxLength(2_000).nullable().optional(),
    imageUrl: vine.string().trim().maxLength(1024).nullable().optional(),
    parentId: vine.string().trim().nullable().optional(),
    position: vine.number().withoutDecimals().optional(),
  })
)

const catalog = new CatalogService()
const audit = new AuditLogService()

const fail = (response: HttpContext['response'], error: unknown) =>
  apiFail(response, error, 'ecommerce/categories')

export default class CategoriesController {
  async index({ response }: HttpContext) {
    return response.json(await catalog.listCategories())
  }

  async store(ctx: HttpContext) {
    const { request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(createValidator)
      const category = await catalog.createCategory(payload)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'category.created',
        subjectType: 'category',
        subjectId: category.id,
        changes: { name: category.name, slug: category.slug },
        ctx,
      })

      return response.status(201).json(category)
    } catch (error) {
      return fail(response, error)
    }
  }

  async update(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(updateValidator)
      const category = await catalog.updateCategory(String(params.id), payload)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'category.updated',
        subjectType: 'category',
        subjectId: category.id,
        changes: payload,
        ctx,
      })

      return response.json(category)
    } catch (error) {
      return fail(response, error)
    }
  }

  async destroy(ctx: HttpContext) {
    const { params, response, auth } = ctx
    try {
      const id = String(params.id)
      await catalog.removeCategory(id)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'category.deleted',
        subjectType: 'category',
        subjectId: id,
        ctx,
      })

      return response.status(204).send('')
    } catch (error) {
      return fail(response, error)
    }
  }
}

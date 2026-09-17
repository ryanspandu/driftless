import type { HttpContext } from '@adonisjs/core/http'
import { apiFail } from '#helpers/api_error_response'
import AuditLogService from '#services/audit_log_service'
import type User from '#models/user'
import CatalogService from '#modules/ecommerce/services/catalog_service'
import {
  createTagValidator as createValidator,
  updateTagValidator as updateValidator,
} from '#modules/ecommerce/validators/catalog'

const catalog = new CatalogService()
const audit = new AuditLogService()

const fail = (response: HttpContext['response'], error: unknown) =>
  apiFail(response, error, 'ecommerce/tags')

export default class TagsController {
  async index({ response }: HttpContext) {
    return response.json(await catalog.listTags())
  }

  async store(ctx: HttpContext) {
    const { request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(createValidator)
      const tag = await catalog.createTag(payload)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'tag.created',
        subjectType: 'tag',
        subjectId: tag.id,
        changes: { name: tag.name, slug: tag.slug },
        ctx,
      })

      return response.status(201).json(tag)
    } catch (error) {
      return fail(response, error)
    }
  }

  async update(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(updateValidator)
      const tag = await catalog.updateTag(String(params.id), payload)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'tag.updated',
        subjectType: 'tag',
        subjectId: tag.id,
        changes: payload,
        ctx,
      })

      return response.json(tag)
    } catch (error) {
      return fail(response, error)
    }
  }

  async destroy(ctx: HttpContext) {
    const { params, response, auth } = ctx
    try {
      const id = String(params.id)
      await catalog.removeTag(id)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'tag.deleted',
        subjectType: 'tag',
        subjectId: id,
        ctx,
      })

      return response.status(204).send('')
    } catch (error) {
      return fail(response, error)
    }
  }

  async trash({ response }: HttpContext) {
    return response.json(await catalog.findTrashedTags())
  }

  async restore(ctx: HttpContext) {
    const { params, response, auth } = ctx
    try {
      const id = String(params.id)
      const tag = await catalog.restoreTag(id)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'tag.updated',
        subjectType: 'tag',
        subjectId: id,
        changes: { restored: true },
        ctx,
      })

      return response.json(tag)
    } catch (error) {
      return fail(response, error)
    }
  }

  async forceDestroy(ctx: HttpContext) {
    const { params, response, auth } = ctx
    try {
      const id = String(params.id)
      await catalog.forceDeleteTag(id)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'tag.deleted',
        subjectType: 'tag',
        subjectId: id,
        changes: { permanent: true },
        ctx,
      })

      return response.json({ success: true })
    } catch (error) {
      return fail(response, error)
    }
  }
}

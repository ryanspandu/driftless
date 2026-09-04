import type { HttpContext } from '@adonisjs/core/http'
import TemplatesService from '#services/templates_service'
import { validatePuckDocument } from '#modules/mcp/services/puck_content_validator'

const templates = new TemplatesService()

/** Which catalog a template's blocks are checked against, by template type. */
function targetForType(type: unknown): 'page' | 'email' | 'collection' {
  if (type === 'EMAIL') return 'email'
  if (type === 'COLLECTION') return 'collection'
  return 'page'
}

/**
 * Builder-API surface for reusable templates (HEADER/FOOTER/LAYOUT/COMPONENT/
 * EMAIL/COLLECTION). Thin over `TemplatesService`; content is structurally
 * validated against the catalog for the template's type.
 */
export default class BuilderTemplatesController {
  async index({ request, response }: HttpContext) {
    const type = request.input('type')
    return response.json(await templates.list(type))
  }

  async show({ params, response }: HttpContext) {
    try {
      return response.json(await templates.find(params.id))
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  async store({ request, response }: HttpContext) {
    const dto = request.only([
      'name',
      'type',
      'content',
      'isDefault',
      'collectionKey',
    ]) as Parameters<TemplatesService['create']>[0]
    if (dto.content !== undefined) {
      const check = await validatePuckDocument(dto.content, targetForType(dto.type))
      if (!check.valid)
        return response
          .status(422)
          .json({ message: 'Invalid template content', issues: check.issues })
      dto.content = check.normalized
    }
    try {
      return response.status(201).json(await templates.create(dto))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, response }: HttpContext) {
    const dto = request.only([
      'name',
      'content',
      'isDefault',
      'collectionKey',
      'renderedHtml',
    ]) as Parameters<TemplatesService['update']>[1]
    if (dto.content !== undefined) {
      // The existing row's type decides which catalog applies.
      let type: unknown = 'HEADER'
      try {
        const existing = await templates.find(params.id)
        type = existing.type
      } catch {
        return response.status(404).json({ message: 'Template not found' })
      }
      const check = await validatePuckDocument(dto.content, targetForType(type))
      if (!check.valid)
        return response
          .status(422)
          .json({ message: 'Invalid template content', issues: check.issues })
      dto.content = check.normalized
    }
    try {
      return response.json(await templates.update(params.id, dto))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ params, response }: HttpContext) {
    try {
      await templates.remove(params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async setDefault({ params, response }: HttpContext) {
    try {
      return response.json(await templates.setDefault(params.id))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import TemplatesService from '#services/templates_service'
import {
  validatePuckDocument,
  type ValidationResult,
} from '#modules/mcp/services/puck_content_validator'

const templates = new TemplatesService()

/** Add the validator's non-blocking advisories to a write response (flat). */
function withAdvisories<T extends object>(entity: T, check?: ValidationResult): T {
  if (!check) return entity
  const extra: Record<string, unknown> = {}
  if (check.warnings.length) extra.warnings = check.warnings
  if (check.changes.length) extra.changes = check.changes
  return Object.keys(extra).length ? ({ ...entity, ...extra } as T) : entity
}

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

  /**
   * Section presets = the reusable COMPONENT templates, the library insert_section
   * clones into a page. Seeded starter sections plus any COMPONENT the operator
   * saved. Returns summaries (id + name); call get_template to inspect the tree.
   */
  async sectionPresets({ response }: HttpContext) {
    return response.json(await templates.list('COMPONENT'))
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
    let check: ValidationResult | undefined
    if (dto.content !== undefined) {
      check = await validatePuckDocument(dto.content, targetForType(dto.type))
      if (!check.valid)
        return response
          .status(422)
          .json({ message: 'Invalid template content', issues: check.issues })
      dto.content = check.normalized
    }
    try {
      return response.status(201).json(withAdvisories(await templates.create(dto), check))
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
      try {
        return response.json(withAdvisories(await templates.update(params.id, dto), check))
      } catch (e) {
        return response.status(422).json({ message: (e as Error).message })
      }
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

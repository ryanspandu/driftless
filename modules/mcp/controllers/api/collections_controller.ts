import type { HttpContext } from '@adonisjs/core/http'
import CmsService from '#services/cms_service'

const cms = new CmsService()

/**
 * Builder-API surface for collections + fields (schema/DDL). Thin wrapper over
 * `CmsService`, which is the validation authority — every guard, key check and
 * table migration lives there. Gated by `cms:manage` (RBAC) ∩ `builder:*`
 * token abilities at the route layer.
 */
export default class BuilderCollectionsController {
  async index({ response }: HttpContext) {
    return response.json(await cms.listCollections())
  }

  async show({ params, response }: HttpContext) {
    try {
      return response.json(await cms.findCollection(params.key))
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  async store({ request, response }: HttpContext) {
    const dto = request.only([
      'key',
      'label',
      'icon',
      'group',
      'revisionsOn',
      'draftsOn',
      'kind',
      'fields',
    ]) as Parameters<CmsService['createCollection']>[0]
    try {
      return response.status(201).json(await cms.createCollection(dto))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, response }: HttpContext) {
    const dto = request.only(['label', 'icon', 'group', 'revisionsOn', 'draftsOn', 'kind'])
    try {
      return response.json(await cms.updateCollection(params.key, dto))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ params, response }: HttpContext) {
    try {
      await cms.deleteCollection(params.key)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async addField({ params, request, response }: HttpContext) {
    const dto = request.only([
      'key',
      'label',
      'type',
      'required',
      'unique',
      'config',
    ]) as Parameters<CmsService['addField']>[1]
    try {
      return response.status(201).json(await cms.addField(params.key, dto))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async updateField({ params, request, response }: HttpContext) {
    const dto = request.only(['label', 'config'])
    try {
      return response.json(await cms.updateField(params.key, params.field, dto))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async deleteField({ params, response }: HttpContext) {
    try {
      await cms.deleteField(params.key, params.field)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async reorderFields({ params, request, response }: HttpContext) {
    const order = request.input('fieldKeys')
    if (!Array.isArray(order)) {
      return response.status(422).json({ message: '`fieldKeys` must be an array of field keys' })
    }
    try {
      return response.json(await cms.reorderFields(params.key, order.map(String)))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }
}

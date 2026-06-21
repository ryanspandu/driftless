import type { HttpContext } from '@adonisjs/core/http'
import PagesService from '#services/pages_service'
import CmsService from '#services/cms_service'

const pagesService = new PagesService()
const cmsService = new CmsService()

export default class PagesController {
  async index({ response }: HttpContext) {
    return response.json(await pagesService.findAll())
  }

  async show({ params, response }: HttpContext) {
    return response.json(await pagesService.findOne(params.id))
  }

  async store({ request, auth, response }: HttpContext) {
    const { title, path, status, renderMode, content, seo } = request.all()
    try {
      const item = await pagesService.create(auth.user!.id, {
        title,
        path,
        status,
        renderMode,
        content,
        seo,
      })
      return response.status(201).json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, auth, response }: HttpContext) {
    const { title, path, status, renderMode, content, seo } = request.all()
    try {
      const item = await pagesService.update(params.id, auth.user?.id ?? null, {
        title,
        path,
        status,
        renderMode,
        content,
        seo,
      })
      return response.json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ params, response }: HttpContext) {
    await pagesService.remove(params.id)
    return response.json({ success: true })
  }

  async trash({ response }: HttpContext) {
    return response.json(await pagesService.findTrashed())
  }

  async restore({ params, response }: HttpContext) {
    try {
      return response.json(await pagesService.restore(params.id))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async forceDestroy({ params, response }: HttpContext) {
    await pagesService.forceDelete(params.id)
    return response.json({ success: true })
  }

  async revisions({ params, response }: HttpContext) {
    try {
      return response.json(await pagesService.listRevisions(params.id))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async restoreRevision({ params, auth, response }: HttpContext) {
    try {
      const item = await pagesService.restoreRevision(
        params.id,
        params.revisionId,
        auth.user?.id ?? null
      )
      return response.json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async page({ inertia }: HttpContext) {
    return inertia.render('admin/pages/index', {})
  }

  async edit({ params, inertia }: HttpContext) {
    return inertia.render('admin/pages/builder', { id: params.id })
  }

  /** Collections (with fields) for the builder's CollectionList binding picker. */
  async collections({ response }: HttpContext) {
    return response.json(await cmsService.listCollections())
  }
}

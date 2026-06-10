import type { HttpContext } from '@adonisjs/core/http'
import CmsService from '#services/cms_service'

const cmsService = new CmsService()

export default class CmsController {
  // Collections
  async collectionsIndex({ response }: HttpContext) {
    const collections = await cmsService.listCollections()
    return response.json(collections)
  }

  async collectionsShow({ params, response }: HttpContext) {
    const col = await cmsService.findCollection(params.key)
    return response.json(col)
  }

  async collectionsStore({ request, response }: HttpContext) {
    const { key, label, icon, group, revisionsOn, draftsOn, fields } = request.all()
    try {
      const col = await cmsService.createCollection({ key, label, icon, group, revisionsOn, draftsOn, fields })
      return response.status(201).json(col)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async collectionsUpdate({ params, request, response }: HttpContext) {
    const { label, icon, group, revisionsOn, draftsOn } = request.all()
    try {
      const col = await cmsService.updateCollection(params.key, { label, icon, group, revisionsOn, draftsOn })
      return response.json(col)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async collectionsDestroy({ params, response }: HttpContext) {
    try {
      await cmsService.deleteCollection(params.key)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async fieldsStore({ params, request, response }: HttpContext) {
    const { key, label, type, required, unique, config } = request.all()
    try {
      const field = await cmsService.addField(params.key, { key, label, type, required, unique, config })
      return response.status(201).json(field)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async fieldsDestroy({ params, response }: HttpContext) {
    try {
      await cmsService.deleteField(params.key, params.fieldKey)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async fieldsUpdate({ params, request, response }: HttpContext) {
    const { label, config } = request.all()
    try {
      const field = await cmsService.updateField(params.key, params.fieldKey, { label, config })
      return response.json(field)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async fieldsReorder({ params, request, response }: HttpContext) {
    const { fieldKeys } = request.all()
    try {
      const fields = await cmsService.reorderFields(params.key, fieldKeys ?? [])
      return response.json(fields)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  // Records
  async recordsIndex({ params, request, response }: HttpContext) {
    const { page, pageSize, status, search } = request.qs()
    const result = await cmsService.listRecords(params.key, {
      page: page !== undefined && page !== '' ? Number(page) : undefined,
      pageSize: pageSize !== undefined && pageSize !== '' ? Number(pageSize) : undefined,
      status,
      search,
    })
    return response.json(result)
  }

  async recordsShow({ params, response }: HttpContext) {
    const record = await cmsService.findRecord(params.key, params.id)
    return response.json(record)
  }

  async recordsStore({ params, request, auth, response }: HttpContext) {
    const { data, status } = request.all()
    try {
      const record = await cmsService.createRecord(params.key, auth.user!.id, { data, status })
      return response.status(201).json(record)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async recordsUpdate({ params, request, auth, response }: HttpContext) {
    const { data, status } = request.all()
    try {
      const record = await cmsService.updateRecord(params.key, params.id, auth.user!.id, { data, status })
      return response.json(record)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async recordsDestroy({ params, response }: HttpContext) {
    await cmsService.deleteRecord(params.key, params.id)
    return response.json({ success: true })
  }

  async revisionsIndex({ params, response }: HttpContext) {
    const revisions = await cmsService.getRevisions(params.key, params.id)
    return response.json(revisions)
  }

  async revisionsRestore({ params, auth, response }: HttpContext) {
    try {
      const record = await cmsService.restoreRevision(
        params.key,
        params.id,
        params.revisionId,
        auth.user!.id
      )
      return response.json(record)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  // Pages
  async collectionsPage({ inertia }: HttpContext) {
    return inertia.render('admin/cms/collections', {})
  }

  async collectionsNewPage({ inertia }: HttpContext) {
    return inertia.render('admin/cms/collections/new', {})
  }

  async collectionDetailPage({ params, inertia }: HttpContext) {
    return inertia.render('admin/cms/collection_detail', { collectionKey: params.key })
  }

  async recordsPage({ params, inertia }: HttpContext) {
    return inertia.render('admin/cms/records', { collectionKey: params.key })
  }

  async recordDetailPage({ params, inertia }: HttpContext) {
    return inertia.render('admin/cms/record_detail', {
      collectionKey: params.key,
      recordId: params.id,
    })
  }

  async newRecordPage({ params, inertia }: HttpContext) {
    return inertia.render('admin/cms/record_detail', {
      collectionKey: params.key,
      recordId: 'new',
    })
  }
}

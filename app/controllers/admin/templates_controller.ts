import type { HttpContext } from '@adonisjs/core/http'
import TemplatesService from '#services/templates_service'
import type User from '#models/user'
import { abilityAllowsCode, collectUserPermissions } from '#services/permission_ability_service'
import { hasPrivilegedPageContent } from '#services/html_sanitizer_service'

const templatesService = new TemplatesService()

export default class TemplatesController {
  private async canManageExecutableContent(user: User, content: unknown): Promise<boolean> {
    if (!hasPrivilegedPageContent(content)) return true
    await user.load('roles', (q) => q.preload('permissions'))
    return abilityAllowsCode(collectUserPermissions(user), 'settings:manage')
  }
  async index({ request, response }: HttpContext) {
    return response.json(await templatesService.list(request.qs().type || undefined))
  }

  async show({ params, response }: HttpContext) {
    try {
      return response.json(await templatesService.find(params.id))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async store({ request, auth, response }: HttpContext) {
    const { name, type, content, collectionKey } = request.all()
    if (!(await this.canManageExecutableContent(auth.user as User, content))) {
      return response
        .status(403)
        .json({ message: 'settings:manage is required for executable template content' })
    }
    try {
      const item = await templatesService.create({ name, type, content, collectionKey })
      return response.status(201).json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, auth, response }: HttpContext) {
    const { name, content, isDefault, renderedHtml, collectionKey } = request.all()
    if (!(await this.canManageExecutableContent(auth.user as User, content))) {
      return response
        .status(403)
        .json({ message: 'settings:manage is required for executable template content' })
    }
    try {
      const item = await templatesService.update(params.id, {
        name,
        content,
        isDefault,
        renderedHtml,
        collectionKey,
      })
      return response.json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ params, response }: HttpContext) {
    try {
      await templatesService.remove(params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async duplicate({ params, response }: HttpContext) {
    try {
      return response.json(await templatesService.duplicate(params.id))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async setDefault({ params, response }: HttpContext) {
    try {
      return response.json(await templatesService.setDefault(params.id))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async page({ inertia }: HttpContext) {
    return inertia.render('admin/templates/index', {})
  }

  async edit({ params, inertia }: HttpContext) {
    return inertia.render('admin/templates/builder', { id: params.id })
  }
}

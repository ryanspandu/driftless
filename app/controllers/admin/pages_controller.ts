import type { HttpContext } from '@adonisjs/core/http'
import PagesService from '#services/pages_service'
import CmsService from '#services/cms_service'
import { CODE_PAGES } from '#services/code_pages.generated'
import type User from '#models/user'
import { abilityAllowsCode, collectUserPermissions } from '#services/permission_ability_service'
import { hasPrivilegedPageContent } from '#services/html_sanitizer_service'

const pagesService = new PagesService()
const cmsService = new CmsService()

export default class PagesController {
  private async canManageExecutableContent(
    user: User,
    body: Record<string, unknown>,
    currentKind?: string
  ): Promise<boolean> {
    if ((body.kind ?? currentKind) !== 'CODE' && !hasPrivilegedPageContent(body.content))
      return true
    await user.load('roles', (q) => q.preload('permissions'))
    return abilityAllowsCode(collectUserPermissions(user), 'settings:manage')
  }
  async index({ response }: HttpContext) {
    return response.json(await pagesService.findAll())
  }

  async show({ params, response }: HttpContext) {
    return response.json(await pagesService.findOne(params.id))
  }

  /**
   * Composition fields, normalised out of the raw body.
   *
   * They were simply not read here until now — the create/edit dialog has shown
   * Layout, Header override and Footer override pickers all along, and every
   * choice was silently dropped on save. Pulled into one helper so `store` and
   * `update` cannot drift apart again.
   */
  private composition(body: Record<string, unknown>) {
    const id = (v: unknown) => (typeof v === 'string' && v ? v : v === null ? null : undefined)
    const bool = (v: unknown) => (v === undefined ? undefined : Boolean(v))
    return {
      layoutId: id(body.layoutId),
      headerTemplateId: id(body.headerTemplateId),
      footerTemplateId: id(body.footerTemplateId),
      hideHeader: bool(body.hideHeader),
      hideFooter: bool(body.hideFooter),
    }
  }

  async store({ request, auth, response }: HttpContext) {
    const body = request.all()
    const { title, path, status, renderMode, kind, component, content, seo } = body
    if (!(await this.canManageExecutableContent(auth.user as User, body))) {
      return response
        .status(403)
        .json({ message: 'settings:manage is required for executable page content' })
    }
    try {
      const item = await pagesService.create(auth.user!.id, {
        title,
        path,
        status,
        renderMode,
        kind,
        component,
        content,
        seo,
        ...this.composition(body),
      })
      return response.status(201).json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /** Schedule columns pulled from the raw body (ISO string, null to clear, or absent). */
  private schedule(body: Record<string, unknown>) {
    const iso = (v: unknown) => (typeof v === 'string' && v ? v : v === null ? null : undefined)
    return {
      scheduledPublishAt: iso(body.scheduledPublishAt),
      scheduledUnpublishAt: iso(body.scheduledUnpublishAt),
    }
  }

  async update({ params, request, auth, response }: HttpContext) {
    const body = request.all()
    const { title, path, status, renderMode, kind, component, content, seo } = body
    try {
      const current = await pagesService.findOne(params.id)
      if (!(await this.canManageExecutableContent(auth.user as User, body, current.kind))) {
        return response
          .status(403)
          .json({ message: 'settings:manage is required for executable page content' })
      }
      const item = await pagesService.update(params.id, auth.user?.id ?? null, {
        title,
        path,
        status,
        renderMode,
        kind,
        component,
        content,
        seo,
        ...this.composition(body),
        ...this.schedule(body),
      })
      return response.json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /** Stage edits without touching the live page (autosave). */
  async saveDraft({ params, request, response }: HttpContext) {
    try {
      const item = await pagesService.saveDraft(params.id, {
        content: request.input('content'),
        seo: request.input('seo'),
      })
      return response.json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /** Promote the editor's state to live and clear the draft. */
  async publish({ params, request, auth, response }: HttpContext) {
    const body = request.all()
    const { title, path, renderMode, kind, component, content, seo } = body
    try {
      const current = await pagesService.findOne(params.id)
      if (!(await this.canManageExecutableContent(auth.user as User, body, current.kind))) {
        return response
          .status(403)
          .json({ message: 'settings:manage is required for executable page content' })
      }
      const item = await pagesService.publish(params.id, auth.user?.id ?? null, {
        title,
        path,
        renderMode,
        kind,
        component,
        content,
        seo,
        ...this.composition(body),
        ...this.schedule(body),
      })
      return response.json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async discardDraft({ params, response }: HttpContext) {
    return response.json(await pagesService.discardDraft(params.id))
  }

  /** Mint (or reuse) a shareable preview token and return the link. */
  async previewToken({ params, response }: HttpContext) {
    const token = await pagesService.ensurePreviewToken(params.id)
    return response.json({ token, url: `/preview/${token}` })
  }

  async clearPreviewToken({ params, response }: HttpContext) {
    await pagesService.clearPreviewToken(params.id)
    return response.json({ ok: true })
  }

  async duplicate({ params, auth, response }: HttpContext) {
    try {
      const item = await pagesService.duplicate(params.id, auth.user?.id ?? null)
      return response.status(201).json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async exportOne({ params, response }: HttpContext) {
    return response.json(await pagesService.exportPage(params.id))
  }

  async importOne({ request, auth, response }: HttpContext) {
    try {
      const item = await pagesService.importPage(auth.user?.id ?? null, request.input('page'))
      return response.status(201).json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async bulk({ request, auth, response }: HttpContext) {
    const ids = request.input('ids')
    const action = String(request.input('action'))
    if (!Array.isArray(ids) || !ids.length) {
      return response.status(422).json({ message: 'No pages selected.' })
    }
    try {
      const count = await pagesService.bulk(ids.map(String), action, auth.user?.id ?? null)
      return response.json({ count })
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

  /**
   * Collections (with fields) for the builder's CollectionList binding picker
   * — built-ins (posts, products while the store is enabled) plus the dynamic
   * CMS collections.
   */
  async collections({ response }: HttpContext) {
    return response.json(await cmsService.listBindableCollections())
  }

  /**
   * Hand-written page components available in this build.
   *
   * Feeds the create dialog's picker, so the only values an operator can choose
   * are ones that will actually render. Served from the same generated manifest
   * the service validates against — one source of truth, so the picker can
   * never offer something the save would reject.
   */
  async codeComponents({ response }: HttpContext) {
    return response.json(CODE_PAGES)
  }
}

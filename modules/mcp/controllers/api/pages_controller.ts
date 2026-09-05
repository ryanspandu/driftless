import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import PagesService from '#services/pages_service'
import { WebSettingsService } from '#services/settings_service'
import { validatePuckDocument } from '#modules/mcp/services/puck_content_validator'
import { checkDesignCoverage } from '#modules/mcp/services/design_coverage'
import { appUrl } from '#config/app'

const pages = new PagesService()

/**
 * Builder-API surface for pages. Thin over `PagesService`, with one addition
 * the service does not do on its own: structural validation of the Puck
 * `content` against the block catalog (422 on unknown block types / malformed
 * slots). The service still owns path uniqueness, sanitisation, revisioning and
 * snapshot invalidation.
 */
export default class BuilderPagesController {
  async index({ response }: HttpContext) {
    return response.json(await pages.findAll())
  }

  async show({ params, response }: HttpContext) {
    try {
      return response.json(await pages.findOne(params.id))
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  async store({ request, auth, response }: HttpContext) {
    const user = auth.user as User
    const dto = request.only([
      'title',
      'path',
      'status',
      'renderMode',
      'kind',
      'component',
      'layoutId',
      'headerTemplateId',
      'footerTemplateId',
      'hideHeader',
      'hideFooter',
      'content',
      'seo',
    ]) as Parameters<PagesService['create']>[1]

    if (dto.content !== undefined) {
      const check = await validatePuckDocument(dto.content, 'page')
      if (!check.valid)
        return response.status(422).json({ message: 'Invalid page content', issues: check.issues })
      dto.content = check.normalized
    }
    try {
      return response.status(201).json(await pages.create(user.id, dto))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.user as User
    const dto = request.only([
      'title',
      'path',
      'status',
      'renderMode',
      'kind',
      'component',
      'layoutId',
      'headerTemplateId',
      'footerTemplateId',
      'hideHeader',
      'hideFooter',
      'content',
      'seo',
      'scheduledPublishAt',
      'scheduledUnpublishAt',
    ]) as Parameters<PagesService['update']>[2]

    if (dto.content !== undefined) {
      const check = await validatePuckDocument(dto.content, 'page')
      if (!check.valid)
        return response.status(422).json({ message: 'Invalid page content', issues: check.issues })
      dto.content = check.normalized
    }
    try {
      return response.json(await pages.update(params.id, user.id, dto))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /** Stage a design as the page's draft (mirrors the builder's autosave). */
  async setContent({ params, request, response }: HttpContext) {
    const content = request.input('content')
    const seo = request.input('seo')
    if (content !== undefined) {
      const check = await validatePuckDocument(content, 'page')
      if (!check.valid)
        return response.status(422).json({ message: 'Invalid page content', issues: check.issues })
      try {
        return response.json(await pages.saveDraft(params.id, { content: check.normalized, seo }))
      } catch (e) {
        return response.status(404).json({ message: (e as Error).message })
      }
    }
    try {
      return response.json(await pages.saveDraft(params.id, { seo }))
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  /** Publish: promotes the staged draft, or the explicit `content` if given. */
  async publish({ params, request, auth, response }: HttpContext) {
    const user = auth.user as User
    const content = request.input('content')
    const seo = request.input('seo')
    const dto: Parameters<PagesService['publish']>[2] = {}
    if (content !== undefined) {
      const check = await validatePuckDocument(content, 'page')
      if (!check.valid)
        return response.status(422).json({ message: 'Invalid page content', issues: check.issues })
      dto.content = check.normalized
    }
    if (seo !== undefined) dto.seo = seo
    try {
      return response.json(await pages.publish(params.id, user.id, dto))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /** Validate a document without writing it — the AI's pre-flight check. */
  async validate({ request, response }: HttpContext) {
    const content = request.input('content')
    const result = await validatePuckDocument(content, 'page')
    return response.json(result)
  }

  /**
   * Mint (or reuse) the no-login preview link for a page's DRAFT, so the AI (or
   * the operator) can look at the staged build before publishing.
   */
  async previewToken({ params, response }: HttpContext) {
    try {
      const token = await pages.ensurePreviewToken(String(params.id))
      const base = (appUrl ?? '').replace(/\/+$/, '')
      return response.json({ token, url: `${base}/preview/${token}` })
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  /** Store (or clear with null) the structured design brief for a page. */
  async setBrief({ params, request, response }: HttpContext) {
    const brief = request.input('brief')
    try {
      const dto = await pages.setDesignBrief(String(params.id), brief ?? null)
      return response.json({ designBrief: dto.designBrief })
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  /**
   * Report where the built page drifts from its design brief — the primary
   * fidelity gate (the MCP can't see the render). Checks the DRAFT if present,
   * else the published content.
   */
  async coverage({ params, response }: HttpContext) {
    try {
      const page = await pages.findOne(String(params.id))
      const theme = await new WebSettingsService().getAppearance()
      // Stored content is a Puck doc { root, content: [...] } — inspect the array.
      const doc = (page.draftContent ?? page.content) as Record<string, unknown> | null
      const contentArr = doc && Array.isArray(doc.content) ? doc.content : []
      const report = checkDesignCoverage({
        content: contentArr,
        brief: page.designBrief,
        themeEffective: theme.effective,
      })
      return response.json(report)
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  async discardDraft({ params, response }: HttpContext) {
    try {
      return response.json(await pages.discardDraft(params.id))
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  /** Move a page to Trash (reversible soft-delete). */
  async destroy({ params, response }: HttpContext) {
    try {
      await pages.remove(params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Template from '#models/template'
import TemplatesService from '#services/templates_service'

const templatesService = new TemplatesService()

/**
 * Is this template reachable from something the public can already see?
 *
 * The endpoint exists so client-side `TemplateRef` blocks can fetch the chrome
 * a published page composes with. Without this check it served the full block
 * tree of *any* template id — including drafts and work-in-progress designs
 * that were never meant to be public.
 *
 * Reachable means one of:
 *  - it is the site-wide default HEADER / FOOTER / LAYOUT, or
 *  - a published page names it as its layout, header or footer, or
 *  - a published page's block tree references it, or
 *  - a default template's block tree references it (nested includes).
 *
 * The block-tree checks are substring matches against the serialised JSON.
 * `CAST(... AS TEXT)` rather than `::text` so this also runs on SQLite, which
 * the test suite uses. Template ids are ULIDs, so a substring hit is not
 * meaningfully ambiguous.
 */
async function isPubliclyReachable(template: Template): Promise<boolean> {
  /**
   * An EMAIL template is never public, whatever else is true of it.
   *
   * This check has to come before the `isDefault` shortcut below. Email
   * templates use `is_default` the same way headers do — the default receipt
   * design — so without this, marking one as the default would publish an
   * operator's email copy at an unauthenticated URL.
   */
  if (template.type === 'EMAIL') return false

  // Only HEADER/FOOTER/LAYOUT are rendered publicly as a site default. A default
  // COLLECTION/COMPONENT template has no public consumer, so being the default
  // must not, on its own, expose its block tree.
  if (
    template.isDefault &&
    (template.type === 'HEADER' || template.type === 'FOOTER' || template.type === 'LAYOUT')
  ) {
    return true
  }

  const needle = `%${template.id}%`

  const referencedByPage = await db
    .from('pages')
    .where('status', 'PUBLISHED')
    .whereNull('deleted_at')
    .where((q) => {
      q.where('layout_id', template.id)
        .orWhere('header_template_id', template.id)
        .orWhere('footer_template_id', template.id)
        .orWhereRaw('CAST(content AS TEXT) LIKE ?', [needle])
    })
    .select(db.raw('1'))
    .first()

  if (referencedByPage) return true

  const referencedByDefault = await db
    .from('templates')
    .whereNull('deleted_at')
    .where('is_default', true)
    .whereNot('id', template.id)
    .whereRaw('CAST(content AS TEXT) LIKE ?', [needle])
    .select(db.raw('1'))
    .first()

  return Boolean(referencedByDefault)
}

export default class PublicTemplatesController {
  /** Public, read-only template content — consumed by client-side TemplateRef blocks. */
  async show({ params, response }: HttpContext) {
    let template: Template
    try {
      template = await Template.query().where('id', params.id).whereNull('deleted_at').firstOrFail()
    } catch {
      return response.notFound({ message: 'Not found' })
    }

    if (!(await isPubliclyReachable(template))) {
      // Same 404 as a missing template: an unreachable template must not be
      // distinguishable from one that does not exist.
      return response.notFound({ message: 'Not found' })
    }

    const dto = await templatesService.find(template.id)
    return response.json({ id: dto.id, content: dto.content })
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import { WebSettingsService } from '#services/settings_service'
import { PAGE_ROLE_SLOTS_BY_SLOT, type OverrideSlot } from '#services/page_role_slots'
import PagesService from '#services/pages_service'
import Page from '#models/page'

const settings = new WebSettingsService()
const pages = new PagesService()

const ROLE_SLOTS = Object.keys(PAGE_ROLE_SLOTS_BY_SLOT) as OverrideSlot[]

/**
 * Builder-API surface for site-wide appearance + config. Thin over
 * `SettingsService` — values are sanitised on read there, so writes just map
 * friendly field names onto the `theme` section keys. Gated by `settings:manage`.
 */
export default class BuilderSettingsController {
  /**
   * The current public theme + the EFFECTIVE colours a block renders with (so an
   * AI client knows what `variant:"primary"` looks like before it composes, and
   * whether it must call setAppearance to match a design). Read-only.
   */
  async getAppearance({ response }: HttpContext) {
    return response.json(await settings.getAppearance())
  }

  /**
   * Patch the public theme: font, primary/secondary colours, and the named
   * saved-colour variables. Only the fields present in the body are touched.
   * Values are validated BEFORE storing — a colour/font we cannot inject is
   * rejected with 422 + `issues` instead of a silent 200 that leaves the site
   * unchanged. Responds with the sanitised theme (what will actually render).
   */
  async setAppearance({ request, response }: HttpContext) {
    const body = request.only([
      'fontFamily',
      'fontCssUrl',
      'fontFaceUrl',
      'fontCustomName',
      'primaryColor',
      'secondaryColor',
      'savedColors',
      'designTokens',
    ]) as Record<string, unknown>

    try {
      const result = await settings.setAppearanceValidated(body)
      if (!result.ok) {
        return response
          .status(422)
          .json({ message: 'Invalid appearance value', issues: result.issues })
      }
      // The theme (font/colours) is baked into SSG snapshots via shared props, so
      // cached HTML must be re-rendered — same as the admin settings controller.
      await pages.invalidateAllSnapshots()
      return response.json(result.theme)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async setBreakpoints({ request, response }: HttpContext) {
    try {
      const saved = await settings.setBreakpoints(request.input('breakpoints'))
      // The tier list changes the `@media` CSS baked into every SSG page.
      await pages.invalidateAllSnapshots()
      return response.json(saved)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async setGlobalCode({ request, response }: HttpContext) {
    try {
      const saved = await settings.setGlobalCode(request.input('snippets'))
      // Site-wide code runs on every public page → bust SSG snapshots.
      await pages.invalidateAllSnapshots()
      return response.json(saved)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /**
   * Assign a builder page to a page-role slot ("use as page") — home, the auth /
   * error screens, and the content category/tag archives. `pageId: ""` clears
   * the slot back to the built-in screen. The resolver only ever surfaces a
   * PUBLISHED + BUILDER page, so we reject anything else here rather than let it
   * silently fall back. Same primitive the admin UI uses (`applyPatches`).
   */
  async usePageAsRole({ request, response }: HttpContext) {
    const role = String(request.input('role', '')) as OverrideSlot
    // Bodyparser converts an empty string to null (`convertEmptyStringsToNull`),
    // so coalesce null/undefined → '' to mean "clear the slot".
    const pageId = String(request.input('pageId') ?? '').trim()
    const slot = PAGE_ROLE_SLOTS_BY_SLOT[role]
    if (!slot) {
      return response.status(422).json({
        message: `Unknown role "${role}". Valid roles: ${ROLE_SLOTS.join(', ')}.`,
      })
    }
    if (pageId) {
      const page = await Page.query().where('id', pageId).whereNull('deleted_at').first()
      if (!page) return response.status(404).json({ message: `Page "${pageId}" not found.` })
      if (page.status !== 'PUBLISHED') {
        return response.status(422).json({
          message: 'A page role needs a PUBLISHED page (a draft resolves to the built-in screen).',
        })
      }
    }
    await settings.applyPatches([{ section: slot.section, key: slot.key, value: pageId }])
    return response.json({ role, section: slot.section, key: slot.key, pageId: pageId || null })
  }
}

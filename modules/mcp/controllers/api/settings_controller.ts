import type { HttpContext } from '@adonisjs/core/http'
import { WebSettingsService } from '#services/settings_service'

const settings = new WebSettingsService()

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
    ]) as Record<string, unknown>

    try {
      const result = await settings.setAppearanceValidated(body)
      if (!result.ok) {
        return response.status(422).json({ message: 'Invalid appearance value', issues: result.issues })
      }
      return response.json(result.theme)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async setBreakpoints({ request, response }: HttpContext) {
    try {
      return response.json(await settings.setBreakpoints(request.input('breakpoints')))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async setGlobalCode({ request, response }: HttpContext) {
    try {
      return response.json(await settings.setGlobalCode(request.input('snippets')))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }
}

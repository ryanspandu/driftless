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
   * Patch the public theme: font, primary/secondary colours, and the named
   * saved-colour variables. Only the fields present in the body are touched.
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

    const map: Array<[string, string]> = [
      ['fontFamily', 'font_family'],
      ['fontCssUrl', 'font_css_url'],
      ['fontFaceUrl', 'font_face_url'],
      ['fontCustomName', 'font_custom_name'],
      ['primaryColor', 'primary_color'],
      ['secondaryColor', 'secondary_color'],
    ]

    const patches: Array<{ section: string; key: string; value: string }> = []
    for (const [field, key] of map) {
      if (body[field] !== undefined) {
        patches.push({ section: 'theme', key, value: String(body[field] ?? '') })
      }
    }
    if (body.savedColors !== undefined) {
      const value =
        typeof body.savedColors === 'string'
          ? body.savedColors
          : JSON.stringify(body.savedColors ?? [])
      patches.push({ section: 'theme', key: 'saved_colors', value })
    }

    try {
      return response.json(await settings.applyPatches(patches))
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

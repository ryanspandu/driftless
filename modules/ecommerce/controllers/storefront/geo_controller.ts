import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Serves the module's own city lists.
 *
 * These used to sit in `public/`, which meant a module's data lived in core and
 * an installed-from-a-zip module would have had to write outside its folder to
 * work. Serving them from the module keeps it one directory, and costs a route
 * plus the cache headers the static server would otherwise have set.
 */
const ROOT = app.makePath('modules/ecommerce/data/cities')

/** A year, immutable: the file for a country changes only when we regenerate it. */
const CACHE_CONTROL = 'public, max-age=31536000, immutable'

export default class GeoController {
  /** Which countries have a list, asked before any of them are fetched. */
  async index({ response }: HttpContext) {
    return this.send(response, 'index.json')
  }

  async cities({ params, response }: HttpContext) {
    const code = String(params.code ?? '').toUpperCase()

    /**
     * Two letters and nothing else, checked before the name touches a path.
     * `params.code` is attacker-controlled and this joins it onto a directory,
     * so anything looser is a traversal waiting to happen.
     */
    if (!/^[A-Z]{2}$/.test(code)) return response.notFound({ message: 'Unknown country.' })

    return this.send(response, `${code}.json`)
  }

  private send(response: HttpContext['response'], filename: string) {
    const path = join(ROOT, filename)

    // A country we hold no cities for is a 404, not an error — Bouvet Island
    // has none, and the client treats an empty list as "no suggestions".
    if (!existsSync(path)) return response.notFound({ message: 'Unknown country.' })

    response.header('content-type', 'application/json')
    response.header('cache-control', CACHE_CONTROL)
    return response.stream(createReadStream(path))
  }
}

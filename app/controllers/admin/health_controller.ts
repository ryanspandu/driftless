import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import type { HttpContext } from '@adonisjs/core/http'
import { CMS_VERSION } from '#cms_version'
import { MODULES, SAFE_MODE, bootFailures } from '#modules/registry'
import { isDraining } from '#services/restart'

type AssetState = 'ok' | 'stale' | 'missing'

/**
 * The Vite manifest, and the entry chunk it points at.
 *
 * `/health` used to be a hard-coded `{ ok: true }`, which meant it reported a
 * healthy site through the exact failure this project has already hit twice: a
 * manifest overwritten by a previous build, referencing chunks that are no
 * longer on disk. The app boots, every route answers, and every page is blank.
 *
 * Cheap enough to run per request — one small file read and one `existsSync`.
 */
function assetState(): AssetState {
  const manifestPath = app.makePath('public/assets/.vite/manifest.json')

  /**
   * No manifest is the *normal* state outside production: the Vite dev server
   * serves assets directly and never writes one. Reporting that as a fault
   * would make every development and CI instance look broken — which is exactly
   * what this did on its first run.
   */
  if (!existsSync(manifestPath)) return app.inProduction ? 'missing' : 'ok'

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
      string,
      { file?: string }
    >

    /**
     * The entry the layout actually loads. Checking one real chunk is what
     * separates "the manifest exists" from "the manifest describes this build".
     */
    const entry = manifest['inertia/app.tsx'] ?? Object.values(manifest)[0]
    if (!entry?.file) return 'stale'

    return existsSync(join(dirname(manifestPath), '..', entry.file)) ? 'ok' : 'stale'
  } catch {
    return 'stale'
  }
}

async function databaseUp(): Promise<boolean> {
  try {
    await db.rawQuery('SELECT 1')
    return true
  } catch {
    return false
  }
}

export default class HealthController {
  /**
   * The public probe. Deliberately says almost nothing.
   *
   * A load balancer needs a status code, not an inventory: listing installed
   * modules and their versions here would hand an attacker a map of exactly
   * which package versions to look up. The detail lives behind auth.
   */
  async public({ response }: HttpContext) {
    /**
     * Draining wins over everything else. We are about to stop accepting
     * connections, and the point of announcing it early is to give a proxy or a
     * sibling worker a health check's worth of warning to route around us.
     */
    if (isDraining()) {
      return response.status(503).json({ ok: false, version: CMS_VERSION, reason: 'draining' })
    }

    const assets = assetState()
    const ok = assets === 'ok' && (await databaseUp())

    return response.status(ok ? 200 : 503).json({ ok, version: CMS_VERSION })
  }

  /**
   * The operator's view, behind authentication.
   *
   * Returns 503 on the same conditions as the public probe, so a supervisor
   * watching either endpoint sees a broken asset state instead of the cheerful
   * `{ ok: true }` that used to be served through it.
   */
  async admin({ response }: HttpContext) {
    const assets = assetState()
    const dbUp = await databaseUp()
    const drainingNow = isDraining()
    const ok = assets === 'ok' && dbUp && !drainingNow && bootFailures.size === 0

    return response.status(assets === 'ok' && dbUp && !drainingNow ? 200 : 503).json({
      ok,
      version: CMS_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      db: dbUp ? 'up' : 'down',
      assets,
      draining: drainingNow,
      safeMode: SAFE_MODE,
      modules: {
        discovered: MODULES.length,
        // Names, not reasons — the reason is on the module row for the admin UI
        // to render next to the module it belongs to.
        failed: [...bootFailures.keys()],
      },
    })
  }
}

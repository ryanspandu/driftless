import type { ApplicationService } from '@adonisjs/core/types'

type ViteService = {
  hasManifestFile: boolean
  useDevServer: boolean
  createDevServer: (options?: Record<string, unknown>) => Promise<void>
}

/**
 * Keeps Vite + Inertia working in local development without a production build.
 *
 * - `npm run dev` / `ace serve --hmr` sets `DEV_MODE` and starts Vite via the
 *   stock provider; we force `hasManifestFile = false` so Inertia never reads a
 *   stale manifest left by `npm run build`.
 * - Plain `node ace serve` (no manifest, no `DEV_MODE`) still needs Vite: we
 *   start the dev server when `app.inDev` and no manifest exists.
 * - Production (`npm start`) is unchanged: manifest is required.
 */
export default class ViteDevProvider {
  constructor(protected app: ApplicationService) {}

  async ready() {
    const environment = this.app.getEnvironment()
    if (environment !== 'web' && environment !== 'test') return

    const vite = (await this.app.container.make('vite')) as ViteService
    const devMode = !!process.env.DEV_MODE
    const needsViteDev = this.app.inDev && (devMode || !vite.hasManifestFile)

    if (!needsViteDev) return

    vite.hasManifestFile = false

    if (!vite.useDevServer) {
      await vite.createDevServer()
    }
  }
}

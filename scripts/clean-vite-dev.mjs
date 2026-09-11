import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Removes the production Vite manifest before the dev server starts.
 *
 * A leftover `public/assets/.vite/manifest.json` (from a prior `npm run build`
 * or asset sync) makes `@adonisjs/vite` try to read the manifest while the dev
 * server is running, which throws "Cannot read the manifest file when running
 * in dev mode" on every Inertia render. Deleting it keeps dev startup clean.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'public/assets/.vite/manifest.json')

rmSync(manifestPath, { force: true })

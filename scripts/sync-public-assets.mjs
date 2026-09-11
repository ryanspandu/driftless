import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const buildAssets = join(root, 'build/public/assets')
const publicAssets = join(root, 'public/assets')

const manifestPath = join(publicAssets, '.vite/manifest.json')

if (!existsSync(buildAssets)) {
  if (existsSync(manifestPath)) {
    console.warn('[sync-public-assets] skip: build/public/assets missing; keeping existing public/assets')
    process.exit(0)
  }
  console.error(
    '[sync-public-assets] error: no build/public/assets and no public/assets/.vite/manifest.json.\n' +
      '  Run: npm run build   (or use npm run dev for development with HMR)'
  )
  process.exit(1)
}

mkdirSync(publicAssets, { recursive: true })
cpSync(buildAssets, publicAssets, { recursive: true })
console.log('[sync-public-assets] copied build/public/assets → public/assets')

if (!existsSync(manifestPath)) {
  console.error('[sync-public-assets] error: manifest missing after sync')
  process.exit(1)
}

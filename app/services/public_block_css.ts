import app from '@adonisjs/core/services/app'
import { readFileSync } from 'node:fs'

/**
 * The stylesheet URLs a public page needs in its initial `<head>` to avoid a
 * flash of unstyled content (FOUC).
 *
 * The Edge shell's `@vite(['inertia/app.tsx'])` only emits CSS for the entry
 * chunk and its STATIC imports — never its dynamic imports. Every Puck block is
 * reached through a dynamic import (Inertia lazy-loads each page), so the block
 * styles (`blocks-*.css`, ~84 KB) are absent from the head and only arrive once
 * the page's JS chunk loads. The server-rendered block markup therefore paints
 * unstyled first. This resolves those block stylesheets from the Vite manifest
 * so the head can link them up front, killing the flash.
 *
 * Resolution walks the public page entries' full import graph and collects every
 * CSS file, minus what `@vite` already emits for the `inertia/app.tsx` entry (so
 * `app.css` isn't linked twice). Hashes come from the manifest, so they stay
 * correct across builds. In dev there is no manifest (Vite serves CSS itself), so
 * this returns nothing and dev is untouched. Cached for the process lifetime — a
 * release swaps `current` and restarts, so a stale cache cannot outlive a build.
 */

/** Public page client chunks whose block CSS must be render-critical. */
const PUBLIC_ENTRIES = [
  'inertia/pages/public/page_ssr.tsx',
  'inertia/pages/public/code_ssr.tsx',
  'inertia/pages/public/page.tsx',
  'inertia/pages/public/code.tsx',
]

interface ManifestChunk {
  css?: string[]
  imports?: string[]
}

// `undefined` = not computed yet; an array (possibly empty) = the resolved URLs.
let cache: string[] | undefined

export function publicBlockCss(): string[] {
  if (cache !== undefined) return cache
  try {
    const manifest = JSON.parse(
      readFileSync(app.makePath('public/assets/.vite/manifest.json'), 'utf8')
    ) as Record<string, ManifestChunk>

    // What `@vite` already puts in the head for the app entry — don't relink it.
    const alreadyEmitted = new Set<string>(manifest['inertia/app.tsx']?.css ?? [])

    const collected = new Set<string>()
    const seen = new Set<string>()
    const walk = (key: string) => {
      if (seen.has(key)) return
      seen.add(key)
      const chunk = manifest[key]
      if (!chunk) return
      for (const css of chunk.css ?? []) collected.add(css)
      for (const imp of chunk.imports ?? []) walk(imp)
    }
    for (const entry of PUBLIC_ENTRIES) walk(entry)

    cache = [...collected].filter((css) => !alreadyEmitted.has(css)).map((css) => `/assets/${css}`)
    return cache
  } catch {
    // No manifest (dev, or an unreadable/absent file): emit nothing rather than
    // guess a hash. Dev has no FOUC — Vite injects the CSS through its own client.
    cache = []
    return cache
  }
}

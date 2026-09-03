import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import adonisjs from '@adonisjs/vite/client'
import inertia from '@adonisjs/inertia/vite'
import tailwindcss from '@tailwindcss/vite'
import { serwist } from '@serwist/vite'

/**
 * Strip absolute `@import "https://…"` rules out of CSS at build time.
 *
 * `@measured/puck/puck.css` begins with `@import "https://rsms.me/inter/inter.css"`.
 * Under the production CSP (`style-src 'self' 'nonce-…' https://fonts.googleapis.com`)
 * that host is not allowed, so the browser blocks the `@import` — and Chromium
 * fires an `error` on the owning `<link>`, which makes Vite's `__vitePreload`
 * reject with "Unable to preload CSS". Because the page builder is a code-split
 * route, that rejection aborts the dynamic `import()` of the builder component
 * and the whole page renders blank (only in a production build; the dev server
 * ships no strict CSP). Removing the external import drops Puck back to its
 * font-family fallback (Inter → system-ui), which is imperceptible in the editor
 * chrome and costs one fewer third-party request besides.
 */
function stripExternalCssImports() {
  const external = /@import\s+(?:url\()?["']https?:\/\/[^"')]+["']\)?\s*;?/g
  return {
    name: 'strip-external-css-imports',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.endsWith('.css') || !external.test(code)) return null
      return { code: code.replace(external, ''), map: null }
    },
  }
}

/**
 * Give dnd-kit's runtime-injected `<style>` elements the CSP nonce.
 *
 * The page builder drags with `@dnd-kit/dom` (via `@measured/puck`). During a
 * drag it injects three `<style>` elements into `<head>` — the grabbing cursor,
 * the *feedback* rules that position the dragged ghost, and a user-select
 * guard — and only stamps a `nonce` on them when its `nonce` option is set,
 * which Puck never sets. Under the production CSP
 * (`style-src 'self' 'nonce-…'`) an un-nonced `<style>` is discarded, so the
 * ghost had no positioning rules: it rendered at the top-left corner, then
 * vanished, and nothing could be dropped. All three sites share one exact
 * source fragment; this rewrites it to fall back to the document's nonce
 * (the `<meta name="csp-nonce">` emitted in `inertia_layout.edge`). Keeping the
 * nonce policy intact is deliberate — the alternative was `'unsafe-inline'`.
 * Applied to both the package and Puck's bundle, and a no-op wherever the
 * fragment is absent, so a dependency upgrade degrades to "unchanged", not
 * "broken".
 */
function nonceDndKitStyles() {
  const fragment = /if \(nonce\) \{\s*style\.setAttribute\("nonce", nonce\);\s*\}/g
  const replacement =
    '{ const __n = nonce ?? (typeof document !== "undefined" ? document.querySelector(\'meta[name="csp-nonce"]\')?.getAttribute("content") : undefined); if (__n) style.setAttribute("nonce", __n); }'
  return {
    name: 'nonce-dnd-kit-styles',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!/@dnd-kit\/|@measured\/puck\//.test(id) || !/\.[cm]?js$/.test(id)) return null
      if (!fragment.test(code)) return null
      fragment.lastIndex = 0
      return { code: code.replace(fragment, replacement), map: null }
    },
  }
}

export default defineConfig({
  envPrefix: ['VITE_'],
  define: {
    'import.meta.env.VITE_DISABLE_OFFLINE': JSON.stringify(process.env.DISABLE_OFFLINE ?? ''),
  },
  plugins: [
    stripExternalCssImports(),
    nonceDndKitStyles(),
    tailwindcss(),
    react(),
    inertia({ ssr: { enabled: true, entrypoint: 'inertia/ssr.tsx' } }),
    adonisjs({
      entrypoints: ['inertia/app.tsx', 'inertia/sw.ts'],
      reload: ['resources/views/**/*.edge'],
    }),
    serwist({
      swSrc: 'inertia/sw.ts',
      swDest: 'public/sw.js',
      globDirectory: 'public/assets',
      injectionPoint: 'self.__SW_MANIFEST',
      integration: {
        configureOptions(viteConfig, options) {
          const root = viteConfig.root ?? process.cwd()
          const prodAssets = path.resolve(root, 'build/public/assets')
          const devAssets = path.resolve(root, 'public/assets')
          options.globDirectory =
            viteConfig.mode === 'production' && prodAssets ? prodAssets : devAssets
          options.globIgnores = ['**/uploads/**', '**/.vite/**', '**/public/sw.js']
        },
      },
    }),
  ],

  resolve: {
    alias: {
      '~/': `${import.meta.dirname}/inertia/`,
      '@generated': `${import.meta.dirname}/.adonisjs/client/`,
      '@modules': `${import.meta.dirname}/modules`,
    },
  },

  server: {
    watch: {
      ignored: ['**/storage/**', '**/tmp/**'],
    },
  },
})

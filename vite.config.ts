import path from 'node:path'
import fs from 'node:fs'
import postcss from 'postcss'
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

/**
 * Isolate an opt-in kit's CSS so it is a self-contained scope: the kit's rules
 * cannot leak out to the dashboard / other pages, and the app's base styles
 * (Tailwind Preflight + `@layer base`) cannot leak in.
 *
 * A kit turns this on with `"isolate": true` in its `kit.json`. Only that kit's
 * `.css` is transformed; the app's CSS and non-isolated kits (e.g. atelier,
 * which is Tailwind-native) are untouched. The kit stays in the **light DOM**
 * (so its `document`-querying JS keeps working) — only the stylesheet is scoped,
 * at build time, so it still ships as a normal same-origin `<link>` (no CSP
 * nonce, styled under SSR, no new FOUC). The kit body is wrapped in
 * `<div class="kit-<name>">` by `code-page-view.tsx`.
 *
 * The transform:
 *  1. renames every `@keyframes X` → `kit-<name>-X` and rewrites `animation`
 *     references (the one namespace `@scope` cannot contain — a generic `pulse`
 *     would otherwise clobber the dashboard's `animate-pulse`);
 *  2. drops external `@import` (fonts load from a `<link>` the kit renders);
 *  3. remaps a bare `:root`/`html`/`body` selector → `:scope`, but leaves a
 *     *qualified* `body.<state>`/`html.<state>` (e.g. `body.bookm-open`) global
 *     so it still targets the real element;
 *  4. wraps the rest in `@scope (.kit-<name>) { … }`, prefixed with a
 *     zero-specificity, UNLAYERED `:where(:scope, :scope *){ all: revert-layer }`
 *     barrier that neutralises the app's `@layer base` inside the scope while
 *     losing to every real kit rule.
 */
function scopeIsolatedKitCss() {
  const kitCssRe = /\/inertia\/custom\/kits\/([^/]+)\/[^?]*\.css(?:\?|$)/
  const isolateCache = new Map<string, boolean>()
  let projectRoot = process.cwd()

  function isIsolated(kit: string): boolean {
    const cached = isolateCache.get(kit)
    if (cached !== undefined) return cached
    let v = false
    try {
      const meta = JSON.parse(
        fs.readFileSync(path.join(projectRoot, 'inertia/custom/kits', kit, 'kit.json'), 'utf8')
      )
      v = meta?.isolate === true
    } catch {
      v = false
    }
    isolateCache.set(kit, v)
    return v
  }

  const remapSelector = (selector: string): string =>
    selector
      .split(',')
      .map((raw) => {
        const t = raw.trim()
        if (t === ':root' || t === 'html' || t === 'body') return ':scope'
        return t
          .replace(/^:root(?=[\s>+~])/, ':scope')
          .replace(/^html(?=[\s>+~])/, ':scope')
          .replace(/^body(?=[\s>+~])/, ':scope')
      })
      .join(', ')

  // A selector that qualifies the real body/html with a state (class/id/attr/
  // pseudo) must stay global — e.g. `body.bookm-open{overflow:hidden}`.
  const isGlobalStateSelector = (selector: string): boolean =>
    selector.split(',').some((p) => /^(html|body)[.#:[]/.test(p.trim()))

  return {
    name: 'scope-isolated-kit-css',
    enforce: 'pre' as const,
    configResolved(config: { root?: string }) {
      projectRoot = config.root ?? process.cwd()
    },
    transform(code: string, id: string) {
      const m = id.match(kitCssRe)
      if (!m) return null
      const kit = m[1]
      if (!isIsolated(kit)) return null
      const scopeClass = `kit-${kit}`

      const root = postcss.parse(code)

      // 1. rename @keyframes + rewrite animation references
      const renames = new Map<string, string>()
      root.walkAtRules(/^(-\w+-)?keyframes$/i, (at) => {
        const orig = at.params.trim()
        if (!renames.has(orig)) renames.set(orig, `kit-${kit}-${orig}`)
        at.params = renames.get(orig)!
      })
      if (renames.size) {
        root.walkDecls(/^(-\w+-)?animation(-name)?$/i, (decl) => {
          let value = decl.value
          for (const [orig, renamed] of renames) {
            value = value.replace(new RegExp(`(^|[\\s,])${orig}(?=[\\s,]|$)`, 'g'), `$1${renamed}`)
          }
          decl.value = value
        })
      }

      // 2. classify top-level nodes (no mutation while iterating)
      const toScope: postcss.ChildNode[] = []
      const toDrop: postcss.ChildNode[] = []
      root.each((node) => {
        if (node.type === 'atrule') {
          const name = node.name.toLowerCase()
          if (name === 'import') return void toDrop.push(node) // fonts via <link>
          if (name === 'charset' || name === 'font-face' || /keyframes$/.test(name)) return // keep global
          // @media / @supports / @container etc → scope; remap any body/html inside
          node.walkRules((r) => {
            r.selector = remapSelector(r.selector)
          })
          toScope.push(node)
          return
        }
        if (node.type === 'rule') {
          if (isGlobalStateSelector(node.selector)) return // keep global
          node.selector = remapSelector(node.selector)
          toScope.push(node)
        }
      })

      // 3. rebuild: globals stay at root, the rest move into @scope
      toDrop.forEach((n) => n.remove())
      const scopeAt = postcss.atRule({ name: 'scope', params: `(.${scopeClass})` })
      scopeAt.append(':where(:scope, :scope *) { all: revert-layer; }')
      toScope.forEach((n) => {
        n.remove()
        scopeAt.append(n)
      })
      root.append(scopeAt)

      return { code: root.toString(), map: null }
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
    scopeIsolatedKitCss(),
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

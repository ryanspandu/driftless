import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/inertia'

const inertiaConfig = defineConfig({
  /**
   * Server-side rendering options.
   */
  ssr: {
    /**
     * SSR is enabled but scoped to the public page renderer only (`pages`
     * allowlist below). Every other page — the whole admin app — stays CSR.
     */
    enabled: true,

    /**
     * The public render wrappers — builder documents and hand-written code
     * pages — plus the built-in (non-override) public listing/detail pages.
     * Pages whose render mode is CSR use `public/page` / `public/code` (not
     * listed) and stay client-rendered.
     *
     * The built-in pages are here so their `<Head>` (title/canonical) reaches
     * the initial HTML instead of only appearing after client hydration —
     * without it a crawler that doesn't execute JS sees no canonical at all
     * for `/`, `/blog`, `/category/:slug`, `/tag/:slug` or a post when no
     * operator override page is configured for that role.
     *
     * This is matched with `Array.includes`, so it holds wrapper/component
     * names only. A code page's own component is resolved inside
     * `CodePageView`, which is what keeps this list from growing a line per
     * custom page.
     */
    pages: [
      'public/page_ssr',
      'public/code_ssr',
      'home',
      'posts/index',
      'posts/category',
      'posts/tag',
      'posts/show',
    ],

    /**
     * Entry file used by the SSR server build.
     */
    entrypoint: 'inertia/ssr.tsx',

    /**
     * The compiled SSR bundle, imported at render time in production.
     *
     * Absolute on purpose. `@adonisjs/inertia` defaults this to the relative
     * `ssr/ssr.js` and imports it via `pathToFileURL(bundle)`, i.e. relative to
     * the *working directory*. `npm start` runs `node current/bin/server.js`
     * from the repo root, where there is no `ssr/` (the build lives under
     * `releases/…`), so every SSR page 500'd with "Cannot find module …/ssr/ssr.js"
     * unless the process was started from inside the release. Same fix as the
     * Vite manifest path in `config/vite.ts`.
     */
    bundle: app.makePath('ssr/ssr.js'),
  },
})

export default inertiaConfig

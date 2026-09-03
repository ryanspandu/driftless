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
     * The two public render wrappers — builder documents and hand-written code
     * pages. Pages whose render mode is CSR use `public/page` / `public/code`
     * (not listed) and stay client-rendered.
     *
     * This is matched with `Array.includes`, so it holds wrapper names only. A
     * code page's own component is resolved inside `CodePageView`, which is
     * what keeps this list from growing a line per custom page.
     */
    pages: ['public/page_ssr', 'public/code_ssr'],

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

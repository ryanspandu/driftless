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
  },
})

export default inertiaConfig

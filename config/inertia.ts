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
     * Only the SSR builder-page component is server-rendered. Pages whose render
     * mode is CSR use `public/page` (not listed) and stay client-rendered.
     */
    pages: ['public/page_ssr'],

    /**
     * Entry file used by the SSR server build.
     */
    entrypoint: 'inertia/ssr.tsx',
  },
})

export default inertiaConfig

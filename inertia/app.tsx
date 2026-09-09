import './css/app.css'
import type { ComponentType } from 'react'
import { client } from './client'
import { createRoot } from 'react-dom/client'
import { createInertiaApp } from '@inertiajs/react'
import { TuyauProvider } from '@adonisjs/inertia/react'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import { ThemeProvider } from '~/components/providers/theme-provider'
import { QueryProvider } from '~/components/providers/query-provider'
import { DeleteConfirmProvider } from '~/components/providers/delete-confirm-provider'
import { LayoutShell } from '~/components/layout-shell'

const appName = import.meta.env.VITE_APP_NAME || 'Driftless'

// The per-request CSP nonce, published by the server in <meta name="csp-nonce">.
// next-themes needs it or its no-FOUC inline <script>/<style> are CSP-blocked.
const cspNonce =
  document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content') || undefined

/**
 * A CSS chunk that fails to preload must never blank the page.
 *
 * Vite preloads a code-split route's CSS by injecting a `<link>` and rejects
 * the whole dynamic `import()` if that link errors — which, for a route like
 * the page builder, takes the entire page down to a white screen. The CSS a
 * component needs is a progressive enhancement, not a load-bearing dependency:
 * swallow the preload error for CSS so the route's JavaScript still mounts.
 * (JS chunk failures are left to surface — they are a real integrity problem,
 * and `verify-build` guards against them.) See the CSS `@import` note in
 * `vite.config.ts` for the specific failure this was first hit on.
 */
window.addEventListener('vite:preloadError', (event) => {
  const message = String((event as Event & { payload?: Error }).payload?.message ?? '')
  if (message.includes('Unable to preload CSS')) event.preventDefault()
})

createInertiaApp({
  title: (title) => (title ? `${title} - ${appName}` : appName),
  resolve: async (name) => {
    // Module pages: "modules/<name>/<area>/<page>" lives at
    // modules/<name>/ui/<area>/<page>.tsx (co-located with the module back-end).
    if (name.startsWith('modules/')) {
      const rel = name.slice('modules/'.length)
      const slash = rel.indexOf('/')
      const mod = rel.slice(0, slash)
      const rest = rel.slice(slash + 1)
      const moduleModule = await resolvePageComponent(
        `../modules/${mod}/ui/${rest}.tsx`,
        import.meta.glob<{ default: ComponentType }>('../modules/*/ui/**/*.tsx')
      )
      return moduleModule.default
    }

    const pageModule = await resolvePageComponent(
      `./pages/${name}.tsx`,
      import.meta.glob<{ default: ComponentType }>('./pages/**/*.tsx')
    )
    return pageModule.default
  },
  setup({ el, App, props }) {
    if (
      import.meta.env.PROD &&
      import.meta.env.VITE_DISABLE_OFFLINE !== '1' &&
      'serviceWorker' in navigator
    ) {
      // Guard + catch: when offline is disabled at build time the `virtual:serwist`
      // module ships no `registerSW`, and calling it threw an uncaught
      // "r is not a function" on every prod page. Register only when it's real.
      void import('virtual:serwist')
        .then((m) => {
          if (typeof m.registerSW === 'function') m.registerSW({ immediate: true })
        })
        .catch(() => {})
    } else if (import.meta.env.DEV && 'serviceWorker' in navigator) {
      // Dev never registers a service worker — but if a production build was
      // once served on this same origin (e.g. `npm start` on :3333), its worker
      // stays registered and keeps intercepting every request with a stale
      // NetworkFirst cache, which makes the whole dev app feel laggy and fights
      // HMR. Actively tear any leftover worker (and its caches) down in dev.
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister()
      })
      if ('caches' in window) {
        void caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k)))
      }
    }

    createRoot(el).render(
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        nonce={cspNonce}
      >
        <QueryProvider>
          <DeleteConfirmProvider>
            <TuyauProvider client={client}>
              <App
                {...props}
                children={({ Component, props: pageProps, key }) => (
                  <LayoutShell Component={Component} pageProps={pageProps} pageKey={key} />
                )}
              />
            </TuyauProvider>
          </DeleteConfirmProvider>
        </QueryProvider>
      </ThemeProvider>
    )
  },
  progress: {
    color: '#4B5563',
  },
})

import { client } from '~/client'
import type { ComponentType } from 'react'
import ReactDOMServer from 'react-dom/server'
import { createInertiaApp } from '@inertiajs/react'
import { TuyauProvider } from '@adonisjs/inertia/react'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import { ThemeProvider } from '~/components/providers/theme-provider'
import { QueryProvider } from '~/components/providers/query-provider'
import { DeleteConfirmProvider } from '~/components/providers/delete-confirm-provider'
import { LayoutShell } from '~/components/layout-shell'

const appName = import.meta.env.VITE_APP_NAME || 'Driftless'

// Mirrors inertia/app.tsx (providers + LayoutShell) so server output matches the
// client tree and hydration is clean. Only pages allowlisted in config/inertia.ts
// `ssr.pages` are ever rendered through here.
export default function render(page: any) {
  // The per-request CSP nonce, shared as an Inertia prop (inertia_middleware).
  // next-themes emits a no-FOUC inline <script> + a transition-off <style>; both
  // need this nonce or strict prod CSP blocks them.
  const nonce: string | undefined = page?.props?.cspNonce
  return createInertiaApp({
    page,
    // Mirror app.tsx's title template so the SSR <title> matches the client and
    // no page ever ships without one.
    title: (title) => (title ? `${title} - ${appName}` : appName),
    render: ReactDOMServer.renderToString,
    resolve: (name) =>
      resolvePageComponent(
        `./pages/${name}.tsx`,
        import.meta.glob<{ default: ComponentType }>('./pages/**/*.tsx')
      ),
    setup: ({ App, props }) => (
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        nonce={nonce}
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
    ),
  })
}

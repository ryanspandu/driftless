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
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      void import('virtual:serwist').then(({ registerSW }) => {
        registerSW({ immediate: true })
      })
    }

    createRoot(el).render(
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
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

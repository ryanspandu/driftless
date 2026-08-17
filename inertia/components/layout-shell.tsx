import { createElement, type ComponentType } from 'react'
import { usePage } from '@inertiajs/react'
import AdminLayout from '~/layouts/admin'
import AuthLayout from '~/layouts/auth'
import PublicLayout from '~/layouts/public'
import { AbilityProvider } from '~/components/providers/ability-provider'
import { OfflineProvider } from '~/components/providers/offline-provider'

type PageComponent = ComponentType<Record<string, unknown>>

export function LayoutShell({
  Component,
  pageProps,
  pageKey,
}: {
  Component: PageComponent
  pageProps: Record<string, unknown>
  pageKey: number | null
}) {
  const { component: pageName } = usePage()
  const page = createElement(Component, { key: pageKey ?? undefined, ...pageProps })

  // Full-screen page builder — admin context (providers) but no sidebar chrome.
  if (pageName === 'admin/pages/builder' || pageName === 'admin/templates/builder') {
    return (
      <AbilityProvider>
        <OfflineProvider>{page}</OfflineProvider>
      </AbilityProvider>
    )
  }

  /**
   * CMS-rendered public pages render standalone (the page defines its own
   * shell) — builder documents (`public/page*`) and hand-written code pages
   * (`public/code*`) alike, in both their CSR and SSR variants.
   *
   * A code page must land here rather than in `PublicLayout`: it owns its whole
   * output and opts into the site header/footer through `<SiteChrome>`, so
   * wrapping it in a second layout would render the chrome twice. The
   * `theme-light` scope keeps the public site light regardless of the admin
   * dark-mode toggle (`contents` so it adds no box of its own).
   */
  if (
    pageName === 'public/page' ||
    pageName === 'public/page_ssr' ||
    pageName === 'public/code' ||
    pageName === 'public/code_ssr'
  ) {
    return <div className="contents theme-light">{page}</div>
  }

  /**
   * Error pages stand alone — no site chrome.
   *
   * `errors/*` covers the public 404 and 500. The header is a builder template
   * full of links to a site the visitor has just failed to reach; showing it
   * above "page not found" invites them to try the very navigation that did not
   * help. `theme-light` is kept because the whole public side is light-only.
   *
   * The **admin** 404 (`admin/not_found`) deliberately keeps its chrome: a
   * signed-in operator who mistypes a URL should still have the sidebar.
   */
  if (pageName.startsWith('errors/')) {
    return <div className="contents theme-light">{page}</div>
  }

  // Admin area: core admin pages ("admin/*") and module admin pages
  // ("modules/<name>/admin/*"). A module's public pages fall through to
  // PublicLayout.
  const isModuleAdmin = /^modules\/[^/]+\/admin\//.test(pageName)
  if (pageName.startsWith('admin/') || isModuleAdmin) {
    return (
      <AbilityProvider>
        <OfflineProvider>
          <AdminLayout>{page}</AdminLayout>
        </OfflineProvider>
      </AbilityProvider>
    )
  }
  if (pageName.startsWith('auth/')) {
    return <AuthLayout>{page}</AuthLayout>
  }
  return <PublicLayout>{page}</PublicLayout>
}

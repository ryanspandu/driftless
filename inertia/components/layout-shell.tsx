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

  // CMS-rendered public pages render standalone (the page defines its own shell).
  // Both the CSR (`public/page`) and SSR (`public/page_ssr`) variants.
  if (pageName === 'public/page' || pageName === 'public/page_ssr') {
    return page
  }

  // Admin area: core admin pages ("admin/*") and plugin admin pages
  // ("plugins/<name>/admin/*"). Plugin public pages fall through to PublicLayout.
  const isPluginAdmin = /^plugins\/[^/]+\/admin\//.test(pageName)
  if (pageName.startsWith('admin/') || isPluginAdmin) {
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

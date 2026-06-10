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

  if (pageName.startsWith('admin/')) {
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

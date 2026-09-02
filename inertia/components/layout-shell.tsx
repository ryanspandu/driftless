import { createElement, type ComponentType } from 'react'
import { usePage } from '@inertiajs/react'
import AdminLayout from '~/layouts/admin'
import AuthLayout from '~/layouts/auth'
import PublicLayout from '~/layouts/public'
import { AbilityProvider } from '~/components/providers/ability-provider'
import { OfflineProvider } from '~/components/providers/offline-provider'
import { AnalyticsBeacon } from '~/components/analytics-beacon'

type PageComponent = ComponentType<Record<string, unknown>>

interface SiteTheme {
  fontFamily: string
  fontCssUrl: string
  fontFaceUrl: string
  fontCustomName: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
}

/** Guess the CSS `format(...)` for an uploaded font URL (best-effort). */
function fontFormat(url: string): string {
  if (/\.woff2(\?|$)/i.test(url)) return "format('woff2')"
  if (/\.woff(\?|$)/i.test(url)) return "format('woff')"
  if (/\.otf(\?|$)/i.test(url)) return "format('opentype')"
  if (/\.ttf(\?|$)/i.test(url)) return "format('truetype')"
  return ''
}

/**
 * Injects the operator's public font/colour theme, scoped to `.theme-light` so
 * it restyles the public site + storefront but never the dashboard (which is
 * outside that scope). Values are already sanitised server-side. Rendered only
 * on public surfaces — never on admin or auth pages.
 */
function SiteThemeStyle() {
  const theme = (usePage().props as { siteTheme?: SiteTheme }).siteTheme
  if (!theme) return null

  const decls: string[] = []
  if (theme.primaryColor) decls.push(`--primary:${theme.primaryColor}`)
  if (theme.secondaryColor) decls.push(`--secondary:${theme.secondaryColor}`)
  if (theme.accentColor) decls.push(`--accent:${theme.accentColor}`)
  if (theme.fontFamily) decls.push(`font-family:'${theme.fontFamily}',var(--font-sans)`)

  // The uploaded custom font is declared via @font-face (keyed by its name);
  // a Google font loads via a <link>. `fontFamily` is whichever is active.
  const fontFace =
    theme.fontFaceUrl && theme.fontCustomName
      ? `@font-face{font-family:'${theme.fontCustomName}';src:url('${theme.fontFaceUrl}') ${fontFormat(theme.fontFaceUrl)};font-display:swap}`
      : ''
  const css = `${fontFace}${decls.length ? `.theme-light{${decls.join(';')}}` : ''}`

  // The Google stylesheet is only needed when a Google font is the active one.
  const customActive = Boolean(theme.fontCustomName && theme.fontFamily === theme.fontCustomName)

  if (!css && !theme.fontCssUrl) return null
  return (
    <>
      {theme.fontCssUrl && !customActive ? <link rel="stylesheet" href={theme.fontCssUrl} /> : null}
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
    </>
  )
}

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
    pageName === 'public/code_ssr' ||
    // A module's storefront pages (`modules/<name>/storefront/*`) own their own
    // shell too: they render the site header/footer through `<SiteChrome>`
    // (see the ecommerce `StorefrontLayout`), so wrapping them in `PublicLayout`
    // would draw the marketing header a second time.
    /^modules\/[^/]+\/storefront\//.test(pageName)
  ) {
    return (
      <div className="contents theme-light">
        <SiteThemeStyle />
        <AnalyticsBeacon />
        {page}
      </div>
    )
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
    return (
      <div className="contents theme-light">
        <SiteThemeStyle />
        <AnalyticsBeacon />
        {page}
      </div>
    )
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
  return (
    <PublicLayout>
      <SiteThemeStyle />
      <AnalyticsBeacon />
      {page}
    </PublicLayout>
  )
}

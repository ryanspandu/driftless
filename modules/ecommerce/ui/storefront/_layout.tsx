import { useEffect, useState, type ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import { useTheme } from 'next-themes'
import { PublicPageFrame } from '~/components/public-page-frame'
import { SiteChrome } from '~/custom/site-chrome'
import type { MetaTag } from '~/components/public-page-head'
import type { CodeSnippet } from '~/puck/custom-code'
import type { CmsRecord } from '~/puck/collection-list'

/**
 * Shared form styling for the storefront account screens (sign in, sign up,
 * account). Kept here so the three stay visually consistent.
 */
export const FIELD_CLASS =
  'h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/25'

export const SUBMIT_CLASS =
  'flex h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60'

/** Site-chrome props the controller resolves and passes to every storefront page. */
interface StorefrontChromeProps {
  header?: Record<string, unknown>
  footer?: Record<string, unknown>
  templates?: Record<string, Record<string, unknown>>
  collections?: Record<string, CmsRecord[]>
  blockData?: Record<string, unknown>
  globalCode?: CodeSnippet[]
  globalMeta?: MetaTag[]
}

/**
 * Wraps a fixed storefront screen in the site's header and footer.
 *
 * The `/shop/*` fallback pages are hand-written Inertia pages, so they never went
 * through `PageRenderer` and picked up none of the site chrome — they fell
 * through to the marketing `PublicLayout`, which has no footer. This gives them
 * the same header/footer as builder and code pages: the chrome is resolved
 * server-side (`SiteChromeService`) and handed in as page props, then rendered
 * through `PublicPageFrame` (which supplies the block-render contexts the header
 * and footer `<Render>` need) and `SiteChrome`.
 *
 * The screen inside is rendered with `embedded`, so `PublicPageFrame` owns the
 * document title rather than the screen setting its own.
 */
export function StorefrontLayout({ title, children }: { title: string; children: ReactNode }) {
  const props = usePage().props as unknown as StorefrontChromeProps
  const { resolvedTheme } = useTheme()
  const [headerOffset, setHeaderOffset] = useState(0)

  /**
   * Reserve space for a fixed/sticky site header.
   *
   * A header template is commonly `position: fixed`, so it overlays the top of
   * the viewport and would hide the start of the page (or pull a vertically
   * centred screen up behind it). It is a template we don't control, so its
   * height is measured: find a bar pinned to the top spanning most of the width
   * and pad the content by its height. Zero when the header is in-flow, so a
   * non-fixed header adds no gap.
   */
  useEffect(() => {
    const measure = () => {
      let offset = 0
      for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
        const cs = getComputedStyle(el)
        if (cs.position !== 'fixed' && cs.position !== 'sticky') continue
        const rect = el.getBoundingClientRect()
        if (
          rect.top <= 1 &&
          rect.height >= 32 &&
          rect.height <= 200 &&
          rect.width >= window.innerWidth * 0.6
        ) {
          offset = Math.max(offset, Math.round(rect.height))
        }
      }
      setHeaderOffset(offset)
    }
    measure()
    // The header is a hydrated Puck template, so re-measure once it has settled.
    const timer = window.setTimeout(measure, 250)
    window.addEventListener('resize', measure)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', measure)
    }
  }, [])

  /**
   * The storefront is always light, like the rest of the public site — the
   * admin dark-mode toggle must not follow the shopper here. `theme-light` on the
   * wrapper keeps the *content* light, but the dark `<html>`/`<body>` canvas
   * (and scrollbar) shows through a transparent page, so strip the class off
   * `<html>` while a storefront page is mounted and restore it on the way back.
   * A MutationObserver is needed because next-themes re-applies it on hydration.
   * This mirrors `PublicLayout`, which these pages no longer route through.
   */
  useEffect(() => {
    const html = document.documentElement
    const stripDark = () => {
      if (html.classList.contains('dark')) html.classList.remove('dark')
    }
    stripDark()
    const observer = new MutationObserver(stripDark)
    observer.observe(html, { attributes: true, attributeFilter: ['class'] })
    return () => {
      observer.disconnect()
      if (resolvedTheme === 'dark') html.classList.add('dark')
    }
  }, [resolvedTheme])

  return (
    <PublicPageFrame
      title={title}
      globalMeta={props.globalMeta}
      globalCode={props.globalCode}
      templates={props.templates}
      collections={props.collections}
      blockData={props.blockData}
    >
      {/* `theme-light` + a full-height light canvas so the admin dark theme never
          bleeds through around the content. `paddingTop` clears a fixed header. */}
      <div
        className="theme-light flex min-h-screen flex-col bg-background"
        style={headerOffset ? { paddingTop: headerOffset } : undefined}
      >
        <SiteChrome header={props.header} footer={props.footer}>
          {children}
        </SiteChrome>
      </div>
    </PublicPageFrame>
  )
}

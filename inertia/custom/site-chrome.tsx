import type { ReactNode } from 'react'
import { ChromeSlot, useChromeCode } from '~/puck/chrome_slot'
import type { CodePageProps } from '~/custom/types'

/**
 * The site header and footer, around your own markup.
 *
 * A code page is free to render nothing but itself, but most want to sit inside
 * the same chrome as the rest of the site — and that chrome is a builder
 * document, editable at `/admin/templates`. Rendering it here means a code page
 * picks up header edits without being touched, instead of hard-coding a copy
 * that drifts the first time someone changes a nav link.
 *
 * Opt-in by design: a landing page that owns the full viewport should not have
 * to fight a header it never asked for.
 */

export function SiteChrome({
  header,
  footer,
  children,
}: Pick<CodePageProps, 'header' | 'footer'> & { children: ReactNode }) {
  // A code header/footer set on the page wins over the builder document; the
  // pointer arrives through context so the author's call stays `header/footer`.
  const code = useChromeCode()
  return (
    <>
      <ChromeSlot code={code.header} doc={header} />
      {children}
      <ChromeSlot code={code.footer} doc={footer} />
    </>
  )
}

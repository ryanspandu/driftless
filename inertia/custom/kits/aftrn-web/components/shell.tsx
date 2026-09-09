import '../style/style.css'
import type { ReactNode } from 'react'
import Header from '../templates/header'
import Footer from '../templates/footer'
import { Pnav } from './pnav'
import { BookModal } from './book-modal'

/**
 * Page shell: the site chrome (one of the two headers + the shared footer) plus
 * the booking modal, around a page's own content. Importing `styles.css` here
 * means every page that uses the shell gets the kit's stylesheet.
 */
export function Shell({
  header = 'nav',
  insightsCurrent,
  backHref,
  backLabel,
  children,
}: {
  header?: 'nav' | 'pnav'
  insightsCurrent?: boolean
  backHref?: string
  backLabel?: string
  children: ReactNode
}) {
  return (
    <>
      {/* Fonts. Loaded here rather than via CSS @import (invalid inside the kit's
          @scope). React hoists this <link> to <head> and dedupes by href; the
          @font-face lands globally (harmless), the family stays scoped in CSS. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap"
        media="print"
        data-font-async=""
      />
      {header === 'pnav' ? (
        <Pnav backHref={backHref} backLabel={backLabel} />
      ) : (
        <Header insightsCurrent={insightsCurrent} />
      )}
      {children}
      <Footer />
      <BookModal />
    </>
  )
}

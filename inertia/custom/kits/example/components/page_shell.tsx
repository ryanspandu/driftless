import type { ReactNode } from 'react'
import { SiteChrome } from '~/custom/site-chrome'
import type { CodePageProps } from '~/custom/types'

/**
 * A shared shell for this kit's file-pages — proof that several pages in one
 * folder can share components. Wraps `<SiteChrome>` (so each page sits inside the
 * real site header/footer) around a centered hero header and a content slot.
 */
export function PageShell({
  header,
  footer,
  eyebrow,
  title,
  intro,
  children,
}: Pick<CodePageProps, 'header' | 'footer'> & {
  eyebrow: string
  title: string
  intro?: string
  children?: ReactNode
}) {
  return (
    <SiteChrome header={header} footer={footer}>
      <main className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {title}
        </h1>
        {intro ? (
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">{intro}</p>
        ) : null}
        {children ? <div className="mt-10">{children}</div> : null}
      </main>
    </SiteChrome>
  )
}

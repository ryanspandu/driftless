import type { ReactNode } from 'react'
import { Render, type Data } from '@measured/puck'
import { puckConfig } from '~/puck/config'
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

const EMPTY: Data = { content: [], root: {} } as unknown as Data

function toData(doc: Record<string, unknown> | undefined | null): Data {
  return doc && Object.keys(doc).length ? (doc as unknown as Data) : EMPTY
}

/** Nothing to render for `undefined`, `{}` or a document with no blocks. */
function hasBlocks(doc: Record<string, unknown> | undefined | null): boolean {
  if (!doc || !Object.keys(doc).length) return false
  const content = (doc as { content?: unknown }).content
  return !Array.isArray(content) || content.length > 0
}

export function SiteChrome({
  header,
  footer,
  children,
}: Pick<CodePageProps, 'header' | 'footer'> & { children: ReactNode }) {
  return (
    <>
      {hasBlocks(header) ? <Render config={puckConfig} data={toData(header)} /> : null}
      {children}
      {hasBlocks(footer) ? <Render config={puckConfig} data={toData(footer)} /> : null}
    </>
  )
}

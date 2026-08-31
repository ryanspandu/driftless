import { useMemo } from 'react'
import { Render, type Data } from '@measured/puck'
import { puckConfig } from '~/puck/config'
import { type CmsRecord } from '~/puck/collection-list'
import { PageOutletContext } from '~/puck/page-outlet'
import { type CodeSnippet } from '~/puck/custom-code'
import { BreakpointContext, readBreakpoints } from '~/puck/breakpoints'
import { PublicPageFrame } from '~/components/public-page-frame'

export interface PublicPageData {
  title: string
  path: string
  content: Record<string, unknown>
  seo?: Record<string, unknown>
  /** Optional LAYOUT template wrapping the page (its content has a PageOutlet). */
  layout?: Record<string, unknown> | null
  header?: Record<string, unknown>
  footer?: Record<string, unknown>
  /** SSR/SSG-resolved collection records keyed by `${collectionKey}:${limit}`. */
  collections?: Record<string, CmsRecord[]>
  /** SSR/SSG-resolved TemplateRef content keyed by `templateId`. */
  templates?: Record<string, Record<string, unknown>>
  /**
   * Data resolved for blocks that registered a resolver (e.g. commerce blocks),
   * keyed exactly as the resolver keyed it. Absent on CSR pages, and on SSG
   * pages it deliberately excludes volatile data such as price and stock —
   * those blocks hydrate that client-side.
   */
  blockData?: Record<string, unknown>
  /** Route bindings when this page is acting as a template. */
  bindings?: Record<string, string>
  /** Site-wide custom code (from web settings), injected on every public page. */
  globalCode?: CodeSnippet[]
  /** Site-wide custom <meta> tags (from web settings), applied on every public page. */
  globalMeta?: { name?: string; property?: string; content?: string }[]
  /** Site-wide responsive breakpoints JSON (from web settings) — drives `@media` CSS. */
  breakpoints?: string
  /** True when rendered via the admin preview route — shows a subtle banner. */
  preview?: boolean
}

/** A doc with no blocks (`undefined`, `{}` or `{ content: [] }`) renders nothing. */
function hasBlocks(doc: Record<string, unknown> | undefined | null): boolean {
  if (!doc || !Object.keys(doc).length) return false
  const content = (doc as { content?: unknown }).content
  return !Array.isArray(content) || content.length > 0
}

function toData(doc: Record<string, unknown> | undefined | null): Data {
  return doc && Object.keys(doc).length
    ? (doc as unknown as Data)
    : ({ content: [], root: {} } as unknown as Data)
}

/**
 * Shared public renderer for a builder Page — used by both the CSR component
 * (`public/page`) and the SSR component (`public/page_ssr`). Emits SEO `<head>`
 * tags (server-rendered when the page's render mode is SSR/SSG) and composes the
 * output:
 *
 * - With a LAYOUT: render the layout's block tree, providing the page's own
 *   content through `PageOutletContext` so the layout's `PageOutlet` block
 *   injects it. (Header/footer live inside the layout.)
 * - Without a layout: render header (if any) → page content → footer (if any).
 *
 * Referenced templates (TemplateRef) read their content from `TemplateContext`.
 */
export function PublicPageView({ page }: { page: PublicPageData }) {
  const data = toData(page.content)
  const rootProps = (page.content?.root as { props?: Record<string, unknown> } | undefined)?.props

  const hasLayout = hasBlocks(page.layout)
  const showHeader = hasBlocks(page.header)
  const showFooter = hasBlocks(page.footer)

  // `activeBp: null` = published mode: every Box emits real `@media` CSS keyed to
  // the site-wide tier widths (so custom resolutions work), rather than flattening
  // a single previewed breakpoint the way the editor does.
  const bpContext = useMemo(
    () => ({ breakpoints: readBreakpoints(page.breakpoints), activeBp: null }),
    [page.breakpoints]
  )

  const inner = hasLayout ? (
    <PageOutletContext.Provider value={<Render config={puckConfig} data={data} />}>
      <Render config={puckConfig} data={toData(page.layout)} />
    </PageOutletContext.Provider>
  ) : (
    <>
      {showHeader ? <Render config={puckConfig} data={toData(page.header)} /> : null}
      <Render config={puckConfig} data={data} />
      {showFooter ? <Render config={puckConfig} data={toData(page.footer)} /> : null}
    </>
  )
  const body = <BreakpointContext.Provider value={bpContext}>{inner}</BreakpointContext.Provider>

  return (
    <PublicPageFrame
      title={page.title}
      seo={page.seo}
      globalMeta={page.globalMeta}
      globalCode={page.globalCode}
      rootProps={rootProps}
      templates={page.templates}
      collections={page.collections}
      blockData={page.blockData}
      bindings={page.bindings}
      preview={page.preview}
    >
      {body}
    </PublicPageFrame>
  )
}

import { Head } from '@inertiajs/react'
import { Render, type Data } from '@measured/puck'
import { puckConfig } from '~/puck/config'
import { CollectionDataContext, type CmsRecord } from '~/puck/collection-list'
import { TemplateContext } from '~/puck/template-ref'
import { PageOutletContext } from '~/puck/page-outlet'

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

  const seo = page.seo ?? {}
  const str = (key: string): string | undefined =>
    typeof seo[key] === 'string' ? (seo[key] as string) : undefined

  const title = str('title') || page.title
  const description = str('description')
  const ogImage = str('ogImage')
  const canonical = str('canonical')
  const noindex = seo.noindex === true

  const hasLayout = hasBlocks(page.layout)
  const showHeader = hasBlocks(page.header)
  const showFooter = hasBlocks(page.footer)

  const body = hasLayout ? (
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

  return (
    <>
      <Head title={title}>
        {description ? <meta name="description" content={description} /> : null}
        <meta property="og:title" content={title} />
        {description ? <meta property="og:description" content={description} /> : null}
        {ogImage ? <meta property="og:image" content={ogImage} /> : null}
        {canonical ? <link rel="canonical" href={canonical} /> : null}
        {noindex ? <meta name="robots" content="noindex,nofollow" /> : null}
      </Head>
      <TemplateContext.Provider value={page.templates ?? {}}>
        <CollectionDataContext.Provider value={page.collections ?? {}}>{body}</CollectionDataContext.Provider>
      </TemplateContext.Provider>
    </>
  )
}

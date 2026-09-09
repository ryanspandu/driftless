import { Head } from '@inertiajs/react'

/**
 * The `<head>` of a public page — SEO fields plus the site-wide meta tags.
 *
 * Extracted from `public-page-view.tsx` so a hand-written code page emits
 * exactly the same tags as a builder page. Duplicating it was the alternative,
 * and it is the kind of duplication that goes wrong quietly: one path gains an
 * `og:` tag, the other does not, and nobody notices until a link preview is
 * wrong on half the site.
 */

export interface PageSeo {
  title?: string
  description?: string
  ogImage?: string
  canonical?: string
  noindex?: boolean
  meta?: MetaTag[]
  /** Server-built, script-safe JSON-LD string (structured_data_service). */
  jsonLd?: string
  /** Operator-authored raw JSON-LD that overrides the auto graph. */
  jsonLdCustom?: string
}

export interface MetaTag {
  name?: string
  property?: string
  content?: string
}

function renderMeta(tags: MetaTag[], keyPrefix: string) {
  return tags.map((tag, i) => {
    const content = typeof tag.content === 'string' ? tag.content : ''
    if (typeof tag.name === 'string' && tag.name) {
      return <meta key={`${keyPrefix}n-${i}`} name={tag.name} content={content} />
    }
    if (typeof tag.property === 'string' && tag.property) {
      return <meta key={`${keyPrefix}p-${i}`} property={tag.property} content={content} />
    }
    return null
  })
}

export function PublicPageHead({
  title,
  seo,
  blockCss,
  globalMeta,
}: {
  /** Falls back to the page's own title when SEO has none. */
  title: string
  seo?: Record<string, unknown>
  /**
   * Render-critical block stylesheet URLs. Linked here so they land in the SSR
   * `<head>` (render-blocking) instead of arriving with the JS chunk, which is
   * what caused the flash of unstyled content. Resolved server-side from the
   * Vite manifest (`public_block_css`).
   */
  blockCss?: string[]
  globalMeta?: MetaTag[]
}) {
  const bag = seo ?? {}
  const str = (key: string): string | undefined =>
    typeof bag[key] === 'string' ? (bag[key] as string) : undefined

  const seoTitle = str('title') || title
  const description = str('description')
  const ogImage = str('ogImage')
  const canonical = str('canonical')
  const noindex = bag.noindex === true
  const metaTags: MetaTag[] = Array.isArray(bag.meta) ? (bag.meta as MetaTag[]) : []
  // Pre-serialised, script-safe JSON-LD built server-side (structured_data_service).
  const jsonLd = str('jsonLd')

  const blockStyles = Array.isArray(blockCss) ? blockCss : []

  return (
    <Head title={seoTitle}>
      {/* Render-critical block CSS, up front so the server-rendered blocks paint
          styled on the first frame (no FOUC). Direct children (not a mapped
          array): Inertia's <Head> dropped a nested-array child on SSR. There is
          realistically one such file (blocks-*.css); extra slots cover an
          e-commerce build without reintroducing an array. */}
      {blockStyles[0] ? <link rel="stylesheet" href={blockStyles[0]} /> : null}
      {blockStyles[1] ? <link rel="stylesheet" href={blockStyles[1]} /> : null}
      {blockStyles[2] ? <link rel="stylesheet" href={blockStyles[2]} /> : null}
      {description ? <meta name="description" content={description} /> : null}
      {canonical ? <link rel="canonical" href={canonical} /> : null}
      {/* Open Graph — a full card so a shared link previews correctly, not just
          the title. og:url reuses the canonical; og:type defaults to website. */}
      <meta property="og:title" content={seoTitle} />
      {description ? <meta property="og:description" content={description} /> : null}
      {ogImage ? <meta property="og:image" content={ogImage} /> : null}
      {canonical ? <meta property="og:url" content={canonical} /> : null}
      <meta property="og:type" content="website" />
      {/* Twitter card — mirrors the OG fields; large image when one is set. */}
      <meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={seoTitle} />
      {description ? <meta name="twitter:description" content={description} /> : null}
      {ogImage ? <meta name="twitter:image" content={ogImage} /> : null}
      {noindex ? <meta name="robots" content="noindex,nofollow" /> : null}
      {renderMeta(metaTags, '')}
      {renderMeta(globalMeta ?? [], 'g')}
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      ) : null}
    </Head>
  )
}

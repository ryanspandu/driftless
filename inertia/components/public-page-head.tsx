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
  globalMeta,
}: {
  /** Falls back to the page's own title when SEO has none. */
  title: string
  seo?: Record<string, unknown>
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

  return (
    <Head title={seoTitle}>
      {description ? <meta name="description" content={description} /> : null}
      <meta property="og:title" content={seoTitle} />
      {description ? <meta property="og:description" content={description} /> : null}
      {ogImage ? <meta property="og:image" content={ogImage} /> : null}
      {canonical ? <link rel="canonical" href={canonical} /> : null}
      {noindex ? <meta name="robots" content="noindex,nofollow" /> : null}
      {renderMeta(metaTags, '')}
      {renderMeta(globalMeta ?? [], 'g')}
    </Head>
  )
}

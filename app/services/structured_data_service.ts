import { absoluteUrl, siteUrl } from '#helpers/site_url'

/**
 * Builds the JSON-LD (schema.org) payload emitted in a public page's `<head>`.
 *
 * Rich results (breadcrumbs, article/product cards, sitelinks) need structured
 * data, and the builder had none. This produces a sensible default from what a
 * page already knows — a `WebPage`, a `BreadcrumbList`, and `Organization` +
 * `WebSite` on the home page — and lets a module contribute typed nodes
 * (`Article`, `Product`) or an operator supply a full custom object that wins
 * outright.
 *
 * Output is a ready-to-embed JSON string (or `null`); the caller drops it into a
 * `<script type="application/ld+json">`. Emitted inside the SSR-rendered head,
 * so it is captured in both live responses and the SSG snapshot automatically.
 */

export interface JsonLdInput {
  /** Absolute URL of this page. */
  url: string
  title: string
  description?: string
  siteName: string
  /** Absolute logo URL, used for Organization on the home page. */
  logoUrl?: string
  isHome: boolean
  /** Page path (e.g. `about/team`), used to derive the breadcrumb trail. */
  path: string
  /** Module-contributed nodes (e.g. a Product), spread into the graph. */
  extra?: unknown[]
  /**
   * Operator-authored JSON-LD (raw string from the SEO panel). When it parses
   * to an object/array it REPLACES the auto graph entirely — an escape hatch for
   * anything the defaults don't cover.
   */
  custom?: string | null
}

/** Neutralise the two sequences that could break out of a `<script>` element. */
function escapeForScript(json: string): string {
  return json.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '\\u003C!--')
}

/** Title-case a path segment for a breadcrumb label (`our-team` → `Our Team`). */
function humaniseSegment(seg: string): string {
  return decodeURIComponent(seg)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim()
}

function breadcrumbList(path: string): Record<string, unknown> | null {
  const segments = path.split('/').filter(Boolean)
  if (segments.length < 1) return null
  const items: unknown[] = [
    { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': siteUrl() },
  ]
  let acc = ''
  segments.forEach((seg, i) => {
    acc += `/${seg}`
    items.push({
      '@type': 'ListItem',
      'position': i + 2,
      'name': humaniseSegment(seg),
      'item': `${siteUrl()}${acc}`,
    })
  })
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': items }
}

export function buildJsonLd(input: JsonLdInput): string | null {
  // Operator override wins outright when it is valid JSON.
  const customRaw = (input.custom ?? '').trim()
  if (customRaw) {
    try {
      const parsed = JSON.parse(customRaw)
      if (parsed && typeof parsed === 'object') return escapeForScript(JSON.stringify(parsed))
    } catch {
      // Fall through to the auto graph rather than emitting invalid markup.
    }
  }

  const graph: unknown[] = []

  graph.push({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': input.title,
    'url': input.url,
    ...(input.description ? { description: input.description } : {}),
  })

  if (input.isHome) {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      'name': input.siteName,
      'url': siteUrl(),
    })
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      'name': input.siteName,
      'url': siteUrl(),
      ...(input.logoUrl ? { logo: absoluteUrl(input.logoUrl) } : {}),
    })
  }

  const crumbs = breadcrumbList(input.path)
  if (crumbs) graph.push(crumbs)

  if (Array.isArray(input.extra)) {
    for (const node of input.extra) if (node && typeof node === 'object') graph.push(node)
  }

  if (!graph.length) return null
  // A single node emits bare; multiple emit as an array.
  return escapeForScript(JSON.stringify(graph.length === 1 ? graph[0] : graph))
}

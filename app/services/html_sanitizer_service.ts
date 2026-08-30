import sanitizeHtml from 'sanitize-html'

const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'u', 's', 'blockquote', 'pre', 'code', 'h1', 'h2', 'h3', 'h4',
    'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th',
    'td', 'hr', 'span',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    '*': ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, ...(attribs.target === '_blank' ? { rel: 'noopener noreferrer' } : {}) },
    }),
  },
}

/** One server-side boundary for every user-authored rich text value. */
export function sanitizeRichText(value: unknown): string {
  return sanitizeHtml(typeof value === 'string' ? value : '', RICH_TEXT_OPTIONS)
}

const IFRAME_HOSTS = new Set([
  'www.youtube.com', 'youtube.com', 'player.vimeo.com', 'www.google.com', 'maps.google.com',
  'www.facebook.com', 'open.spotify.com',
])

function isAllowedIframeUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && IFRAME_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

/** CodeEmbed accepts presentation HTML only; JS stays in trusted snippets. */
export function sanitizeEmbedHtml(value: unknown): string {
  return sanitizeHtml(typeof value === 'string' ? value : '', {
    ...RICH_TEXT_OPTIONS,
    allowedTags: [...(Array.isArray(RICH_TEXT_OPTIONS.allowedTags) ? RICH_TEXT_OPTIONS.allowedTags : []), 'div', 'section', 'iframe'],
    allowedAttributes: {
      ...RICH_TEXT_OPTIONS.allowedAttributes,
      iframe: ['src', 'title', 'width', 'height', 'allow', 'allowfullscreen', 'loading', 'referrerpolicy'],
    },
    exclusiveFilter(frame) {
      return frame.tag === 'iframe' && !isAllowedIframeUrl(frame.attribs.src)
    },
  })
}

/** Keep SVG static: no scripts, links, styles, animation, or foreignObject. */
export function sanitizeSvg(value: string): string | null {
  if (!/^\s*<svg(?:\s|>)/i.test(value) || value.length > 10 * 1024 * 1024) return null
  const clean = sanitizeHtml(value, {
    allowedTags: ['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'title', 'desc', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern'],
    allowedAttributes: {
      svg: ['xmlns', 'viewBox', 'width', 'height', 'role', 'aria-label', 'focusable'],
      '*': ['id', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity', 'transform', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'clipPathUnits', 'maskUnits'],
    },
    allowedSchemes: [],
    disallowedTagsMode: 'discard',
  })
  if (!/^\s*<svg(?:\s|>)/i.test(clean)) return null
  if (/(?:<\/?(?:script|foreignobject|animate|set|style|iframe|object|embed)\b|\bon\w+\s*=|\b(?:href|xlink:href)\s*=|\b(?:data|javascript|https?):)/i.test(clean)) return null
  return clean
}

/** Recursively normalize Puck documents before persistence. */
export function sanitizePuckDocument<T extends Record<string, unknown>>(document: T): T {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit)
    if (!value || typeof value !== 'object') return value
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) out[key] = visit(child)
    if (out.type === 'RichText' && out.props && typeof out.props === 'object') {
      ;(out.props as Record<string, unknown>).html = sanitizeRichText((out.props as Record<string, unknown>).html)
    }
    if (out.type === 'CodeEmbed' && out.props && typeof out.props === 'object') {
      ;(out.props as Record<string, unknown>).html = sanitizeEmbedHtml((out.props as Record<string, unknown>).html)
    }
    return out
  }
  return visit(document) as T
}

/** True if a Puck document carries custom CSS/JS snippets. */
export function hasPrivilegedPageContent(document: unknown): boolean {
  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(visit)
    if (!value || typeof value !== 'object') return false
    const obj = value as Record<string, unknown>
    if (obj.props && typeof obj.props === 'object' && Array.isArray((obj.props as { snippets?: unknown }).snippets)) return true
    return Object.values(obj).some(visit)
  }
  return visit(document)
}

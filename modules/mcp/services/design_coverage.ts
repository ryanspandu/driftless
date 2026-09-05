import { mediaUrlPrefix } from '#services/media_url'
import { PLACEHOLDER_HOSTS } from '#modules/mcp/services/image_url_guard'

/**
 * Compares a built page against the design brief the AI recorded, and reports
 * where the build drifts from the reference. Because the MCP has no eyes on the
 * rendered page, this structural check is the primary fidelity gate: it catches
 * the failures that made past builds look off-brand — a CTA still on the theme
 * default colour, a section from the design that never got built, a placeholder
 * or external image, an emoji where the design wants a real icon.
 *
 * Pure/synchronous over already-loaded data (page content + brief + theme) so it
 * is trivial to unit-test; the controller supplies the inputs.
 */

export interface CoverageInput {
  /** The page content to inspect (draft preferred over published). */
  content: unknown
  /** The recorded brief (palette, iconStyle, sections, assets). */
  brief: Record<string, unknown> | null
  /** The EFFECTIVE theme primary/secondary a block renders with. */
  themeEffective: { primary: string; secondary: string }
}

export interface CoverageReport {
  hasBrief: boolean
  coverage: number
  /** Design sections the brief lists that were not found in the build. */
  missing: string[]
  /** Colours/CTAs/icons that don't match the brief. */
  offBrand: string[]
  /** Images that are placeholders / external / not in the brief's assets. */
  substitutions: string[]
  summary: string
}

interface Block {
  type?: unknown
  props?: Record<string, unknown>
  [k: string]: unknown
}

const EMOJI = /\p{Extended_Pictographic}/u

function eq(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
}

function textOf(props: Record<string, unknown>): string {
  const parts: string[] = []
  for (const key of ['text', 'title', 'heading', 'label', 'subtitle']) {
    const v = props[key]
    if (typeof v === 'string') parts.push(v)
  }
  return parts.join(' ')
}

function imageUrl(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string')
    return (v as { url: string }).url
  return undefined
}

function isExternal(url: string, prefix: string): { external: boolean; host?: string; placeholder?: boolean } {
  const u = url.trim()
  if (!u || u.startsWith('/') || u.startsWith(prefix) || u.startsWith('data:')) return { external: false }
  try {
    const host = new URL(u).hostname.toLowerCase()
    const placeholder = PLACEHOLDER_HOSTS.some((h) => host === h || host.endsWith('.' + h))
    return { external: true, host, placeholder }
  } catch {
    return { external: false }
  }
}

/** Depth-first collect of every block node under `content`. */
function collect(content: unknown, out: Block[]): void {
  if (!Array.isArray(content)) return
  for (const node of content) {
    if (!node || typeof node !== 'object') continue
    const block = node as Block
    out.push(block)
    const props = (block.props ?? {}) as Record<string, unknown>
    for (const v of Object.values(props)) {
      if (Array.isArray(v)) collect(v, out)
    }
  }
}

/** Top-level Section blocks (the design's bands), in order. */
function topSections(content: unknown): Block[] {
  if (!Array.isArray(content)) return []
  return content.filter((n) => n && typeof n === 'object' && (n as Block).type === 'Section') as Block[]
}

function sectionText(section: Block): string {
  const nodes: Block[] = []
  collect([section], nodes)
  return nodes.map((n) => textOf((n.props ?? {}) as Record<string, unknown>)).join(' ').toLowerCase()
}

export function checkDesignCoverage(input: CoverageInput): CoverageReport {
  const { brief, themeEffective } = input
  const prefix = mediaUrlPrefix()
  const all: Block[] = []
  collect(input.content, all)

  const missing: string[] = []
  const offBrand: string[] = []
  const substitutions: string[] = []

  if (!brief) {
    return {
      hasBrief: false,
      coverage: 0,
      missing: [],
      offBrand: [],
      substitutions: [],
      summary:
        'No design brief recorded for this page. Call set_design_brief first (palette, iconStyle, the design’s sections + asset slots) so coverage can be checked.',
    }
  }

  // ── Sections ────────────────────────────────────────────────────────────
  const briefSections = Array.isArray(brief.sections) ? (brief.sections as Array<Record<string, unknown>>) : []
  const builtSections = topSections(input.content)
  let matched = 0
  briefSections.forEach((bs, i) => {
    const key = String(bs.key ?? bs.recipe ?? `section ${i + 1}`)
    const headline = typeof bs.headline === 'string' ? bs.headline.trim().toLowerCase() : ''
    const built = builtSections[i]
    if (!built) {
      missing.push(`section "${key}" is not built (the design has ${briefSections.length} sections, the page has ${builtSections.length})`)
      return
    }
    if (headline && !sectionText(built).includes(headline.slice(0, 24))) {
      // Present positionally but the headline text isn't there — likely wrong section.
      missing.push(`section "${key}" headline "${bs.headline}" not found where expected`)
      return
    }
    matched++
  })
  const coverage = briefSections.length ? matched / briefSections.length : builtSections.length ? 1 : 0

  // ── Palette / CTAs ──────────────────────────────────────────────────────
  const palette = (brief.palette ?? {}) as Record<string, unknown>
  const briefPrimary = typeof palette.primary === 'string' ? palette.primary : ''
  if (briefPrimary && !eq(briefPrimary, themeEffective.primary)) {
    const themedButtons = all.filter((b) => {
      if (b.type !== 'Button') return false
      const variant = String((b.props as Record<string, unknown>)?.variant ?? 'primary')
      return variant === 'primary' || variant === 'secondary'
    })
    if (themedButtons.length) {
      offBrand.push(
        `${themedButtons.length} Button(s) use the theme colour (${themeEffective.primary}) but the brief primary is ${briefPrimary} — call set_appearance({ primaryColor: "${briefPrimary}" }), or set those Buttons to variant:"custom" with bg/textColor`
      )
    }
  }

  // Colours used in styleProps that aren't in the brief palette (and aren't vars).
  const paletteHexes = new Set(
    Object.values(palette)
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim().toLowerCase())
  )
  const offColours = new Set<string>()
  for (const b of all) {
    const props = (b.props ?? {}) as Record<string, unknown>
    for (const key of ['bg', 'textColor', 'borderColor']) {
      const v = props[key]
      if (typeof v !== 'string') continue
      const c = v.trim().toLowerCase()
      if (!c || c.startsWith('var(') || c.startsWith('transparent')) continue
      if (paletteHexes.size && !paletteHexes.has(c)) offColours.add(c)
    }
  }
  if (offColours.size) {
    offBrand.push(
      `colour(s) not in the brief palette: ${[...offColours].slice(0, 8).join(', ')} — reference the palette (var(--primary)/var(--color-<slug>)) or add them to the brief`
    )
  }

  // ── Icons ───────────────────────────────────────────────────────────────
  const iconStyle = typeof brief.iconStyle === 'string' ? brief.iconStyle : ''
  if (iconStyle && iconStyle !== 'emoji') {
    const emojiIcons = all.filter(
      (b) => b.type === 'Icon' && EMOJI.test(String((b.props as Record<string, unknown>)?.name ?? ''))
    )
    if (emojiIcons.length) {
      offBrand.push(
        `${emojiIcons.length} Icon(s) use an emoji but the brief iconStyle is "${iconStyle}" — use a curated key coloured with textColor, or crop_media/upload the design's icon and set Icon src`
      )
    }
  }

  // ── Images ──────────────────────────────────────────────────────────────
  const briefAssetUrls = new Set(
    (Array.isArray(brief.assets) ? (brief.assets as Array<Record<string, unknown>>) : [])
      .map((a) => (typeof a.url === 'string' ? a.url.trim() : ''))
      .filter(Boolean)
  )
  const seen = new Set<string>()
  const consider = (url: string | undefined, where: string) => {
    const u = (url ?? '').trim()
    if (!u || seen.has(u)) return
    seen.add(u)
    const info = isExternal(u, prefix)
    if (info.placeholder) {
      substitutions.push(`${where} is a placeholder/stock image (${info.host}) — replace with the real asset (crop_media from the reference)`)
    } else if (info.external && !briefAssetUrls.has(u)) {
      substitutions.push(`${where} is an external URL (${info.host}) not listed in the brief assets — upload_media it or add it to the brief`)
    }
  }
  for (const b of all) {
    const props = (b.props ?? {}) as Record<string, unknown>
    if (b.type === 'Image') consider(imageUrl(props.src), 'an Image src')
    if (Array.isArray(props.backgrounds)) {
      for (const layer of props.backgrounds) {
        if (layer && typeof layer === 'object' && (layer as { type?: unknown }).type === 'image') {
          consider((layer as { url?: unknown }).url as string | undefined, 'a Section background image')
        }
      }
    }
  }

  const total = missing.length + offBrand.length + substitutions.length
  const summary =
    total === 0
      ? `Coverage ${Math.round(coverage * 100)}%. No mismatches against the brief.`
      : `Coverage ${Math.round(coverage * 100)}%. ${missing.length} missing section(s), ${offBrand.length} off-brand item(s), ${substitutions.length} image substitution(s). Fix these before publishing.`

  return { hasBrief: true, coverage, missing, offBrand, substitutions, summary }
}

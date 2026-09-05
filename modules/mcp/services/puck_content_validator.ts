import { randomUUID } from 'node:crypto'
import {
  loadCatalog,
  type CatalogBlock,
  type CatalogTarget,
} from '#modules/mcp/services/block_catalog'
import ModulesService from '#services/modules_service'
import { mediaUrlPrefix } from '#services/media_url'
import { PLACEHOLDER_HOSTS } from '#modules/mcp/services/image_url_guard'

/**
 * Structural validator for Puck documents submitted through the builder-API.
 *
 * The core services (`PagesService`, `TemplatesService`) sanitise HTML inside a
 * document but never check its *shape* — an AI client could otherwise store a
 * tree full of block types the builder cannot render. This closes that gap:
 * every node's `type` must exist in the emitted block catalog, every node gets
 * a stable `props.id`, and slot props must hold arrays of valid nodes.
 *
 * It is deliberately forgiving about unknown *props* (the builder ignores
 * extras) and only fails on structural errors an editor could not produce.
 */

export interface ValidationIssue {
  path: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  /** True when no catalog is present, so nothing was actually checked. */
  skipped: boolean
  issues: ValidationIssue[]
  /**
   * Non-blocking advisories — the document still publishes. Used for image
   * quality signals (an external CDN URL that isn't self-hosted, an empty image
   * slot) that an AI should fix for fidelity but that aren't structural errors.
   */
  warnings: ValidationIssue[]
  /** The document with every node's `props.id` filled in. */
  normalized: PuckDocument
}

export interface PuckDocument {
  root?: { props?: Record<string, unknown> } & Record<string, unknown>
  content?: PuckNode[]
  zones?: Record<string, PuckNode[]>
  [key: string]: unknown
}

interface PuckNode {
  type?: unknown
  props?: Record<string, unknown>
  [key: string]: unknown
}

export async function validatePuckDocument(
  input: unknown,
  target: CatalogTarget
): Promise<ValidationResult> {
  const catalog = await loadCatalog(target)
  const doc = coerceDocument(input)

  if (!catalog) {
    // No catalog emitted yet — normalise ids but don't reject anything.
    normalizeIds(doc.content ?? [])
    for (const zone of Object.values(doc.zones ?? {})) normalizeIds(zone)
    return { valid: true, skipped: true, issues: [], warnings: [], normalized: doc }
  }

  const byType = new Map<string, CatalogBlock>(catalog.blocks.map((b) => [b.type, b]))
  const issues: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  // Which modules are enabled right now — a block from a disabled module would
  // validate structurally but render nothing, so reject it with a clear message.
  const enabledMap = await new ModulesService().enabledMap()
  const enabledModules = new Set(
    [...enabledMap.entries()].filter(([, on]) => on).map(([name]) => name)
  )

  const ctx: WalkCtx = {
    byType,
    enabledModules,
    issues,
    warnings,
    mediaPrefix: mediaUrlPrefix(),
  }

  const content = doc.content
  if (content !== undefined && !Array.isArray(content)) {
    issues.push({ path: 'content', message: '`content` must be an array of blocks' })
  } else {
    walk(content ?? [], 'content', ctx)
  }

  // Legacy DropZone map — walk each zone the same way if present.
  if (doc.zones && typeof doc.zones === 'object') {
    for (const [zone, nodes] of Object.entries(doc.zones)) {
      if (!Array.isArray(nodes)) {
        issues.push({ path: `zones.${zone}`, message: 'zone must be an array of blocks' })
        continue
      }
      walk(nodes, `zones.${zone}`, ctx)
    }
  }

  return { valid: issues.length === 0, skipped: false, issues, warnings, normalized: doc }
}

/** Shared state threaded through the recursive walk. */
interface WalkCtx {
  byType: Map<string, CatalogBlock>,
  enabledModules: Set<string>
  issues: ValidationIssue[]
  warnings: ValidationIssue[]
  /** URL prefix under which self-hosted media lives (e.g. "/uploads"). */
  mediaPrefix: string
}

function walk(nodes: PuckNode[], path: string, ctx: WalkCtx): void {
  const { byType, enabledModules, issues } = ctx
  nodes.forEach((node, i) => {
    const at = `${path}[${i}]`
    if (!node || typeof node !== 'object') {
      issues.push({ path: at, message: 'block must be an object' })
      return
    }

    const type = node.type
    if (typeof type !== 'string' || !type) {
      issues.push({ path: at, message: 'block is missing a string `type`' })
      return
    }

    const block = byType.get(type)
    if (!block) {
      issues.push({ path: at, message: `unknown block type "${type}"` })
      return
    }

    // A block from a module that isn't enabled won't render — reject it so the
    // page can't publish into a silently-empty state.
    if (block.module && !enabledModules.has(block.module)) {
      issues.push({
        path: at,
        message: `block "${type}" needs the "${block.module}" module, which is not enabled — enable it or use a core block`,
      })
      return
    }

    if (!node.props || typeof node.props !== 'object') node.props = {}
    const props = node.props as Record<string, unknown>
    if (typeof props.id !== 'string' || !props.id) props.id = `${type}-${randomUUID()}`

    // Image-URL pass: a placeholder/stock host is a hard error (it will render
    // off-brand); any other external URL that isn't self-hosted is a warning
    // (a legit CDN may be intentional); an empty Image src is a warning.
    checkImageUrls(type, props, at, ctx)

    // Forgive a very common authoring mistake: nesting a block's children in a
    // TOP-LEVEL slot array (a sibling of `props`, mirroring the page root's
    // `content`) instead of inside `props.<slot>`. The renderer only reads
    // `props.<slot>`, so left as-is the block validates and publishes but renders
    // EMPTY. Migrate the misplaced array into props so it actually renders.
    for (const slot of block.slots) {
      const misplaced = (node as Record<string, unknown>)[slot]
      if (props[slot] === undefined && Array.isArray(misplaced)) {
        props[slot] = misplaced
        delete (node as Record<string, unknown>)[slot]
      }
    }

    // Recurse into every slot prop the catalog declares for this block.
    for (const slot of block.slots) {
      const value = props[slot]
      if (value === undefined || value === null) continue
      if (!Array.isArray(value)) {
        issues.push({ path: `${at}.props.${slot}`, message: 'slot must be an array of blocks' })
        continue
      }
      walk(value as PuckNode[], `${at}.props.${slot}`, ctx)
    }
  })
}

/** Extract a string URL from an Image `src` (a string, or `{ url }` object). */
function imageSrcUrl(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string') {
    return (v as { url: string }).url
  }
  return undefined
}

/** Judge one candidate image URL, pushing an issue or warning as appropriate. */
function judgeImageUrl(raw: string | undefined, at: string, label: string, ctx: WalkCtx): void {
  const url = (raw ?? '').trim()
  if (!url) {
    ctx.warnings.push({ path: at, message: `${label} is empty — set it to an upload_media / crop_media url` })
    return
  }
  // Relative / self-hosted paths are fine.
  if (url.startsWith('/') || url.startsWith(ctx.mediaPrefix) || url.startsWith('data:')) return
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return // not an absolute URL we can judge — leave it
  }
  const isPlaceholder = PLACEHOLDER_HOSTS.some((h) => host === h || host.endsWith('.' + h))
  if (isPlaceholder) {
    ctx.issues.push({
      path: at,
      message: `${label} points at ${host}, a placeholder/stock service — replace it with the real asset via upload_media (or crop_media from the design reference)`,
    })
    return
  }
  ctx.warnings.push({
    path: at,
    message: `${label} is an external URL (${host}); prefer upload_media so it is self-hosted and reliably loads`,
  })
}

/**
 * Collect image URLs from the props known to carry them and judge each. Covers
 * Image `src`, a `backgrounds` layer stack's image layers, and array props whose
 * items carry an `src` (Slider/Carousel/Gallery slides). Best-effort by prop
 * name — unknown props are ignored, matching the validator's forgiving stance.
 */
function checkImageUrls(type: string, props: Record<string, unknown>, at: string, ctx: WalkCtx): void {
  if (type === 'Image' && 'src' in props) {
    judgeImageUrl(imageSrcUrl(props.src), `${at}.props.src`, 'Image src', ctx)
  }

  const backgrounds = props.backgrounds
  if (Array.isArray(backgrounds)) {
    backgrounds.forEach((layer, i) => {
      if (layer && typeof layer === 'object' && (layer as { type?: unknown }).type === 'image') {
        judgeImageUrl(
          (layer as { url?: unknown }).url as string | undefined,
          `${at}.props.backgrounds[${i}].url`,
          'Background image',
          ctx
        )
      }
    })
  }

  // Slide/gallery arrays: any array of objects that carry an `src`.
  for (const [key, value] of Object.entries(props)) {
    if (key === 'backgrounds' || !Array.isArray(value)) continue
    value.forEach((item, i) => {
      if (item && typeof item === 'object' && 'src' in (item as Record<string, unknown>)) {
        judgeImageUrl(
          imageSrcUrl((item as Record<string, unknown>).src),
          `${at}.props.${key}[${i}].src`,
          `${key} image`,
          ctx
        )
      }
    })
  }
}

/** Fill `props.id` everywhere without any catalog knowledge (fallback path). */
function normalizeIds(nodes: PuckNode[]): void {
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    if (!node.props || typeof node.props !== 'object') node.props = {}
    const props = node.props as Record<string, unknown>
    const type = typeof node.type === 'string' ? node.type : 'block'
    if (typeof props.id !== 'string' || !props.id) props.id = `${type}-${randomUUID()}`
    for (const value of Object.values(props)) {
      if (Array.isArray(value)) normalizeIds(value as PuckNode[])
    }
  }
}

function coerceDocument(input: unknown): PuckDocument {
  if (!input || typeof input !== 'object') return { content: [], root: { props: {} } }
  return input as PuckDocument
}

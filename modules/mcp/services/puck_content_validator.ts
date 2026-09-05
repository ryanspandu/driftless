import { randomUUID } from 'node:crypto'
import {
  loadCatalog,
  type CatalogBlock,
  type CatalogTarget,
} from '#modules/mcp/services/block_catalog'
import ModulesService from '#services/modules_service'

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
    return { valid: true, skipped: true, issues: [], normalized: doc }
  }

  const byType = new Map<string, CatalogBlock>(catalog.blocks.map((b) => [b.type, b]))
  const issues: ValidationIssue[] = []

  // Which modules are enabled right now — a block from a disabled module would
  // validate structurally but render nothing, so reject it with a clear message.
  const enabledMap = await new ModulesService().enabledMap()
  const enabledModules = new Set(
    [...enabledMap.entries()].filter(([, on]) => on).map(([name]) => name)
  )

  const content = doc.content
  if (content !== undefined && !Array.isArray(content)) {
    issues.push({ path: 'content', message: '`content` must be an array of blocks' })
  } else {
    walk(content ?? [], 'content', byType, enabledModules, issues)
  }

  // Legacy DropZone map — walk each zone the same way if present.
  if (doc.zones && typeof doc.zones === 'object') {
    for (const [zone, nodes] of Object.entries(doc.zones)) {
      if (!Array.isArray(nodes)) {
        issues.push({ path: `zones.${zone}`, message: 'zone must be an array of blocks' })
        continue
      }
      walk(nodes, `zones.${zone}`, byType, enabledModules, issues)
    }
  }

  return { valid: issues.length === 0, skipped: false, issues, normalized: doc }
}

function walk(
  nodes: PuckNode[],
  path: string,
  byType: Map<string, CatalogBlock>,
  enabledModules: Set<string>,
  issues: ValidationIssue[]
): void {
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

    // Recurse into every slot prop the catalog declares for this block.
    for (const slot of block.slots) {
      const value = props[slot]
      if (value === undefined || value === null) continue
      if (!Array.isArray(value)) {
        issues.push({ path: `${at}.props.${slot}`, message: 'slot must be an array of blocks' })
        continue
      }
      walk(value as PuckNode[], `${at}.props.${slot}`, byType, enabledModules, issues)
    }
  })
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

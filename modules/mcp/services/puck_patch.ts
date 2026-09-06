/**
 * Apply block-addressed edit operations to a Puck document.
 *
 * The builder-API's page writes are whole-document: to change one block the AI
 * had to re-emit the entire tree from memory, so blocks it didn't reproduce
 * perfectly drifted every revision. These ops let it patch the stored draft by a
 * block's stable `props.id` instead — small diffs that don't disturb the rest of
 * the page. The caller re-validates the result and saves it as the draft.
 */

export interface PuckNode {
  type?: unknown
  props?: Record<string, unknown>
  [key: string]: unknown
}

export interface PuckDocument {
  root?: Record<string, unknown>
  content?: PuckNode[]
  [key: string]: unknown
}

export interface PatchOp {
  op: 'update_props' | 'update_style' | 'insert' | 'move' | 'remove'
  /** Target block id (update_props/update_style/move/remove). */
  id?: string
  /** Fields/styleProps to MERGE into the target's props (update_props/update_style). */
  props?: Record<string, unknown>
  /** The block to add (insert). */
  block?: PuckNode
  /** Parent block id to insert/move INTO; omit for the document root. */
  parentId?: string
  /** Slot name on the parent (default "content"). */
  slot?: string
  /** Position within the target array (default: append). */
  index?: number
}

export interface PatchResult {
  doc: PuckDocument
  applied: string[]
  errors: string[]
}

interface Found {
  node: PuckNode
  parent: PuckNode[]
  index: number
}

/** Depth-first search for a block by its props.id; returns it with its holder. */
function findById(arr: PuckNode[] | undefined, id: string): Found | null {
  if (!Array.isArray(arr)) return null
  for (let i = 0; i < arr.length; i++) {
    const node = arr[i]
    if (!node || typeof node !== 'object') continue
    if ((node.props as Record<string, unknown>)?.id === id) return { node, parent: arr, index: i }
    for (const value of Object.values(node.props ?? {})) {
      if (Array.isArray(value)) {
        const hit = findById(value as PuckNode[], id)
        if (hit) return hit
      }
    }
  }
  return null
}

/** The array a block/slot addresses: root content, or a parent block's slot. */
function targetArray(doc: PuckDocument, parentId: string | undefined, slot: string): PuckNode[] | null {
  if (!parentId) {
    if (!Array.isArray(doc.content)) doc.content = []
    return doc.content
  }
  const parent = findById(doc.content, parentId)
  if (!parent) return null
  const props = (parent.node.props ??= {})
  if (!Array.isArray(props[slot])) props[slot] = []
  return props[slot] as PuckNode[]
}

function insertAt(arr: PuckNode[], node: PuckNode, index: number | undefined): void {
  if (typeof index === 'number' && index >= 0 && index <= arr.length) arr.splice(index, 0, node)
  else arr.push(node)
}

/**
 * Apply ops in order against a (deep-cloned) copy of the document. Each op that
 * fails is recorded in `errors` and skipped; the rest still apply, so a batch is
 * best-effort. Ids are matched anywhere in the tree.
 */
export function applyPatchOps(input: unknown, ops: PatchOp[]): PatchResult {
  const doc: PuckDocument =
    input && typeof input === 'object'
      ? structuredClone(input as PuckDocument)
      : { root: { props: {} }, content: [] }
  if (!Array.isArray(doc.content)) doc.content = []

  const applied: string[] = []
  const errors: string[] = []

  ops.forEach((op, i) => {
    const label = `ops[${i}] ${op.op}`
    try {
      switch (op.op) {
        case 'update_props':
        case 'update_style': {
          if (!op.id) throw new Error('missing "id"')
          const hit = findById(doc.content, op.id)
          if (!hit) throw new Error(`no block with id "${op.id}"`)
          hit.node.props = { ...(hit.node.props ?? {}), ...(op.props ?? {}) }
          applied.push(`${label} #${op.id}`)
          break
        }
        case 'remove': {
          if (!op.id) throw new Error('missing "id"')
          const hit = findById(doc.content, op.id)
          if (!hit) throw new Error(`no block with id "${op.id}"`)
          hit.parent.splice(hit.index, 1)
          applied.push(`${label} #${op.id}`)
          break
        }
        case 'insert': {
          if (!op.block || typeof op.block !== 'object') throw new Error('missing "block"')
          const arr = targetArray(doc, op.parentId, op.slot ?? 'content')
          if (!arr) throw new Error(`no parent block with id "${op.parentId}"`)
          insertAt(arr, op.block, op.index)
          applied.push(`${label} into ${op.parentId ?? 'root'}.${op.slot ?? 'content'}`)
          break
        }
        case 'move': {
          if (!op.id) throw new Error('missing "id"')
          const hit = findById(doc.content, op.id)
          if (!hit) throw new Error(`no block with id "${op.id}"`)
          const arr = targetArray(doc, op.parentId, op.slot ?? 'content')
          if (!arr) throw new Error(`no parent block with id "${op.parentId}"`)
          hit.parent.splice(hit.index, 1)
          insertAt(arr, hit.node, op.index)
          applied.push(`${label} #${op.id} → ${op.parentId ?? 'root'}.${op.slot ?? 'content'}`)
          break
        }
        default:
          throw new Error(`unknown op "${(op as PatchOp).op}"`)
      }
    } catch (e) {
      errors.push(`${label}: ${(e as Error).message}`)
    }
  })

  return { doc, applied, errors }
}

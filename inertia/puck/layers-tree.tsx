import { useEffect, useMemo, useRef, useState, type ComponentType, type DragEvent } from 'react'
import { usePuck, type ComponentData, type Config } from '@measured/puck'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Square,
  Trash2,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { ICONS, LABELS } from './overrides'

/**
 * Webflow-style Layers tree for the builder's right-panel "Layers" tab.
 *
 * Built directly from Puck's data (`appState.data.content`, recursing into each
 * component's `slot` props) so we control every row — needed for rename,
 * drag-reorder, and later visibility / lock. Selection, rename, reorder, and
 * expand/collapse are wired through `usePuck()`.
 *
 * Custom metadata lives on the component's own props under `_`-prefixed keys
 * (here `_label`), so it travels with the page JSON — no schema/DB migration.
 */

interface TreeNode {
  id: string
  type: string
  label: string
  hidden: boolean
  locked: boolean
  /** True when the component type has a slot — i.e. it can hold children. */
  isContainer: boolean
  children: TreeNode[]
}

type RawItem = { type: string; props?: Record<string, unknown> }
type DropPos = 'before' | 'after' | 'inside'

/** Slot field names for a component type (Puck `type: 'slot'` fields). */
function slotFieldsFor(type: string, config: Config): string[] {
  const fields = config.components?.[type]?.fields
  if (!fields) return []
  return Object.entries(fields)
    .filter(([, f]) => (f as { type?: string } | undefined)?.type === 'slot')
    .map(([key]) => key)
}

function buildTree(items: RawItem[] | undefined, config: Config): TreeNode[] {
  if (!Array.isArray(items)) return []
  const out: TreeNode[] = []
  for (const item of items) {
    const props = (item.props ?? {}) as Record<string, unknown>
    const id = typeof props.id === 'string' ? props.id : null
    if (!id) continue
    const slots = slotFieldsFor(item.type, config)
    const children = slots.flatMap((slot) =>
      buildTree(props[slot] as RawItem[] | undefined, config)
    )
    const custom = typeof props._label === 'string' ? props._label.trim() : ''
    const configLabel = (config.components?.[item.type] as { label?: string } | undefined)?.label
    out.push({
      id,
      type: item.type,
      label: custom || configLabel || LABELS[item.type] || item.type,
      hidden: props._hidden === true,
      locked: props._locked === true,
      isContainer: slots.length > 0,
      children,
    })
  }
  return out
}

/** Map of node id → set of all its descendant ids (used to block invalid drops). */
function buildDescendants(tree: TreeNode[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  const collect = (node: TreeNode): Set<string> => {
    const set = new Set<string>()
    for (const child of node.children) {
      set.add(child.id)
      for (const d of collect(child)) set.add(d)
    }
    map.set(node.id, set)
    return set
  }
  for (const node of tree) collect(node)
  return map
}

/** How many layers a delete would take with it. */
function countDescendants(node: TreeNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0)
}

/** Map of node id → its ancestor ids, outermost first. Used to reveal a selection. */
function buildAncestors(tree: TreeNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  const walk = (nodes: TreeNode[], chain: string[]) => {
    for (const node of nodes) {
      map.set(node.id, chain)
      if (node.children.length > 0) walk(node.children, [...chain, node.id])
    }
  }
  walk(tree, [])
  return map
}

export function LayersTree() {
  const { appState, config, dispatch, getSelectorForId, getItemById, selectedItem } = usePuck()

  const content = appState.data.content as unknown as RawItem[] | undefined
  const tree = useMemo(() => buildTree(content, config), [content, config])
  const descendants = useMemo(() => buildDescendants(tree), [tree])
  const selectedId = (selectedItem?.props as { id?: string } | undefined)?.id ?? null

  const ancestors = useMemo(() => buildAncestors(tree), [tree])

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: DropPos } | null>(null)

  const treeRef = useRef<HTMLDivElement>(null)
  /**
   * The last selection we scrolled to.
   *
   * Without it the scroll effect — which has to watch `collapsed`, since the row
   * does not exist in the DOM until its ancestors expand — would also fire every
   * time the author collapses something by hand, yanking the panel back to the
   * selection they were not looking at.
   */
  const revealedRef = useRef<string | null>(null)

  /**
   * Reveal whatever is selected, however it got selected.
   *
   * Clicking a block on the canvas sets Puck's `itemSelector`, but the tree had
   * no reaction to that: a selection nested inside a collapsed branch stayed
   * invisible, so the panel showed no relationship between what was clicked and
   * where it lives.
   *
   * Adjusted during render rather than in an effect — React's documented pattern
   * for deriving state from a changed input. It runs before paint, so the row
   * never appears in the wrong place first, and it fires only on the frame the
   * selection actually changes, which is what keeps the expansion **one-shot**:
   * collapsing an ancestor by hand afterwards is not immediately undone.
   */
  const [lastSelected, setLastSelected] = useState<string | null>(selectedId)
  if (selectedId !== lastSelected) {
    setLastSelected(selectedId)
    const chain = selectedId ? (ancestors.get(selectedId) ?? []) : []
    if (chain.some((id) => collapsed.has(id))) {
      setCollapsed((prev) => {
        const next = new Set(prev)
        for (const id of chain) next.delete(id)
        return next
      })
    }
  }

  useEffect(() => {
    // Cleared here rather than during render so re-selecting the same block
    // after a deselect still scrolls to it — and so nothing touches a ref while
    // rendering.
    if (!selectedId) {
      revealedRef.current = null
      return
    }
    if (revealedRef.current === selectedId) return
    const row = treeRef.current?.querySelector(`[data-layer-id="${CSS.escape(selectedId)}"]`)
    // Absent while its ancestors are still collapsed; the expand above re-runs
    // this effect once they open.
    if (!row) return
    revealedRef.current = selectedId
    row.scrollIntoView({ block: 'nearest' })
  }, [selectedId, collapsed])

  const select = (id: string) => {
    const sel = getSelectorForId(id)
    if (sel) dispatch({ type: 'setUi', ui: { itemSelector: sel } })
  }

  const rename = (id: string, label: string) => {
    const sel = getSelectorForId(id)
    const item = getItemById(id)
    if (!sel || !item) return
    const nextProps = { ...(item.props as Record<string, unknown>) }
    const trimmed = label.trim()
    if (trimmed) nextProps._label = trimmed
    else delete nextProps._label
    dispatch({
      type: 'replace',
      destinationZone: sel.zone,
      destinationIndex: sel.index,
      data: { ...item, props: nextProps } as ComponentData,
    })
  }

  const toggleHidden = (id: string) => {
    const sel = getSelectorForId(id)
    const item = getItemById(id)
    if (!sel || !item) return
    const props = item.props as Record<string, unknown>
    const nextProps = { ...props }
    if (props._hidden) delete nextProps._hidden
    else nextProps._hidden = true
    dispatch({
      type: 'replace',
      destinationZone: sel.zone,
      destinationIndex: sel.index,
      data: { ...item, props: nextProps } as ComponentData,
    })
  }

  const toggleLocked = (id: string) => {
    const sel = getSelectorForId(id)
    const item = getItemById(id)
    if (!sel || !item) return
    const props = item.props as Record<string, unknown>
    const nextProps = { ...props }
    if (props._locked) delete nextProps._locked
    else nextProps._locked = true
    dispatch({
      type: 'replace',
      destinationZone: sel.zone,
      destinationIndex: sel.index,
      data: { ...item, props: nextProps } as ComponentData,
    })
  }

  const remove = (id: string) => {
    const sel = getSelectorForId(id)
    if (!sel) return
    // Clear selection first if we're deleting the selected layer (avoids a stale
    // selectedItem in the Detail panel between dispatches).
    if (selectedId === id) dispatch({ type: 'setUi', ui: { itemSelector: null } })
    dispatch({ type: 'remove', index: sel.index, zone: sel.zone })
  }

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // True when `targetId` is a valid place to drop the dragged node.
  const canDrop = (targetId: string) =>
    !!dragId && targetId !== dragId && !descendants.get(dragId)?.has(targetId)

  const resetDrag = () => {
    setDragId(null)
    setDropTarget(null)
  }

  const onRowDragOver = (e: DragEvent<HTMLDivElement>, targetId: string, isContainer: boolean) => {
    if (!canDrop(targetId)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    let pos: DropPos
    if (isContainer) {
      // Top / bottom thirds = sibling before/after; middle = drop INSIDE — the
      // only way to fill an (often empty) container from the tree.
      if (y < rect.height * 0.3) pos = 'before'
      else if (y > rect.height * 0.7) pos = 'after'
      else pos = 'inside'
    } else {
      pos = y < rect.height / 2 ? 'before' : 'after'
    }
    setDropTarget((prev) =>
      prev && prev.id === targetId && prev.pos === pos ? prev : { id: targetId, pos }
    )
  }

  // Drop INTO a container: address its first slot zone (`${id}:${slot}`) and
  // append — works even when the container is currently empty.
  const dropInside = (containerId: string, src: { index: number; zone: string }) => {
    const item = getItemById(containerId)
    const slot = slotFieldsFor(item?.type ?? '', config)[0]
    if (!slot) return
    const destZone = `${containerId}:${slot}`
    const arr = (item?.props as Record<string, unknown> | undefined)?.[slot]
    let destIndex = Array.isArray(arr) ? arr.length : 0
    if (src.zone === destZone) {
      if (src.index < destIndex) destIndex -= 1
      if (destIndex !== src.index) {
        dispatch({
          type: 'reorder',
          sourceIndex: src.index,
          destinationIndex: destIndex,
          destinationZone: destZone,
        })
      }
    } else {
      dispatch({
        type: 'move',
        sourceIndex: src.index,
        sourceZone: src.zone,
        destinationIndex: destIndex,
        destinationZone: destZone,
      })
    }
  }

  const onRowDrop = () => {
    if (!dragId || !dropTarget || !canDrop(dropTarget.id)) return resetDrag()
    const src = getSelectorForId(dragId)
    if (!src) return resetDrag()

    if (dropTarget.pos === 'inside') {
      dropInside(dropTarget.id, src)
      return resetDrag()
    }

    const tgt = getSelectorForId(dropTarget.id)
    if (!tgt) return resetDrag()
    const destZone = tgt.zone
    let destIndex = dropTarget.pos === 'after' ? tgt.index + 1 : tgt.index
    if (src.zone === destZone) {
      // Removing the source first shifts everything after it down by one.
      if (src.index < destIndex) destIndex -= 1
      if (destIndex !== src.index) {
        dispatch({
          type: 'reorder',
          sourceIndex: src.index,
          destinationIndex: destIndex,
          destinationZone: destZone,
        })
      }
    } else {
      dispatch({
        type: 'move',
        sourceIndex: src.index,
        sourceZone: src.zone,
        destinationIndex: destIndex,
        destinationZone: destZone,
      })
    }
    resetDrag()
  }

  if (tree.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-sm text-muted-foreground">
        No layers yet. Drop a component on the canvas to get started.
      </div>
    )
  }

  return (
    <div ref={treeRef} className="p-1.5" onDragEnd={resetDrag}>
      {tree.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          collapsed={collapsed}
          dropTarget={dropTarget}
          onSelect={select}
          onToggle={toggle}
          onRename={rename}
          onDelete={remove}
          onToggleHidden={toggleHidden}
          onToggleLocked={toggleLocked}
          onDragStartRow={setDragId}
          onDragOverRow={onRowDragOver}
          onDropRow={onRowDrop}
        />
      ))}
    </div>
  )
}

/**
 * Delete, with the confirmation anchored to the row it belongs to.
 *
 * A centred modal for a per-row action costs the author their place: it dims the
 * tree they were reading and puts the question somewhere other than the thing
 * being questioned. A popover beside the trash keeps the row, its label and its
 * position on screen visible while the question is answered.
 *
 * The count is still spelled out, because that is what the tree hides — a
 * container reads as one layer right up until it removes six.
 */
function DeleteLayerButton({
  label,
  nested,
  onConfirm,
}: {
  label: string
  nested: number
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-muted hover:text-destructive',
              open ? 'text-destructive opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
            aria-label="Delete layer"
          />
        }
      >
        <Trash2 className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="center"
        className="w-60 p-3"
        // The row behind is a click-to-select target; without this, dismissing
        // the popover would also reselect whatever it was covering.
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs leading-relaxed text-foreground">
          Delete <span className="font-medium">“{label}”</span>
          {nested > 0 ? (
            <>
              {' '}
              and the {nested} layer{nested === 1 ? '' : 's'} inside it
            </>
          ) : null}
          ?
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          You can undo this from the toolbar.
        </p>
        <div className="mt-3 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-input px-2 py-1 text-[11px] hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onConfirm()
            }}
            className="rounded-md bg-destructive px-2 py-1 text-[11px] font-medium text-white hover:opacity-90"
          >
            Delete
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TreeRow({
  node,
  depth,
  selectedId,
  collapsed,
  dropTarget,
  onSelect,
  onToggle,
  onRename,
  onDelete,
  onToggleHidden,
  onToggleLocked,
  onDragStartRow,
  onDragOverRow,
  onDropRow,
}: {
  node: TreeNode
  depth: number
  selectedId: string | null
  collapsed: Set<string>
  dropTarget: { id: string; pos: DropPos } | null
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onRename: (id: string, label: string) => void
  onDelete: (id: string) => void
  onToggleHidden: (id: string) => void
  onToggleLocked: (id: string) => void
  onDragStartRow: (id: string) => void
  onDragOverRow: (e: DragEvent<HTMLDivElement>, id: string, isContainer: boolean) => void
  onDropRow: () => void
}) {
  const Icon: ComponentType<{ className?: string }> = ICONS[node.type] ?? Square
  const hasChildren = node.children.length > 0
  const expanded = hasChildren && !collapsed.has(node.id)
  const isSelected = node.id === selectedId
  const isDropTarget = dropTarget?.id === node.id
  const [editing, setEditing] = useState(false)

  const commit = (value: string) => {
    onRename(node.id, value)
    setEditing(false)
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        data-layer-id={node.id}
        draggable={!editing && !node.locked}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', node.id)
          onDragStartRow(node.id)
        }}
        onDragOver={(e) => onDragOverRow(e, node.id, node.isContainer)}
        onDrop={(e) => {
          e.preventDefault()
          onDropRow()
        }}
        onClick={() => {
          if (!editing) onSelect(node.id)
        }}
        onDoubleClick={() => setEditing(true)}
        style={{ paddingLeft: depth * 14 + 6 }}
        className={cn(
          'group relative flex items-center gap-1.5 rounded-md py-1 pr-1.5 text-sm transition-colors',
          isSelected
            ? 'bg-primary/15 text-foreground'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        )}
      >
        {isDropTarget && dropTarget?.pos === 'inside' ? (
          <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-inset ring-primary" />
        ) : isDropTarget ? (
          <span
            className={cn(
              'pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-primary',
              dropTarget?.pos === 'before' ? 'top-0' : 'bottom-0'
            )}
          />
        ) : null}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(node.id)
            }}
            className="flex size-4 shrink-0 items-center justify-center opacity-70 hover:opacity-100"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <Icon className={cn('size-3.5 shrink-0', node.hidden ? 'opacity-30' : 'opacity-70')} />
        {editing ? (
          <input
            autoFocus
            defaultValue={node.label}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
              else if (e.key === 'Escape') setEditing(false)
            }}
            className="min-w-0 flex-1 rounded border border-input bg-background px-1 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <>
            <span
              title="Double-click to rename"
              className={cn('min-w-0 flex-1 truncate select-none', node.hidden && 'opacity-50')}
            >
              {node.label}
            </span>
            {!node.locked && (
              <DeleteLayerButton
                label={node.label}
                nested={countDescendants(node)}
                onConfirm={() => onDelete(node.id)}
              />
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleLocked(node.id)
              }}
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted',
                node.locked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              )}
              aria-label={node.locked ? 'Unlock layer' : 'Lock layer'}
            >
              {node.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleHidden(node.id)
              }}
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted',
                node.hidden ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              )}
              aria-label={node.hidden ? 'Show layer' : 'Hide layer'}
            >
              {node.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </>
        )}
      </div>
      {expanded &&
        node.children.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            collapsed={collapsed}
            dropTarget={dropTarget}
            onSelect={onSelect}
            onToggle={onToggle}
            onRename={onRename}
            onDelete={onDelete}
            onToggleHidden={onToggleHidden}
            onToggleLocked={onToggleLocked}
            onDragStartRow={onDragStartRow}
            onDragOverRow={onDragOverRow}
            onDropRow={onDropRow}
          />
        ))}
    </>
  )
}

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { router } from '@inertiajs/react'
import { toast } from 'sonner'
import { ulid } from 'ulid'
import {
  ArrowLeft,
  CornerDownRight,
  GripVertical,
  Plus,
  Save,
  Settings2,
  Trash2,
} from 'lucide-react'
import type { MenuItemDto, MenuItemInputDto, MenuItemType } from '~/types/api'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Checkbox } from '~/components/ui/checkbox'
import { AppSelect } from '~/components/ui/app-select'
import { PageHeader } from '~/components/admin/page-header'
import { useMenu, useSaveMenuItems } from '~/hooks/api/use-menus'
import { usePagesList } from '~/hooks/api/use-pages'
import { apiErrorMessage } from '~/lib/api'

/** A menu item in the editor's nested tree. `key` is a stable client id. */
interface Tree {
  key: string
  id?: string
  label: string
  type: MenuItemType
  pageId: string | null
  url: string | null
  target: '_self' | '_blank'
  openMode: 'link' | 'mega'
  children: Tree[]
}

/**
 * Where a dragged item lands. `inside` nests it as the target's child (drop on
 * a card); `before`/`after` place it as a sibling next to the target (drop on a
 * gap line) — which is also how you move an item OUT of a card, by dropping it
 * on a gap at a shallower level.
 */
type DropPos = 'before' | 'after' | 'inside'

const TYPE_OPTIONS = [
  { value: 'url', label: 'Custom URL' },
  { value: 'page', label: 'Page' },
]

// ── tree helpers (pure) ──────────────────────────────────────────────────────

function toTree(items: MenuItemDto[]): Tree[] {
  return items.map((it) => ({
    key: it.id,
    id: it.id,
    label: it.label,
    type: it.type === 'collection' ? 'url' : it.type,
    pageId: it.pageId,
    url: it.url,
    target: it.target,
    openMode: it.openMode,
    children: toTree(it.children),
  }))
}

function toInput(nodes: Tree[]): MenuItemInputDto[] {
  return nodes.map((n) => ({
    id: n.id,
    label: n.label,
    type: n.type,
    pageId: n.type === 'page' ? n.pageId : null,
    url: n.type === 'url' ? n.url : null,
    target: n.target,
    openMode: n.openMode,
    children: toInput(n.children),
  }))
}

function updateNode(nodes: Tree[], key: string, patch: Partial<Tree>): Tree[] {
  return nodes.map((n) =>
    n.key === key ? { ...n, ...patch } : { ...n, children: updateNode(n.children, key, patch) }
  )
}

function removeNode(nodes: Tree[], key: string): Tree[] {
  return nodes
    .filter((n) => n.key !== key)
    .map((n) => ({ ...n, children: removeNode(n.children, key) }))
}

/** Pull a node (with its subtree) out of the tree; returns the rest + the node. */
function extract(nodes: Tree[], key: string): [Tree[], Tree | null] {
  let removed: Tree | null = null
  const out: Tree[] = []
  for (const n of nodes) {
    if (n.key === key) {
      removed = n
      continue
    }
    const [childOut, childRemoved] = extract(n.children, key)
    if (childRemoved) removed = childRemoved
    out.push({ ...n, children: childOut })
  }
  return [out, removed]
}

function insertRel(nodes: Tree[], targetKey: string, pos: DropPos, node: Tree): Tree[] {
  const out: Tree[] = []
  for (const n of nodes) {
    if (n.key === targetKey) {
      if (pos === 'before') out.push(node, n)
      else if (pos === 'after') out.push(n, node)
      else out.push({ ...n, children: [...n.children, node] })
    } else {
      out.push({ ...n, children: insertRel(n.children, targetKey, pos, node) })
    }
  }
  return out
}

function moveNode(nodes: Tree[], dragKey: string, targetKey: string, pos: DropPos): Tree[] {
  const [without, dragged] = extract(nodes, dragKey)
  if (!dragged) return nodes
  return insertRel(without, targetKey, pos, dragged)
}

/** A node's own key plus every descendant's — the invalid drop targets for it. */
function subtreeKeys(node: Tree): Set<string> {
  const set = new Set<string>()
  const walk = (n: Tree) => {
    set.add(n.key)
    n.children.forEach(walk)
  }
  walk(node)
  return set
}

// ── row context passed down the recursive render ─────────────────────────────

interface Ctx {
  pageOptions: { value: string; label: string }[]
  expanded: Set<string>
  dragging: boolean
  dropTarget: { key: string; pos: DropPos } | null
  canDrop: (key: string) => boolean
  onDragStart: (e: DragEvent<HTMLElement>, node: Tree) => void
  onHeaderOver: (e: DragEvent<HTMLElement>, key: string) => void
  onGapOver: (e: DragEvent<HTMLElement>, key: string, pos: 'before' | 'after') => void
  onDrop: (e: DragEvent<HTMLElement>, key: string, pos: DropPos) => void
  onDragEnd: () => void
  onToggle: (key: string) => void
  onPatch: (key: string, patch: Partial<Tree>) => void
  onRemove: (key: string) => void
}

function MenuEditor({ node, ctx }: { node: Tree; ctx: Ctx }) {
  return (
    <div className="space-y-3 border-t border-border px-3 py-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Label</Label>
        <Input
          value={node.label}
          onChange={(e) => ctx.onPatch(node.key, { label: e.target.value })}
          placeholder="Menu item"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Links to</Label>
          <AppSelect
            value={node.type}
            onChange={(v) => ctx.onPatch(node.key, { type: v as MenuItemType })}
            options={TYPE_OPTIONS}
          />
        </div>
        <div className="space-y-1.5">
          {node.type === 'page' ? (
            <>
              <Label className="text-xs">Page</Label>
              <AppSelect
                value={node.pageId ?? ''}
                onChange={(v) => ctx.onPatch(node.key, { pageId: v })}
                options={ctx.pageOptions}
                placeholder="Choose a page…"
              />
            </>
          ) : (
            <>
              <Label className="text-xs">URL</Label>
              <Input
                value={node.url ?? ''}
                onChange={(e) => ctx.onPatch(node.key, { url: e.target.value })}
                placeholder="https://…  or  /about"
              />
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={node.target === '_blank'}
            onCheckedChange={(c) => ctx.onPatch(node.key, { target: c ? '_blank' : '_self' })}
          />
          Open in a new tab
        </label>
      </div>
      {node.children.length > 0 && (
        <p className="text-xs text-muted-foreground">
          This item has sub-items, so it opens automatically as a{' '}
          {node.children.some((c) => c.children.length > 0) ? 'mega panel' : 'dropdown'} on the
          site.
        </p>
      )}
    </div>
  )
}

/**
 * A drop line between/around cards. Dropping here places the dragged item as a
 * sibling next to `targetKey` — the way to reorder and to move an item out of a
 * parent (drop on a gap that sits at a shallower level).
 */
function DropGap({
  targetKey,
  pos,
  ctx,
}: {
  targetKey: string
  pos: 'before' | 'after'
  ctx: Ctx
}) {
  const active = ctx.dropTarget?.key === targetKey && ctx.dropTarget.pos === pos
  return (
    <div
      onDragOver={(e) => ctx.onGapOver(e, targetKey, pos)}
      onDrop={(e) => ctx.onDrop(e, targetKey, pos)}
      className="flex h-2.5 items-center"
      aria-hidden
    >
      <div
        className={cn(
          'h-0.5 w-full rounded transition-all',
          active ? 'h-1 bg-primary' : ctx.dragging ? 'bg-border' : 'bg-transparent'
        )}
      />
    </div>
  )
}

/** A sibling list rendered as: gap · item · gap · item · … · trailing gap. */
function NodeList({ items, depth, ctx }: { items: Tree[]; depth: number; ctx: Ctx }) {
  if (items.length === 0) return null
  return (
    <>
      {items.map((item) => (
        <div key={item.key}>
          <DropGap targetKey={item.key} pos="before" ctx={ctx} />
          <MenuNode node={item} depth={depth} ctx={ctx} />
        </div>
      ))}
      <DropGap targetKey={items[items.length - 1].key} pos="after" ctx={ctx} />
    </>
  )
}

function MenuNode({ node, depth, ctx }: { node: Tree; depth: number; ctx: Ctx }) {
  const insideActive = ctx.dropTarget?.key === node.key && ctx.dropTarget.pos === 'inside'
  const expanded = ctx.expanded.has(node.key)
  const destination =
    node.type === 'page'
      ? (ctx.pageOptions.find((o) => o.value === node.pageId)?.label ?? 'No page selected')
      : node.url || 'No URL set'

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow',
        insideActive ? 'border-primary ring-2 ring-primary' : 'border-border'
      )}
    >
      <div
        data-row
        onDragOver={(e) => ctx.onHeaderOver(e, node.key)}
        onDrop={(e) => ctx.onDrop(e, node.key, 'inside')}
        className="flex items-center gap-2 px-3 py-2.5"
      >
        <button
          type="button"
          draggable
          onDragStart={(e) => ctx.onDragStart(e, node)}
          onDragEnd={ctx.onDragEnd}
          className="cursor-grab text-muted-foreground hover:text-foreground"
          aria-label="Drag to reorder or nest"
          title="Drag me — drop on a card to nest inside it, or on a line to reorder / move out"
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {depth > 0 && (
              <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="truncate text-sm font-medium">{node.label || 'Untitled'}</span>
            {node.children.length > 0 && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {node.children.length}
              </span>
            )}
            {node.children.length > 0 && (
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                {node.children.some((c) => c.children.length > 0) ? 'mega' : 'dropdown'}
              </span>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">{destination}</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-7', expanded && 'bg-muted text-foreground')}
          onClick={() => ctx.onToggle(node.key)}
          aria-label="Edit item"
        >
          <Settings2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-destructive"
          onClick={() => ctx.onRemove(node.key)}
          aria-label="Remove item"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {expanded && <MenuEditor node={node} ctx={ctx} />}

      {node.children.length > 0 && (
        <div className="border-t border-border bg-muted/30 px-2.5 py-1">
          <NodeList items={node.children} depth={depth + 1} ctx={ctx} />
        </div>
      )}
    </div>
  )
}

export default function MenuBuilderPage({ id }: { id: string }) {
  const menuQuery = useMenu(id)
  const pagesQuery = usePagesList()
  const saveMut = useSaveMenuItems()

  const [tree, setTree] = useState<Tree[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [drag, setDrag] = useState<{ key: string; blocked: Set<string> } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ key: string; pos: DropPos } | null>(null)
  const seeded = useRef(false)

  // Seed once when the menu loads; re-seed after a save so new items get ids.
  useEffect(() => {
    if (menuQuery.data && !seeded.current) {
      setTree(toTree(menuQuery.data.items))
      seeded.current = true
    }
  }, [menuQuery.data])

  const pageOptions = useMemo(
    () => (pagesQuery.data ?? []).map((p) => ({ value: p.id, label: `${p.title} — ${p.path}` })),
    [pagesQuery.data]
  )

  const clearDrag = () => {
    setDrag(null)
    setDropTarget(null)
  }
  const canDrop = (key: string) => !!drag && !drag.blocked.has(key)

  const ctx: Ctx = {
    pageOptions,
    expanded,
    dragging: !!drag,
    dropTarget,
    canDrop,
    onDragStart: (e, node) => {
      setDrag({ key: node.key, blocked: subtreeKeys(node) })
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', node.key)
      const row = (e.currentTarget as HTMLElement).closest('[data-row]')
      if (row) e.dataTransfer.setDragImage(row as Element, 16, 16)
    },
    onHeaderOver: (e, key) => {
      if (!canDrop(key)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget((prev) =>
        prev && prev.key === key && prev.pos === 'inside' ? prev : { key, pos: 'inside' }
      )
    },
    onGapOver: (e, key, pos) => {
      if (!canDrop(key)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget((prev) => (prev && prev.key === key && prev.pos === pos ? prev : { key, pos }))
    },
    onDrop: (e, key, pos) => {
      e.preventDefault()
      if (drag && canDrop(key)) {
        const dragKey = drag.key
        setTree((prev) => moveNode(prev, dragKey, key, pos))
      }
      clearDrag()
    },
    onDragEnd: clearDrag,
    onToggle: (key) =>
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      }),
    onPatch: (key, patch) => setTree((prev) => updateNode(prev, key, patch)),
    onRemove: (key) => setTree((prev) => removeNode(prev, key)),
  }

  function addItem() {
    const key = ulid()
    setTree((prev) => [
      ...prev,
      {
        key,
        label: 'New item',
        type: 'url',
        pageId: null,
        url: '',
        target: '_self',
        openMode: 'link',
        children: [],
      },
    ])
    setExpanded((prev) => new Set(prev).add(key))
  }

  async function save() {
    try {
      const result = await saveMut.mutateAsync({ id, items: toInput(tree) })
      setTree(toTree(result.items))
      toast.success('Menu saved')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={menuQuery.data ? menuQuery.data.name : 'Menu'}
        subtitle={
          menuQuery.data
            ? `Handle: ${menuQuery.data.handle} · drop a row ONTO a card to nest it as a sub-item (its dropdown / mega items); drop on the line between cards to reorder or move it back out`
            : 'Loading…'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => router.visit('/admin/menus')}
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button className="gap-2" onClick={save} disabled={saveMut.isPending}>
              <Save className="size-4" /> Save
            </Button>
          </div>
        }
      />

      <div className="w-full">
        {tree.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            No items yet. Add one to start building this menu.
          </p>
        ) : (
          <NodeList items={tree} depth={0} ctx={ctx} />
        )}

        <Button variant="outline" className="mt-3 gap-2" onClick={addItem}>
          <Plus className="size-4" /> Add item
        </Button>
      </div>
    </div>
  )
}

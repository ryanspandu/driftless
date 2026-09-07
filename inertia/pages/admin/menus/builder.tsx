import { useEffect, useMemo, useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import { toast } from 'sonner'
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ulid } from 'ulid'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Save,
  Settings2,
  Trash2,
} from 'lucide-react'
import type { MenuItemDto, MenuItemInputDto, MenuItemType } from '~/types/api'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Checkbox } from '~/components/ui/checkbox'
import { AppSelect } from '~/components/ui/app-select'
import { PageHeader } from '~/components/admin/page-header'
import { useMenu, useSaveMenuItems } from '~/hooks/api/use-menus'
import { usePagesList } from '~/hooks/api/use-pages'
import { apiErrorMessage } from '~/lib/api'

/** A menu item flattened for editing; `depth` is its nesting level. */
interface Flat {
  key: string
  id?: string
  label: string
  type: MenuItemType
  pageId: string | null
  url: string | null
  target: '_self' | '_blank'
  openMode: 'link' | 'mega'
  depth: number
}

const TYPE_OPTIONS = [
  { value: 'url', label: 'Custom URL' },
  { value: 'page', label: 'Page' },
]

function flatten(items: MenuItemDto[], depth: number, out: Flat[]): void {
  for (const it of items) {
    out.push({
      key: it.id,
      id: it.id,
      label: it.label,
      type: it.type === 'collection' ? 'url' : it.type,
      pageId: it.pageId,
      url: it.url,
      target: it.target,
      openMode: it.openMode,
      depth,
    })
    flatten(it.children, depth + 1, out)
  }
}

function toFlat(items: MenuItemDto[]): Flat[] {
  const out: Flat[] = []
  flatten(items, 0, out)
  return out
}

/** Clamp every row to at most (previous row depth + 1) so the tree is well-formed. */
function normalizeDepths(flat: Flat[]): Flat[] {
  const out: Flat[] = []
  let prevDepth = -1 // so the first row is forced to depth 0
  for (const f of flat) {
    const depth = Math.max(0, Math.min(f.depth, prevDepth + 1))
    out.push({ ...f, depth })
    prevDepth = depth
  }
  return out
}

/** The contiguous run [index, end) that is `index` plus its deeper descendants. */
function subtreeEnd(flat: Flat[], index: number): number {
  const depth = flat[index].depth
  let end = index + 1
  while (end < flat.length && flat[end].depth > depth) end++
  return end
}

function shiftSubtree(flat: Flat[], index: number, delta: number): Flat[] {
  const end = subtreeEnd(flat, index)
  return normalizeDepths(
    flat.map((f, i) => (i >= index && i < end ? { ...f, depth: f.depth + delta } : f))
  )
}

/** Flat rows → nested tree, using an ancestor stack keyed by depth. */
function toTree(flat: Flat[]): MenuItemInputDto[] {
  const roots: MenuItemInputDto[] = []
  const stack: { depth: number; node: MenuItemInputDto }[] = []
  for (const f of flat) {
    const node: MenuItemInputDto = {
      id: f.id,
      label: f.label,
      type: f.type,
      pageId: f.type === 'page' ? f.pageId : null,
      url: f.type === 'url' ? f.url : null,
      target: f.target,
      openMode: f.openMode,
      children: [],
    }
    while (stack.length && stack[stack.length - 1].depth >= f.depth) stack.pop()
    if (stack.length) stack[stack.length - 1].node.children!.push(node)
    else roots.push(node)
    stack.push({ depth: f.depth, node })
  }
  return roots
}

interface RowProps {
  item: Flat
  index: number
  pageOptions: { value: string; label: string }[]
  expanded: boolean
  onToggle: () => void
  onPatch: (patch: Partial<Flat>) => void
  onIndent: () => void
  onOutdent: () => void
  onRemove: () => void
  canIndent: boolean
  canOutdent: boolean
}

function SortableRow({
  item,
  pageOptions,
  expanded,
  onToggle,
  onPatch,
  onIndent,
  onOutdent,
  onRemove,
  canIndent,
  canOutdent,
}: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    marginLeft: item.depth * 24,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {item.label || 'Untitled'}
          {item.openMode === 'mega' && (
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              mega
            </span>
          )}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={!canOutdent}
          onClick={onOutdent}
          aria-label="Outdent"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={!canIndent}
          onClick={onIndent}
          aria-label="Indent"
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onToggle}
          aria-label="Edit item"
        >
          <Settings2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-destructive"
          onClick={onRemove}
          aria-label="Remove item"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Label</Label>
            <Input
              value={item.label}
              onChange={(e) => onPatch({ label: e.target.value })}
              placeholder="Menu item"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Links to</Label>
              <AppSelect
                value={item.type}
                onChange={(v) => onPatch({ type: v as MenuItemType })}
                options={TYPE_OPTIONS}
              />
            </div>
            <div className="space-y-1.5">
              {item.type === 'page' ? (
                <>
                  <Label className="text-xs">Page</Label>
                  <AppSelect
                    value={item.pageId ?? ''}
                    onChange={(v) => onPatch({ pageId: v })}
                    options={pageOptions}
                    placeholder="Choose a page…"
                  />
                </>
              ) : (
                <>
                  <Label className="text-xs">URL</Label>
                  <Input
                    value={item.url ?? ''}
                    onChange={(e) => onPatch({ url: e.target.value })}
                    placeholder="https://…  or  /about"
                  />
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={item.target === '_blank'}
                onCheckedChange={(c) => onPatch({ target: c ? '_blank' : '_self' })}
              />
              Open in a new tab
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={item.openMode === 'mega'}
                onCheckedChange={(c) => onPatch({ openMode: c ? 'mega' : 'link' })}
              />
              Opens a mega panel
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MenuBuilderPage({ id }: { id: string }) {
  const menuQuery = useMenu(id)
  const pagesQuery = usePagesList()
  const saveMut = useSaveMenuItems()

  const [flat, setFlat] = useState<Flat[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const seeded = useRef(false)

  // Seed the editor once when the menu first loads; re-seed after a save so new
  // items pick up their server ids.
  useEffect(() => {
    if (menuQuery.data && !seeded.current) {
      setFlat(toFlat(menuQuery.data.items))
      seeded.current = true
    }
  }, [menuQuery.data])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const pageOptions = useMemo(
    () => (pagesQuery.data ?? []).map((p) => ({ value: p.id, label: `${p.title} — ${p.path}` })),
    [pagesQuery.data]
  )

  function patchAt(index: number, patch: Partial<Flat>) {
    setFlat((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }

  function removeAt(index: number) {
    setFlat((prev) => {
      const end = subtreeEnd(prev, index)
      return normalizeDepths([...prev.slice(0, index), ...prev.slice(end)])
    })
  }

  function addItem() {
    const key = ulid()
    setFlat((prev) => [
      ...prev,
      {
        key,
        label: 'New item',
        type: 'url',
        pageId: null,
        url: '',
        target: '_self',
        openMode: 'link',
        depth: 0,
      },
    ])
    setExpanded((prev) => new Set(prev).add(key))
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setFlat((prev) => {
      const from = prev.findIndex((f) => f.key === active.id)
      const to = prev.findIndex((f) => f.key === over.id)
      if (from < 0 || to < 0) return prev
      return normalizeDepths(arrayMove(prev, from, to))
    })
  }

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function save() {
    try {
      const result = await saveMut.mutateAsync({ id, items: toTree(flat) })
      setFlat(toFlat(result.items))
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
            ? `Handle: ${menuQuery.data.handle} · drag to reorder, indent to nest`
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

      <div className="max-w-2xl space-y-2">
        {flat.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No items yet. Add one to start building this menu.
          </p>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={flat.map((f) => f.key)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {flat.map((item, index) => (
                <SortableRow
                  key={item.key}
                  item={item}
                  index={index}
                  pageOptions={pageOptions}
                  expanded={expanded.has(item.key)}
                  onToggle={() => toggle(item.key)}
                  onPatch={(patch) => patchAt(index, patch)}
                  onIndent={() => setFlat((prev) => shiftSubtree(prev, index, 1))}
                  onOutdent={() => setFlat((prev) => shiftSubtree(prev, index, -1))}
                  onRemove={() => removeAt(index)}
                  canIndent={index > 0 && item.depth <= flat[index - 1].depth}
                  canOutdent={item.depth > 0}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <Button variant="outline" className="mt-2 gap-2" onClick={addItem}>
          <Plus className="size-4" /> Add item
        </Button>
      </div>
    </div>
  )
}

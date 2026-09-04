import { useEffect, useMemo, useState } from 'react'
import { Boxes, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import type { CmsComponentDto, CmsComponentField } from '~/types/api'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { PageHeader } from '~/components/admin/page-header'
import {
  ComponentSchemaEditor,
  componentSchemaError,
} from '~/components/cms/component-schema-editor'
import { keyHint } from '~/components/cms/schema-builder'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { formatAdminTableDateTime } from '~/lib/utils'
import {
  useCmsComponentsList,
  useCreateCmsComponent,
  useDeleteCmsComponent,
  useUpdateCmsComponent,
} from '~/hooks/api/use-cms-components'

/** Card mirroring the Collections page: icon tile + name + meta + actions menu. */
function ComponentCard({
  component,
  onEdit,
  onDelete,
}: {
  component: CmsComponentDto
  onEdit: (c: CmsComponentDto) => void
  onDelete: (c: CmsComponentDto) => void
}) {
  return (
    <div className="group relative flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/50 hover:shadow-md">
      <div className="absolute right-2.5 top-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" className="size-8 text-muted-foreground" />}
            aria-label={`${component.label} actions`}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onEdit(component)}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              className="gap-2 cursor-pointer"
              onClick={() => onDelete(component)}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <button
        type="button"
        onClick={() => onEdit(component)}
        className="rounded-md pr-8 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/50 text-indigo-600 dark:text-indigo-400">
            <Boxes className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight text-foreground">
              {component.label}
            </span>
            <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
              {component.key}
            </span>
          </span>
        </span>
      </button>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <Badge variant="secondary" className="text-[11px]">
          Component
        </Badge>
        <span>
          {component.fields.length} field{component.fields.length === 1 ? '' : 's'}
        </span>
        <span className="ml-auto tabular-nums">
          {formatAdminTableDateTime(component.updatedAt)}
        </span>
      </div>
    </div>
  )
}

function slugifyKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
}

export default function CmsComponentsPage() {
  const listQuery = useCmsComponentsList()
  const components = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const createMut = useCreateCmsComponent()
  const updateMut = useUpdateCmsComponent()
  const deleteMut = useDeleteCmsComponent()
  const confirmDelete = useConfirmDelete()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<CmsComponentDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return components
    return components.filter(
      (c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q)
    )
  }, [components, search])

  const openNew = () => {
    setEditing(null)
    setEditorOpen(true)
  }
  const openEdit = (c: CmsComponentDto) => {
    setEditing(c)
    setEditorOpen(true)
  }

  const handleDelete = (c: CmsComponentDto) => {
    setError(null)
    void confirmDelete({
      title: 'Delete component',
      description: `Delete component "${c.label}"? Any collection using it must remove the field first.`,
    }).then((confirmed) => {
      if (confirmed) {
        deleteMut.mutate(c.key, {
          onError: (e) => setError((e as Error).message),
        })
      }
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Components"
        subtitle="Reusable groups of fields you can attach to any collection."
        count={components.length}
        actions={
          <Button onClick={openNew} className="gap-2">
            <Plus className="size-4" />
            New component
          </Button>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search components…"
          className="h-9 pl-9"
          autoComplete="off"
        />
      </div>

      {listQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[104px] animate-pulse rounded-xl border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {search.trim()
              ? `No components match “${search.trim()}”.`
              : 'No components yet. Create one to reuse a field group across collections.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <ComponentCard key={c.id} component={c} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <ComponentEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        existingKeys={components.map((c) => c.key)}
        onCreate={(body) => createMut.mutateAsync(body)}
        onUpdate={(key, body) => updateMut.mutateAsync({ key, body })}
      />
    </div>
  )
}

function ComponentEditorDialog({
  open,
  onOpenChange,
  editing,
  existingKeys,
  onCreate,
  onUpdate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: CmsComponentDto | null
  existingKeys: string[]
  onCreate: (body: { key: string; label: string; fields: CmsComponentField[] }) => Promise<unknown>
  onUpdate: (key: string, body: { label: string; fields: CmsComponentField[] }) => Promise<unknown>
}) {
  const isEdit = !!editing
  const [label, setLabel] = useState('')
  const [key, setKey] = useState('')
  // The key follows the label until the user edits the key directly.
  const [keyTouched, setKeyTouched] = useState(false)
  const [config, setConfig] = useState<Record<string, unknown>>({ fields: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setLabel(editing.label)
      setKey(editing.key)
      setConfig({ fields: editing.fields })
    } else {
      setLabel('')
      setKey('')
      setConfig({ fields: [] })
    }
    setKeyTouched(false)
    setError(null)
  }, [open, editing])

  const fields = (config.fields as CmsComponentField[] | undefined) ?? []
  const schemaErr = componentSchemaError(config)
  const keyInvalid = keyHint(key)
  const keyDuplicate = !isEdit && existingKeys.includes(key)
  const keyMessage = keyInvalid ?? (keyDuplicate ? 'Key already exists.' : null)
  const canSave =
    label.trim().length > 0 && (isEdit || !keyMessage) && !schemaErr && !saving

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      if (isEdit) await onUpdate(editing!.key, { label, fields })
      else await onCreate({ key, label, fields })
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <button
          type="button"
          onClick={() => !saving && onOpenChange(false)}
          disabled={saving}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <X className="size-4" />
        </button>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit component' : 'New component'}</DialogTitle>
          <DialogDescription>
            A reusable group of fields you can attach to collections.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={label}
                autoFocus
                placeholder="SEO"
                onChange={(e) => {
                  const next = e.target.value
                  setLabel(next)
                  if (!isEdit && !keyTouched) setKey(slugifyKey(next))
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Key</Label>
              <Input
                value={key}
                disabled={isEdit}
                placeholder="seo"
                className="font-mono text-sm"
                onChange={(e) => {
                  setKeyTouched(true)
                  setKey(slugifyKey(e.target.value))
                }}
              />
              {!isEdit && keyMessage ? (
                <p className="text-xs text-destructive">{keyMessage}</p>
              ) : null}
            </div>
          </div>

          <ComponentSchemaEditor
            config={config}
            onChange={setConfig}
            showRepeatable={false}
            disabled={saving}
          />
          {schemaErr ? <p className="text-xs text-destructive">{schemaErr}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="gap-2 min-w-[7rem]"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

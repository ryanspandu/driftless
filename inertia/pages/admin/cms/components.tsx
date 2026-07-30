import { useEffect, useState } from 'react'
import { Boxes, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { CmsComponentDto, CmsComponentField } from '~/types/api'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Card, CardContent } from '~/components/ui/card'
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
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import {
  useCmsComponentsList,
  useCreateCmsComponent,
  useDeleteCmsComponent,
  useUpdateCmsComponent,
} from '~/hooks/api/use-cms-components'

const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/

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
  const components = listQuery.data ?? []
  const createMut = useCreateCmsComponent()
  const updateMut = useUpdateCmsComponent()
  const deleteMut = useDeleteCmsComponent()
  const confirmDelete = useConfirmDelete()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<CmsComponentDto | null>(null)
  const [error, setError] = useState<string | null>(null)

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

      {listQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="h-24 animate-pulse p-4" />
            </Card>
          ))}
        </div>
      ) : components.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No components yet. Create one to reuse a field group across collections.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {components.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                  <Boxes className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.label}</p>
                  <code className="text-xs text-muted-foreground">{c.key}</code>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.fields.length} field{c.fields.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => openEdit(c)}
                    aria-label={`Edit ${c.label}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive"
                    onClick={() => handleDelete(c)}
                    aria-label={`Delete ${c.label}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
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
    setError(null)
  }, [open, editing])

  const fields = (config.fields as CmsComponentField[] | undefined) ?? []
  const schemaErr = componentSchemaError(config)
  const keyDuplicate = !isEdit && existingKeys.includes(key)
  const canSave =
    label.trim().length > 0 && KEY_RE.test(key) && !keyDuplicate && !schemaErr && !saving

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
                  if (!isEdit && !key) setKey(slugifyKey(next))
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
                onChange={(e) => setKey(slugifyKey(e.target.value))}
              />
              {keyDuplicate ? (
                <p className="text-xs text-destructive">Key already exists.</p>
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

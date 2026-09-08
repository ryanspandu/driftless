import { useMemo, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Loader2, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import type { FormFieldDef, FormFieldType, FormFieldWidth } from '~/types/api'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { AppSelect } from '~/components/ui/app-select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'

export const FORM_FIELD_META: { type: FormFieldType; label: string }[] = [
  { type: 'text', label: 'Short text' },
  { type: 'textarea', label: 'Paragraph' },
  { type: 'email', label: 'Email' },
  { type: 'tel', label: 'Phone' },
  { type: 'number', label: 'Number' },
  { type: 'date', label: 'Date' },
  { type: 'url', label: 'Link (URL)' },
  { type: 'select', label: 'Dropdown' },
  { type: 'radio', label: 'Radio' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'checkbox_group', label: 'Checkbox group' },
  { type: 'file', label: 'File upload' },
]

const TYPE_LABEL = new Map(FORM_FIELD_META.map((m) => [m.type, m.label]))
const OPTION_TYPES: FormFieldType[] = ['select', 'radio', 'checkbox_group']

/** Widths as "N per row" in a 12-col grid — richer than the CMS full/half/third. */
const WIDTHS: { value: FormFieldWidth; label: string }[] = [
  { value: 'full', label: 'Full row (1)' },
  { value: 'half', label: 'Half (2 per row)' },
  { value: 'third', label: 'Third (3 per row)' },
  { value: 'quarter', label: 'Quarter (4 per row)' },
  { value: 'sixth', label: 'Sixth (6 per row)' },
]
const COLSPAN: Record<FormFieldWidth, string> = {
  full: 'col-span-12',
  half: 'col-span-12 sm:col-span-6',
  third: 'col-span-12 sm:col-span-4',
  quarter: 'col-span-6 sm:col-span-3',
  sixth: 'col-span-6 sm:col-span-2',
}

const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/

function keyFromLabel(label: string): string {
  const s = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, 'f_$1')
    .slice(0, 32)
  return s || 'field'
}

function emptyField(): FormFieldDef {
  return { key: '', label: '', type: 'text', width: 'full' }
}

/**
 * Edit a form's field schema: add, configure, drag-reorder and remove fields,
 * laid out at their real width (1–6 per row) so the card previews the form.
 * Edits are LOCAL until "Save fields" — nothing auto-saves.
 */
export function FormFieldsEditor({
  initialFields,
  onSave,
  saving,
}: {
  initialFields: FormFieldDef[]
  onSave: (fields: FormFieldDef[]) => Promise<void>
  saving?: boolean
}) {
  const [fields, setFields] = useState<FormFieldDef[]>(initialFields)
  const [baseline, setBaseline] = useState<FormFieldDef[]>(initialFields)
  const [editing, setEditing] = useState<{ index: number; draft: FormFieldDef } | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const dirty = useMemo(
    () => JSON.stringify(fields) !== JSON.stringify(baseline),
    [fields, baseline]
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = fields.findIndex((f) => f.key === active.id)
    const to = fields.findIndex((f) => f.key === over.id)
    if (from < 0 || to < 0) return
    setFields(arrayMove(fields, from, to))
  }

  const remove = (index: number) => setFields(fields.filter((_, i) => i !== index))
  const commit = (draft: FormFieldDef, index: number) => {
    setFields(index < 0 ? [...fields, draft] : fields.map((f, i) => (i === index ? draft : f)))
    setEditing(null)
  }

  const save = async () => {
    await onSave(fields)
    setBaseline(fields)
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Fields</CardTitle>
            <CardDescription>
              {fields.length} field{fields.length === 1 ? '' : 's'}. Drag the handle to reorder; set
              each field’s width to pack 1–6 per row.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-2"
            onClick={() => setEditing({ index: -1, draft: emptyField() })}
          >
            <Plus className="size-4" /> Add field
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {fields.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No fields yet — add the first one.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={fields.map((f) => f.key)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-12 gap-2">
                {fields.map((field, index) => (
                  <SortableFieldCard
                    key={field.key}
                    field={field}
                    onEdit={() => setEditing({ index, draft: { ...field } })}
                    onRemove={() => remove(index)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <div className="flex items-center gap-3 border-t pt-4">
          <Button onClick={save} disabled={!dirty || saving} className="gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save fields
          </Button>
          {savedFlash ? <span className="text-sm text-emerald-600">Saved</span> : null}
          {dirty && !saving ? (
            <span className="text-sm text-muted-foreground">Unsaved changes</span>
          ) : null}
        </div>
      </CardContent>

      {editing ? (
        <FieldDialog
          initial={editing.draft}
          existingKeys={fields.filter((_, i) => i !== editing.index).map((f) => f.key)}
          onCancel={() => setEditing(null)}
          onSave={(draft) => commit(draft, editing.index)}
        />
      ) : null}
    </Card>
  )
}

function SortableFieldCard({
  field,
  onEdit,
  onRemove,
}: {
  field: FormFieldDef
  onEdit: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.key,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className={COLSPAN[field.width ?? 'full']}>
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-2.5">
        <button
          type="button"
          className="shrink-0 cursor-grab text-muted-foreground touch-none"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{field.label || '(no label)'}</span>
            <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
              {TYPE_LABEL.get(field.type) ?? field.type}
            </Badge>
            {field.required ? (
              <span className="shrink-0 text-destructive" title="Required">
                *
              </span>
            ) : null}
          </div>
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {field.key}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onEdit}
          aria-label="Edit"
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-destructive"
          onClick={onRemove}
          aria-label="Remove"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

function FieldDialog({
  initial,
  existingKeys,
  onCancel,
  onSave,
}: {
  initial: FormFieldDef
  existingKeys: string[]
  onCancel: () => void
  onSave: (field: FormFieldDef) => void
}) {
  const [draft, setDraft] = useState<FormFieldDef>(initial)
  const [keyTouched, setKeyTouched] = useState(Boolean(initial.key))
  const isNew = !initial.key
  const set = (patch: Partial<FormFieldDef>) => setDraft((d) => ({ ...d, ...patch }))

  const key = draft.key || (keyTouched ? '' : keyFromLabel(draft.label))

  const error = !draft.label.trim()
    ? 'A label is required'
    : !KEY_RE.test(key)
      ? 'Key must be lowercase letters, numbers and underscores, starting with a letter'
      : existingKeys.includes(key)
        ? 'Another field already uses this key'
        : OPTION_TYPES.includes(draft.type) &&
            (draft.options ?? []).filter((o) => o.trim()).length === 0
          ? 'Add at least one option'
          : null

  const save = () => {
    if (error) return
    const clean: FormFieldDef = {
      key,
      label: draft.label.trim(),
      type: draft.type,
      ...(draft.required ? { required: true } : {}),
      ...(draft.placeholder?.trim() ? { placeholder: draft.placeholder.trim() } : {}),
      ...(draft.help?.trim() ? { help: draft.help.trim() } : {}),
      ...(draft.width && draft.width !== 'full' ? { width: draft.width } : {}),
    }
    if (OPTION_TYPES.includes(draft.type)) {
      clean.options = (draft.options ?? []).map((o) => o.trim()).filter((o) => o !== '')
    }
    if (draft.type === 'number') {
      if (typeof draft.min === 'number') clean.min = draft.min
      if (typeof draft.max === 'number') clean.max = draft.max
    }
    if (draft.type === 'file' && draft.accept?.trim()) clean.accept = draft.accept.trim()
    onSave(clean)
  }

  const showPlaceholder = ['text', 'textarea', 'email', 'tel', 'url', 'number'].includes(draft.type)

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add field' : 'Edit field'}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <AppSelect
              value={draft.type}
              onChange={(v) => set({ type: v as FormFieldType })}
              options={FORM_FIELD_META.map((m) => ({ value: m.type, label: m.label }))}
              isSearchable={false}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Label</Label>
            <Input value={draft.label} onChange={(e) => set({ label: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Key</Label>
            <Input
              value={key}
              onChange={(e) => {
                setKeyTouched(true)
                set({ key: e.target.value })
              }}
              className="font-mono text-sm"
              placeholder="field_key"
            />
            <p className="text-xs text-muted-foreground">The name stored in submissions.</p>
          </div>

          {showPlaceholder ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Placeholder</Label>
              <Input
                value={draft.placeholder ?? ''}
                onChange={(e) => set({ placeholder: e.target.value })}
              />
            </div>
          ) : null}

          {OPTION_TYPES.includes(draft.type) ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Options (one per line)</Label>
              <textarea
                rows={4}
                value={(draft.options ?? []).join('\n')}
                onChange={(e) => set({ options: e.target.value.split('\n') })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </div>
          ) : null}

          {draft.type === 'number' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Min</Label>
                <Input
                  type="number"
                  value={draft.min ?? ''}
                  onChange={(e) =>
                    set({ min: e.target.value === '' ? null : Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max</Label>
                <Input
                  type="number"
                  value={draft.max ?? ''}
                  onChange={(e) =>
                    set({ max: e.target.value === '' ? null : Number(e.target.value) })
                  }
                />
              </div>
            </div>
          ) : null}

          {draft.type === 'file' ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Accepted types (hint)</Label>
              <Input
                value={draft.accept ?? ''}
                onChange={(e) => set({ accept: e.target.value })}
                placeholder=".pdf,image/*"
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label className="text-xs">Width (fields per row)</Label>
            <AppSelect
              value={draft.width ?? 'full'}
              onChange={(v) => set({ width: v as FormFieldWidth })}
              options={WIDTHS}
              isSearchable={false}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={Boolean(draft.required)}
              onCheckedChange={(v) => set({ required: v })}
            />
            Required
          </label>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!!error}>
            {isNew ? 'Add' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

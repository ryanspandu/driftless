import { useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import type { FormFieldDef, FormFieldType, FormFieldWidth } from '~/types/api'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { AppSelect } from '~/components/ui/app-select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'

/** Human labels for each field type (mirrors the server `FORM_FIELD_TYPES`). */
export const FORM_FIELD_META: { type: FormFieldType; label: string; hint: string }[] = [
  { type: 'text', label: 'Short text', hint: 'A single line' },
  { type: 'textarea', label: 'Paragraph', hint: 'Multi-line text' },
  { type: 'email', label: 'Email', hint: 'A validated email address' },
  { type: 'tel', label: 'Phone', hint: 'A phone number' },
  { type: 'number', label: 'Number', hint: 'A number, optional min/max' },
  { type: 'date', label: 'Date', hint: 'A calendar date' },
  { type: 'url', label: 'Link (URL)', hint: 'An http(s) address' },
  { type: 'select', label: 'Dropdown', hint: 'Pick one from a list' },
  { type: 'radio', label: 'Radio', hint: 'Pick one (shown inline)' },
  { type: 'checkbox', label: 'Checkbox', hint: 'A single yes/no or consent' },
  { type: 'checkbox_group', label: 'Checkbox group', hint: 'Pick several' },
  { type: 'file', label: 'File upload', hint: 'Attach a file' },
]

const TYPE_LABEL = new Map(FORM_FIELD_META.map((m) => [m.type, m.label]))
const OPTION_TYPES: FormFieldType[] = ['select', 'radio', 'checkbox_group']
const WIDTHS: { value: FormFieldWidth; label: string }[] = [
  { value: 'full', label: 'Full' },
  { value: 'half', label: 'Half' },
  { value: 'third', label: 'Third' },
]

/** A label → a valid field key (`^[a-z][a-z0-9_]{0,31}$`). */
function keyFromLabel(label: string): string {
  const s = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, 'f_$1')
    .slice(0, 32)
  return s || 'field'
}

const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/

function emptyField(): FormFieldDef {
  return { key: '', label: '', type: 'text', width: 'full' }
}

/**
 * Edit a form's field schema — add, configure, reorder and remove fields.
 * Fully controlled: it never mutates; every change calls `onChange` with the
 * next `fields` array, which the page persists.
 */
export function FormFieldsEditor({
  fields,
  onChange,
}: {
  fields: FormFieldDef[]
  onChange: (fields: FormFieldDef[]) => void
}) {
  const [editing, setEditing] = useState<{ index: number; draft: FormFieldDef } | null>(null)

  const move = (index: number, delta: number) => {
    const next = [...fields]
    const to = index + delta
    if (to < 0 || to >= next.length) return
    ;[next[index], next[to]] = [next[to]!, next[index]!]
    onChange(next)
  }

  const remove = (index: number) => onChange(fields.filter((_, i) => i !== index))

  const commit = (draft: FormFieldDef, index: number) => {
    const next = [...fields]
    if (index < 0) next.push(draft)
    else next[index] = draft
    onChange(next)
    setEditing(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        {fields.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No fields yet — add the first one.
            </CardContent>
          </Card>
        ) : (
          fields.map((field, index) => (
            <Card key={`${field.key}-${index}`}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{field.label || '(no label)'}</span>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {TYPE_LABEL.get(field.type) ?? field.type}
                    </Badge>
                    {field.required ? (
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        Required
                      </Badge>
                    ) : null}
                    {field.width && field.width !== 'full' ? (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {field.width}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {field.key}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => move(index, 1)} disabled={index === fields.length - 1} aria-label="Move down">
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing({ index, draft: { ...field } })} aria-label="Edit">
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => remove(index)} aria-label="Remove">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Button variant="outline" className="gap-2" onClick={() => setEditing({ index: -1, draft: emptyField() })}>
        <Plus className="size-4" /> Add field
      </Button>

      {editing ? (
        <FieldDialog
          initial={editing.draft}
          existingKeys={fields.filter((_, i) => i !== editing.index).map((f) => f.key)}
          onCancel={() => setEditing(null)}
          onSave={(draft) => commit(draft, editing.index)}
        />
      ) : null}
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
  const optionsText = (draft.options ?? []).join('\n')

  const error =
    !draft.label.trim()
      ? 'A label is required'
      : !KEY_RE.test(key)
        ? 'Key must be lowercase letters, numbers and underscores, starting with a letter'
        : existingKeys.includes(key)
          ? 'Another field already uses this key'
          : OPTION_TYPES.includes(draft.type) && (draft.options ?? []).filter((o) => o.trim()).length === 0
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

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add field' : 'Edit field'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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

          {draft.type === 'text' || draft.type === 'textarea' || draft.type === 'email' || draft.type === 'tel' || draft.type === 'url' || draft.type === 'number' ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Placeholder</Label>
              <Input value={draft.placeholder ?? ''} onChange={(e) => set({ placeholder: e.target.value })} />
            </div>
          ) : null}

          {OPTION_TYPES.includes(draft.type) ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Options (one per line)</Label>
              <textarea
                rows={4}
                value={optionsText}
                onChange={(e) => set({ options: e.target.value.split('\n') })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </div>
          ) : null}

          {draft.type === 'number' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Min</Label>
                <Input type="number" value={draft.min ?? ''} onChange={(e) => set({ min: e.target.value === '' ? null : Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max</Label>
                <Input type="number" value={draft.max ?? ''} onChange={(e) => set({ max: e.target.value === '' ? null : Number(e.target.value) })} />
              </div>
            </div>
          ) : null}

          {draft.type === 'file' ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Accepted types (hint)</Label>
              <Input value={draft.accept ?? ''} onChange={(e) => set({ accept: e.target.value })} placeholder=".pdf,image/*" />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label className="text-xs">Width</Label>
            <AppSelect
              value={draft.width ?? 'full'}
              onChange={(v) => set({ width: v as FormFieldWidth })}
              options={WIDTHS}
              isSearchable={false}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={Boolean(draft.required)} onCheckedChange={(v) => set({ required: v })} />
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

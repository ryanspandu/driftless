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
import { GripVertical, Trash2 } from 'lucide-react'
import { ulid } from 'ulid'
import type { CmsFieldType } from '~/types/api'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { AppSelect } from '~/components/ui/app-select'

export const FIELD_TYPE_CHOICES: ReadonlyArray<{
  type: CmsFieldType
  label: string
  hint: string
}> = [
  { type: 'TEXT', label: 'Text', hint: 'Single-line string' },
  { type: 'TEXTAREA', label: 'Long text', hint: 'Multi-line string' },
  { type: 'EMAIL', label: 'Email', hint: 'Email address with format validation' },
  { type: 'RICHTEXT', label: 'Rich text', hint: 'Formatted document (TipTap JSON)' },
  { type: 'SLUG', label: 'Slug', hint: 'URL-friendly, unique, auto-generated from a source field' },
  { type: 'NUMBER', label: 'Number', hint: 'Integer or decimal' },
  { type: 'INTEGER', label: 'Integer', hint: 'Whole numbers only' },
  { type: 'DECIMAL', label: 'Decimal', hint: 'Numbers with a fractional part' },
  { type: 'BOOL', label: 'Boolean', hint: 'On/off switch' },
  { type: 'DATE', label: 'Date', hint: 'Calendar date' },
  { type: 'DATETIME', label: 'Date & time', hint: 'Date + time (UTC)' },
  { type: 'SELECT', label: 'Select', hint: 'Pick from a list of options' },
  { type: 'PASSWORD', label: 'Password', hint: 'Hashed secret, never shown after saving' },
  { type: 'MEDIA', label: 'Media', hint: 'Reference a media asset' },
  { type: 'JSON', label: 'JSON', hint: 'Freeform structured data' },
  { type: 'REPEATABLE', label: 'Repeatable', hint: 'Array of sub-fields' },
]

export const FIELD_TYPE_SELECT_OPTIONS = FIELD_TYPE_CHOICES.map((c) => ({
  value: c.type,
  label: c.label,
}))

/** Draft field shape used by the create-collection wizard. Order is derived from array position. */
export interface SchemaFieldDraft {
  /** Client-only stable id for drag-and-drop (not sent to the API). */
  clientRowId: string
  key: string
  label: string
  type: CmsFieldType
  required: boolean
  unique: boolean
  config: Record<string, unknown>
}

export function emptyFieldDraft(): SchemaFieldDraft {
  return {
    clientRowId: ulid(),
    key: '',
    label: '',
    type: 'TEXT',
    required: false,
    unique: false,
    config: {},
  }
}

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/

/**
 * SQL/reserved identifiers the backend rejects (mirrors `RESERVED` in
 * `app/services/cms_service.ts`). Checked client-side so a key like `status` or
 * `order` is caught in the form instead of only failing on save.
 */
const RESERVED_KEYS = new Set([
  'select',
  'from',
  'where',
  'table',
  'insert',
  'update',
  'delete',
  'user',
  'role',
  'order',
  'group',
  'union',
  'join',
  'index',
  'primary',
  'foreign',
  'constraint',
  'default',
  'null',
  'true',
  'false',
  'status',
  'id',
  'created_at',
  'updated_at',
  'author_id',
  'deleted_at',
])

/** Matches the backend: the `^[a-z][a-z0-9_]{0,31}$` regex AND no reserved word. */
export function isValidKey(value: string): boolean {
  return KEY_PATTERN.test(value) && !RESERVED_KEYS.has(value)
}

export function keyHint(value: string): string | null {
  if (!value) return 'Required.'
  if (!KEY_PATTERN.test(value)) {
    return 'Lowercase letters, digits, underscore. Start with a letter. 32 chars max.'
  }
  if (RESERVED_KEYS.has(value)) {
    return `"${value}" is a reserved word — pick another key.`
  }
  return null
}

interface SchemaBuilderProps {
  fields: SchemaFieldDraft[]
  onChange: (fields: SchemaFieldDraft[]) => void
  /** Controls whether per-row structural edits (type, key) are allowed. */
  allowTypeChange?: boolean
  allowKeyChange?: boolean
  allowReorder?: boolean
  allowRemove?: boolean
}

export function SchemaBuilder({
  fields,
  onChange,
  allowTypeChange = true,
  allowKeyChange = true,
  allowReorder = true,
  allowRemove = true,
}: SchemaBuilderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = fields.findIndex((f) => f.clientRowId === active.id)
    const newIndex = fields.findIndex((f) => f.clientRowId === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onChange(arrayMove(fields, oldIndex, newIndex))
  }

  const update = (index: number, patch: Partial<SchemaFieldDraft>) => {
    const next = fields.slice()
    next[index] = { ...next[index], ...patch }
    onChange(next)
  }

  const remove = (index: number) => {
    const next = fields.slice()
    next.splice(index, 1)
    onChange(next)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={fields.map((f) => f.clientRowId)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3">
          {fields.map((field, index) => (
            <SortableSchemaFieldRow
              key={field.clientRowId}
              sortableId={field.clientRowId}
              disabled={!allowReorder}
              field={field}
              index={index}
              fields={fields}
              allowTypeChange={allowTypeChange}
              allowKeyChange={allowKeyChange}
              allowReorder={allowReorder}
              allowRemove={allowRemove}
              onUpdate={update}
              onRemove={remove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableSchemaFieldRow({
  sortableId,
  disabled,
  field,
  index,
  fields,
  allowTypeChange,
  allowKeyChange,
  allowReorder,
  allowRemove,
  onUpdate,
  onRemove,
}: {
  sortableId: string
  disabled: boolean
  field: SchemaFieldDraft
  index: number
  fields: SchemaFieldDraft[]
  allowTypeChange: boolean
  allowKeyChange: boolean
  allowReorder: boolean
  allowRemove: boolean
  onUpdate: (index: number, patch: Partial<SchemaFieldDraft>) => void
  onRemove: (index: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    disabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : undefined,
  }

  const keyError = allowKeyChange ? keyHint(field.key) : null

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        {allowReorder ? (
          <button
            type="button"
            className="mt-1 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="Drag to reorder field"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-5" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={field.label}
                onChange={(e) => onUpdate(index, { label: e.target.value })}
                placeholder="Display name"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Key</Label>
              <Input
                value={field.key}
                onChange={(e) => onUpdate(index, { key: e.target.value.toLowerCase() })}
                disabled={!allowKeyChange}
                placeholder="lowercase_key"
              />
              {keyError ? <p className="text-xs text-destructive">{keyError}</p> : null}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <AppSelect
                value={field.type}
                disabled={!allowTypeChange}
                onChange={(v) =>
                  onUpdate(index, {
                    type: v as CmsFieldType,
                    config: {},
                  })
                }
                options={FIELD_TYPE_SELECT_OPTIONS}
                isSearchable
              />
              <p className="text-xs text-muted-foreground">
                {FIELD_TYPE_CHOICES.find((c) => c.type === field.type)?.hint}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={field.required}
                onCheckedChange={(v) => onUpdate(index, { required: v === true })}
              />
              Required
            </label>
            {['TEXT', 'SLUG', 'NUMBER'].includes(field.type) ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={field.unique}
                  onCheckedChange={(v) => onUpdate(index, { unique: v === true })}
                />
                Unique
              </label>
            ) : null}
            {field.type === 'SLUG' ? (
              <Badge variant="outline" className="text-xs">
                auto-generates from source field
              </Badge>
            ) : null}
          </div>

          <FieldConfigPanel
            field={field}
            siblings={fields.filter((_, i) => i !== index)}
            onConfigChange={(config) => onUpdate(index, { config })}
          />
        </div>

        {allowRemove ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-destructive"
            onClick={() => onRemove(index)}
            aria-label="Remove field"
            type="button"
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Per-type config controls (SELECT options, SLUG source, NUMBER min/max/…).
 * Exported and typed loosely so the shared Add-field dialog can reuse it with
 * either staged drafts or a persisted collection's fields.
 */
export function FieldConfigPanel({
  field,
  siblings,
  onConfigChange,
}: {
  field: { type: CmsFieldType; config: Record<string, unknown> }
  siblings: { type: CmsFieldType; key: string; label: string }[]
  onConfigChange: (config: Record<string, unknown>) => void
}) {
  if (field.type === 'SELECT') {
    const options = Array.isArray(field.config.options) ? (field.config.options as string[]) : []
    return (
      <div className="space-y-1">
        <Label className="text-xs">Options (comma separated)</Label>
        <Input
          value={options.join(', ')}
          onChange={(e) =>
            onConfigChange({
              ...field.config,
              options: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="DRAFT, PUBLISHED, ARCHIVED"
        />
      </div>
    )
  }
  if (field.type === 'SLUG') {
    const source = typeof field.config.source === 'string' ? (field.config.source as string) : ''
    return (
      <div className="space-y-1">
        <Label className="text-xs">Source field (auto-generate from)</Label>
        <AppSelect
          value={source || '__none'}
          onChange={(v) =>
            onConfigChange({
              ...field.config,
              source: v === '__none' ? null : v,
            })
          }
          options={[
            { value: '__none', label: 'None' },
            ...siblings
              .filter((f) => ['TEXT', 'TEXTAREA'].includes(f.type) && f.key)
              .map((f) => ({
                value: f.key,
                label: f.label || f.key,
              })),
          ]}
          placeholder="None"
          isSearchable
        />
      </div>
    )
  }
  if (field.type === 'NUMBER') {
    const config = field.config as {
      min?: number | null
      max?: number | null
      integer?: boolean
    }
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Min</Label>
          <Input
            type="number"
            value={config.min ?? ''}
            onChange={(e) =>
              onConfigChange({
                ...field.config,
                min: e.target.value === '' ? null : Number(e.target.value),
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Max</Label>
          <Input
            type="number"
            value={config.max ?? ''}
            onChange={(e) =>
              onConfigChange({
                ...field.config,
                max: e.target.value === '' ? null : Number(e.target.value),
              })
            }
          />
        </div>
        <label className="mt-6 flex items-center gap-2 text-sm">
          <Checkbox
            checked={!!config.integer}
            onCheckedChange={(v) => onConfigChange({ ...field.config, integer: v === true })}
          />
          Integer only
        </label>
      </div>
    )
  }
  return null
}

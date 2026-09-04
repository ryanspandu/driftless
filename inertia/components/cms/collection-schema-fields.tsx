import { useId, useState, type ReactNode } from 'react'
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
import { GripVertical, Loader2, Pencil, Plus, Trash2, Workflow, X } from 'lucide-react'
import type { AddCmsFieldRequest, CmsCollectionDto, CmsFieldType } from '~/types/api'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { AppSelect } from '~/components/ui/app-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import {
  emptyFieldDraft,
  isValidKey,
  keyHint,
  FieldConfigPanel,
  type SchemaFieldDraft,
} from '~/components/cms/schema-builder'
import {
  FieldTypeIconTile,
  FieldTypePicker,
  FIELD_TYPE_META_BY_TYPE,
} from '~/components/cms/field-type-picker'
import {
  ComponentSchemaEditor,
  componentSchemaError,
} from '~/components/cms/component-schema-editor'
import { useCmsComponentsList } from '~/hooks/api/use-cms-components'

/** Minimal field shape the field cards render — satisfied by both a persisted
 *  `CmsFieldDto` and a staged create-collection draft (mapped by the caller). */
export interface FieldRowData {
  id: string
  label: string
  key: string
  type: CmsFieldType
  required?: boolean
  unique?: boolean
  config: Record<string, unknown>
}

/** Fields offered as a SLUG source / referenced by config panels. */
export interface SiblingField {
  type: CmsFieldType
  key: string
  label: string
}

export function ExistingFieldsCard({
  fields,
  actionsDisabled,
  onReorderFieldKeys,
  onRemove,
  onEditField,
  editSiblings,
  headerAction,
  description,
}: {
  fields: FieldRowData[]
  actionsDisabled: boolean
  onReorderFieldKeys?: (orderedKeys: string[]) => void
  onRemove: (fieldKey: string) => void
  /** When provided, each field gets an Edit button that saves label/config. */
  onEditField?: (
    fieldKey: string,
    body: { label: string; config: Record<string, unknown> }
  ) => Promise<unknown>
  /** Sibling fields the per-type config panel needs (e.g. SLUG source). */
  editSiblings?: SiblingField[]
  headerAction?: ReactNode
  description?: ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const [editing, setEditing] = useState<FieldRowData | null>(null)
  const onEdit = onEditField ? (field: FieldRowData) => setEditing(field) : undefined

  const dataFields = fields.filter((f) => f.type !== 'RELATION')
  const relationFields = fields.filter((f) => f.type === 'RELATION')
  const count = fields.length

  const onDragEnd = (event: DragEndEvent) => {
    if (!onReorderFieldKeys) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = dataFields.findIndex((f) => f.id === active.id)
    const newIndex = dataFields.findIndex((f) => f.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(dataFields, oldIndex, newIndex)
    // Relations live in their own section and aren't reordered — keep their
    // keys after the reordered data fields so order indices stay contiguous.
    onReorderFieldKeys([...reordered.map((f) => f.key), ...relationFields.map((f) => f.key)])
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Fields</CardTitle>
            <CardDescription>
              {description ?? (
                <>
                  {count} field{count === 1 ? '' : 's'}. Drag the handle to reorder. Removing a
                  field soft-archives the column.
                </>
              )}
            </CardDescription>
          </div>
          {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={dataFields.map((f) => f.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-2">
              {dataFields.map((field) => (
                <SortableExistingFieldRow
                  key={field.id}
                  field={field}
                  actionsDisabled={actionsDisabled}
                  reorderDisabled={!onReorderFieldKeys}
                  onRemove={onRemove}
                  onEdit={onEdit}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {relationFields.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Workflow className="size-4 text-muted-foreground" aria-hidden />
              <h4 className="text-sm font-medium">Relations</h4>
              <Badge variant="outline" className="text-[11px]">
                {relationFields.length}
              </Badge>
            </div>
            {relationFields.map((field) => (
              <RelationFieldRow
                key={field.id}
                field={field}
                actionsDisabled={actionsDisabled}
                onRemove={onRemove}
                onEdit={onEdit}
              />
            ))}
          </div>
        ) : null}
      </CardContent>

      {onEditField ? (
        <EditFieldDialog
          field={editing}
          siblingFields={editSiblings ?? []}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          onSave={(body) => onEditField(editing!.key, body)}
        />
      ) : null}
    </Card>
  )
}

function RelationFieldRow({
  field,
  actionsDisabled,
  onRemove,
  onEdit,
}: {
  field: FieldRowData
  actionsDisabled: boolean
  onRemove: (fieldKey: string) => void
  onEdit?: (field: FieldRowData) => void
}) {
  const targetKey = typeof field.config.targetKey === 'string' ? field.config.targetKey : '?'
  const relationType =
    typeof field.config.relationType === 'string' ? field.config.relationType : 'manyToOne'

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{field.label}</span>
          <code className="font-mono text-xs text-muted-foreground">{field.key}</code>
          <Badge variant="outline" className="text-xs">
            → {targetKey} · {relationType}
          </Badge>
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        {onEdit ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={actionsDisabled}
            onClick={() => onEdit(field)}
            aria-label={`Edit ${field.key}`}
          >
            <Pencil className="size-4" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive"
          disabled={actionsDisabled}
          onClick={() => onRemove(field.key)}
          aria-label={`Remove ${field.key}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function SortableExistingFieldRow({
  field,
  actionsDisabled,
  reorderDisabled,
  onRemove,
  onEdit,
}: {
  field: FieldRowData
  actionsDisabled: boolean
  reorderDisabled: boolean
  onRemove: (fieldKey: string) => void
  onEdit?: (field: FieldRowData) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    disabled: reorderDisabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
    >
      {!reorderDisabled ? (
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`Drag to reorder ${field.key}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{field.label}</span>
          <code className="font-mono text-xs text-muted-foreground">{field.key}</code>
          <Badge variant="outline" className="text-xs">
            {field.type}
          </Badge>
          {field.required ? (
            <Badge variant="secondary" className="text-xs">
              required
            </Badge>
          ) : null}
          {field.unique ? (
            <Badge variant="secondary" className="text-xs">
              unique
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        {onEdit ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={actionsDisabled}
            onClick={() => onEdit(field)}
            aria-label={`Edit ${field.key}`}
          >
            <Pencil className="size-4" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive"
          disabled={actionsDisabled}
          onClick={() => onRemove(field.key)}
          aria-label={`Remove ${field.key}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Edit an existing field's label and per-type config (SELECT options, SLUG
 * source, NUMBER min/max…). Key, type and constraints are immutable once the
 * column exists, so they are shown read-only. RELATION/COMPONENT edit the label
 * only — their storage can't be restructured in place.
 */
function EditFieldDialog({
  field,
  siblingFields,
  onOpenChange,
  onSave,
}: {
  field: FieldRowData | null
  siblingFields: SiblingField[]
  onOpenChange: (open: boolean) => void
  onSave: (body: { label: string; config: Record<string, unknown> }) => Promise<unknown>
}) {
  const [label, setLabel] = useState('')
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  // Seed the form from the field each time the dialog opens on a new field.
  const activeKey = field?.key ?? null
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (field && seededFor !== activeKey) {
    setSeededFor(activeKey)
    setLabel(field.label)
    setConfig(field.config ?? {})
    setError(null)
  }

  const open = field !== null
  const editsConfig = field ? field.type !== 'RELATION' && field.type !== 'COMPONENT' : false
  const canSave = label.trim().length > 0 && !saving

  const handleClose = (next: boolean) => {
    if (saving) return
    if (!next) setSeededFor(null)
    onOpenChange(next)
  }

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      await onSave({ label: label.trim(), config })
      handleClose(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <button
          type="button"
          onClick={() => handleClose(false)}
          disabled={saving}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <X className="size-4" />
        </button>
        <DialogHeader>
          <DialogTitle>Edit field</DialogTitle>
          <DialogDescription>
            Update the label{editsConfig ? ' and options' : ''}. The key and type can’t change once
            the column exists.
          </DialogDescription>
        </DialogHeader>

        {field ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <FieldTypeIconTile type={field.type} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">
                  {FIELD_TYPE_META_BY_TYPE[field.type]?.label ?? field.type}
                </p>
                <code className="font-mono text-xs text-muted-foreground">{field.key}</code>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${id}-label`}>Label</Label>
              <Input
                id={`${id}-label`}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </div>

            {editsConfig ? (
              <FieldConfigPanel
                field={{ type: field.type, config }}
                siblings={siblingFields}
                onConfigChange={setConfig}
              />
            ) : null}

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="gap-2 min-w-[7rem]"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const RELATION_TYPE_OPTIONS = [
  { value: 'manyToOne', label: 'Many to one' },
  { value: 'oneToOne', label: 'One to one' },
  { value: 'manyToMany', label: 'Many to many' },
  { value: 'oneToMany', label: 'One to many' },
]

export function AddFieldDialog({
  disabled,
  existingKeys,
  relationTargets,
  siblingFields,
  onAdd,
  allowRelation = true,
  allowRequired = true,
}: {
  disabled: boolean
  existingKeys: string[]
  relationTargets: CmsCollectionDto[]
  /** Existing fields — used as SLUG sources and by the per-type config panel. */
  siblingFields: SiblingField[]
  onAdd: (body: AddCmsFieldRequest) => Promise<unknown>
  /** RELATION needs a join table that only `createCollection` can't build, so
   *  hide it when staging fields for a not-yet-created collection. */
  allowRelation?: boolean
  /** Adding a field to an existing collection must be optional (the server
   *  rejects `required`), so hide the Required checkbox in that mode. */
  allowRequired?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<SchemaFieldDraft>(emptyFieldDraft())
  // No type is highlighted until the user actually picks one (draft.type has a
  // default so the picker can't infer "unselected" on its own).
  const [picked, setPicked] = useState(false)
  // "type" shows the Strapi-style picker grid; "config" names the chosen field.
  const [step, setStep] = useState<'type' | 'config'>('type')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // COMPONENT fields can reference a saved component or define fields inline.
  const [componentMode, setComponentMode] = useState<'saved' | 'inline'>('inline')
  const componentsQuery = useCmsComponentsList()
  const savedComponents = componentsQuery.data ?? []
  const componentOptions = savedComponents.map((c) => ({
    value: c.key,
    label: `${c.label} · ${c.fields.length} field${c.fields.length === 1 ? '' : 's'}`,
  }))
  const keyError = keyHint(draft.key)
  const duplicate = existingKeys.includes(draft.key)
  const relationOk =
    draft.type !== 'RELATION' ||
    (typeof draft.config.targetKey === 'string' && draft.config.targetKey.trim().length > 0)
  const componentOk =
    draft.type !== 'COMPONENT' ||
    (componentMode === 'saved'
      ? typeof draft.config.componentKey === 'string' && draft.config.componentKey.length > 0
      : componentSchemaError(draft.config) === null)
  const canSubmit =
    isValidKey(draft.key) &&
    !duplicate &&
    draft.label.trim().length > 0 &&
    relationOk &&
    componentOk &&
    !disabled &&
    !saving

  const reset = () => {
    setDraft(emptyFieldDraft())
    setPicked(false)
    setStep('type')
    setError(null)
    setComponentMode('inline')
  }

  const handleOpenChange = (next: boolean) => {
    if (saving) return
    setOpen(next)
    if (!next) reset()
  }

  const handlePickType = (type: CmsFieldType) => {
    // For a COMPONENT field, prefer the SAVED-component picker when any exist —
    // that is the whole point of Components (reuse). Only fall back to defining
    // fields inline when there is nothing saved to attach.
    const hasSaved = type === 'COMPONENT' && savedComponents.length > 0
    if (type === 'COMPONENT') setComponentMode(hasSaved ? 'saved' : 'inline')
    setDraft((prev) => ({
      ...prev,
      type,
      config:
        type === 'RELATION'
          ? { relationType: 'manyToOne' }
          : type === 'COMPONENT'
            ? hasSaved
              ? { repeatable: false, componentKey: '' }
              : { repeatable: false, fields: [] }
            : {},
    }))
    setPicked(true)
    setStep('config')
  }

  const handleAdd = async () => {
    setError(null)
    setSaving(true)
    try {
      await onAdd({
        key: draft.key,
        label: draft.label,
        type: draft.type,
        required: draft.required,
        unique: draft.unique,
        config: draft.config,
      })
      setOpen(false)
      reset()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const formId = useId()
  const labelId = `${formId}-label`
  const keyId = `${formId}-key`
  const keyMessage = keyError ?? (duplicate ? 'Key already exists.' : null)
  const meta = FIELD_TYPE_META_BY_TYPE[draft.type]
  const relationTargetOptions = relationTargets.map((c) => ({
    value: c.key,
    label: c.label,
  }))

  return (
    <>
      <Button type="button" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add field
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
          <DialogHeader>
            <DialogTitle>Add field</DialogTitle>
            <DialogDescription>
              {step === 'type'
                ? 'Select a field type for this collection.'
                : 'Name the field and set its constraints.'}
            </DialogDescription>
          </DialogHeader>

          {step === 'type' ? (
            <FieldTypePicker
              value={picked ? draft.type : null}
              onChange={handlePickType}
              exclude={allowRelation ? undefined : ['RELATION']}
            />
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <FieldTypeIconTile type={draft.type} className="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">{meta?.label ?? draft.type}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{meta?.description}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setStep('type')}>
                  Change type
                </Button>
              </div>

              {draft.type === 'RELATION' ? (
                <div className="space-y-4 rounded-lg border border-border/80 bg-muted/35 p-4">
                  <p className="text-xs font-medium text-muted-foreground">Relation</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Target collection</Label>
                      <AppSelect
                        value={
                          typeof draft.config.targetKey === 'string' ? draft.config.targetKey : ''
                        }
                        onChange={(v) =>
                          setDraft((prev) => ({
                            ...prev,
                            config: { ...prev.config, targetKey: v },
                          }))
                        }
                        options={relationTargetOptions}
                        placeholder="Select a collection…"
                        isSearchable={relationTargetOptions.length > 8}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Relationship</Label>
                      <AppSelect
                        value={
                          typeof draft.config.relationType === 'string'
                            ? draft.config.relationType
                            : 'manyToOne'
                        }
                        onChange={(v) =>
                          setDraft((prev) => ({
                            ...prev,
                            config: { ...prev.config, relationType: v },
                          }))
                        }
                        options={RELATION_TYPE_OPTIONS}
                      />
                    </div>
                  </div>
                  {relationTargetOptions.length === 0 ? (
                    <p className="text-xs text-destructive">
                      No dynamic collections available to link to.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {draft.type === 'COMPONENT' ? (
                <div className="space-y-4 rounded-lg border border-border/80 bg-muted/35 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs font-medium text-muted-foreground">Component</p>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.config.repeatable === true}
                        onCheckedChange={(v) =>
                          setDraft((prev) => ({
                            ...prev,
                            config: { ...prev.config, repeatable: v === true },
                          }))
                        }
                      />
                      Repeatable
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={componentMode === 'saved' ? 'default' : 'outline'}
                      onClick={() => {
                        setComponentMode('saved')
                        setDraft((prev) => ({
                          ...prev,
                          config: {
                            repeatable: prev.config.repeatable === true,
                            componentKey:
                              typeof prev.config.componentKey === 'string'
                                ? prev.config.componentKey
                                : '',
                          },
                        }))
                      }}
                    >
                      Saved component
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={componentMode === 'inline' ? 'default' : 'outline'}
                      onClick={() => {
                        setComponentMode('inline')
                        setDraft((prev) => ({
                          ...prev,
                          config: {
                            repeatable: prev.config.repeatable === true,
                            fields: Array.isArray(prev.config.fields) ? prev.config.fields : [],
                          },
                        }))
                      }}
                    >
                      Define inline
                    </Button>
                  </div>

                  {componentMode === 'saved' ? (
                    componentOptions.length === 0 ? (
                      <p className="text-xs text-destructive">
                        No saved components yet — create one under Components, or define fields
                        inline.
                      </p>
                    ) : (
                      <AppSelect
                        value={
                          typeof draft.config.componentKey === 'string'
                            ? draft.config.componentKey
                            : ''
                        }
                        onChange={(v) =>
                          setDraft((prev) => ({
                            ...prev,
                            config: { ...prev.config, componentKey: v },
                          }))
                        }
                        options={componentOptions}
                        placeholder="Select a component…"
                        isSearchable={componentOptions.length > 8}
                      />
                    )
                  ) : (
                    <ComponentSchemaEditor
                      config={draft.config}
                      onChange={(config) => setDraft((prev) => ({ ...prev, config }))}
                      showRepeatable={false}
                    />
                  )}
                </div>
              ) : null}

              {/* Per-type config (SELECT options, SLUG source, NUMBER min/max…).
                  Renders nothing for types it does not handle (incl. RELATION /
                  COMPONENT, which have their own sections above). */}
              {draft.type !== 'RELATION' && draft.type !== 'COMPONENT' ? (
                <FieldConfigPanel
                  field={draft}
                  siblings={siblingFields}
                  onConfigChange={(config) => setDraft((prev) => ({ ...prev, config }))}
                />
              ) : null}

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={labelId}>Label</Label>
                  <Input
                    id={labelId}
                    value={draft.label}
                    onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
                    placeholder="e.g. Hero image"
                    autoComplete="off"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={keyId}>Key</Label>
                  <Input
                    id={keyId}
                    value={draft.key}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        key: e.target.value.toLowerCase(),
                      }))
                    }
                    placeholder="hero_image"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-sm"
                    aria-invalid={!!keyMessage}
                    aria-describedby={keyMessage ? `${keyId}-err` : undefined}
                  />
                  <div className="min-h-[1.25rem]">
                    {keyMessage ? (
                      <p id={`${keyId}-err`} className="text-xs text-destructive">
                        {keyMessage}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              {allowRequired || ['TEXT', 'SLUG', 'NUMBER'].includes(draft.type) ? (
                <div className="rounded-lg border border-border/80 bg-muted/35 p-4">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">Constraints</p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-2">
                    {allowRequired ? (
                      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                        <Checkbox
                          checked={draft.required}
                          onCheckedChange={(v) =>
                            setDraft((prev) => ({ ...prev, required: v === true }))
                          }
                        />
                        <span>Required</span>
                      </label>
                    ) : null}
                    {['TEXT', 'SLUG', 'NUMBER'].includes(draft.type) ? (
                      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                        <Checkbox
                          checked={draft.unique}
                          onCheckedChange={(v) =>
                            setDraft((prev) => ({ ...prev, unique: v === true }))
                          }
                        />
                        <span>Unique</span>
                      </label>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          )}

          {step === 'config' ? (
            <DialogFooter>
              <Button
                type="button"
                onClick={handleAdd}
                disabled={!canSubmit}
                className="gap-2 min-w-[9rem]"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Add field
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

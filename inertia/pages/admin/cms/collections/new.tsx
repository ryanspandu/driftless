import { Link } from '@inertiajs/react'
import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type {
  AddCmsFieldRequest,
  CreateCmsCollectionFieldRequest,
  CreateCmsCollectionRequest,
} from '~/types/api'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { AppSelect } from '~/components/ui/app-select'
import type { CmsCollectionType } from '~/types/api'
import {
  emptyFieldDraft,
  isValidKey,
  keyHint,
  type SchemaFieldDraft,
} from '~/components/cms/schema-builder'
import {
  AddFieldDialog,
  ExistingFieldsCard,
  type FieldRowData,
} from '~/components/cms/collection-schema-fields'
import { ApiError } from '~/lib/api'
import { useCmsCollectionsList, useCreateCmsCollection } from '~/hooks/api/use-cms-collections'
import { ComboboxInput } from '~/components/ui/combobox-input'
import { CollectionIconPicker } from '~/components/cms/collection-icon-popover'
import { BackButton } from '~/components/admin/back-button'
import { useRouter } from '~/hooks/use-inertia-url'

/**
 * Derive a collection key from a label — snake_case, starting with a letter,
 * matching the backend key rule (`^[a-z][a-z0-9_]{0,31}$`). "CMS 1" → "cms_1".
 * (Keys become the physical table name, so hyphens/spaces are not allowed.)
 */
function keyify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/g, '')
    .slice(0, 32)
}

/** First free key: `base`, else `base_1`, `base_2`, … avoiding taken keys. */
function uniqueKey(base: string, taken: Set<string>): string {
  if (!base || !taken.has(base)) return base
  for (let i = 1; i < 1000; i++) {
    const candidate = `${base}_${i}`.slice(0, 32)
    if (!taken.has(candidate)) return candidate
  }
  return base
}

/** The title + slug fields every new records collection starts with. */
function defaultCollectionFields(): SchemaFieldDraft[] {
  return [
    { ...emptyFieldDraft(), key: 'title', label: 'Title', required: true },
    {
      ...emptyFieldDraft(),
      key: 'slug',
      label: 'Slug',
      type: 'SLUG',
      required: true,
      unique: true,
      config: { source: 'title' },
    },
  ]
}

/** True when the field list is still the untouched title + slug default. */
function isDefaultCollectionFields(fields: SchemaFieldDraft[]): boolean {
  return (
    fields.length === 2 &&
    fields[0]?.key === 'title' &&
    fields[1]?.key === 'slug'
  )
}

function hasDuplicates(values: string[]): boolean {
  const seen = new Set<string>()
  for (const v of values) {
    if (!v) continue
    if (!isValidKey(v)) continue
    if (seen.has(v)) return true
    seen.add(v)
  }
  return false
}

export default function NewCmsCollectionPage() {
  const router = useRouter()
  const createMut = useCreateCmsCollection()
  const collectionsQuery = useCmsCollectionsList()

  const groupOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (collectionsQuery.data ?? []).map((c) => c.group?.trim()).filter((g): g is string => !!g)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [collectionsQuery.data]
  )

  const existingCollectionKeys = useMemo(
    () => new Set((collectionsQuery.data ?? []).map((c) => c.key.toLowerCase())),
    [collectionsQuery.data]
  )

  const [key, setKey] = useState('')
  // Until the user edits the key by hand, it auto-derives from the label.
  const [keyDirty, setKeyDirty] = useState(false)
  const keyAlreadyExists = isValidKey(key) && existingCollectionKeys.has(key.toLowerCase())
  const [label, setLabel] = useState('')

  const onChangeLabel = (value: string) => {
    setLabel(value)
    if (!keyDirty) setKey(uniqueKey(keyify(value), existingCollectionKeys))
  }
  const [icon, setIcon] = useState('')
  const [group, setGroup] = useState('')
  const [revisionsOn, setRevisionsOn] = useState(true)
  const [draftsOn, setDraftsOn] = useState(true)
  const [kind, setKind] = useState<'collection' | 'single'>('collection')
  const [type, setType] = useState<CmsCollectionType>('COLLECTION')
  const isContent = type === 'CONTENT'
  const [fields, setFields] = useState<SchemaFieldDraft[]>(defaultCollectionFields)
  const [error, setError] = useState<string | null>(null)

  // Content-type collections extend the built-in Content, which already owns
  // title/slug/body/status — so they seed no default fields (custom ones only).
  function onChangeType(next: CmsCollectionType) {
    setType(next)
    setFields((prev) => {
      if (next === 'CONTENT') {
        return isDefaultCollectionFields(prev) ? [] : prev
      }
      return prev.length === 0 ? defaultCollectionFields() : prev
    })
  }

  const collectionKeyError = keyHint(key)
  const collectionKeyDuplicateError = collectionKeyError
    ? null
    : keyAlreadyExists
      ? 'This key is already used by another collection.'
      : null
  const labelError = label.trim() ? null : 'Required.'
  const fieldErrors = fields.map((f) => {
    const errs: string[] = []
    const ke = keyHint(f.key)
    if (ke) errs.push(`Key: ${ke}`)
    if (!f.label.trim()) errs.push('Label is required')
    return errs
  })
  const hasFieldErrors = fieldErrors.some((errs) => errs.length > 0)
  const duplicateKey = hasDuplicates(fields.map((f) => f.key))
  const canSubmit =
    !collectionKeyError &&
    !collectionKeyDuplicateError &&
    !labelError &&
    // A Content-type collection may start with no custom fields (add them later).
    (isContent || fields.length > 0) &&
    !hasFieldErrors &&
    !duplicateKey &&
    !createMut.isPending

  // Staged field editor — same shared UI as the collection editor, but the
  // fields live in local state and are submitted together on "Create".
  const fieldRows: FieldRowData[] = fields.map((f) => ({
    id: f.clientRowId,
    label: f.label,
    key: f.key,
    type: f.type,
    required: f.required,
    unique: f.unique,
    config: f.config,
  }))

  const onAddField = (body: AddCmsFieldRequest) => {
    setFields((prev) => [
      ...prev,
      {
        ...emptyFieldDraft(),
        key: body.key,
        label: body.label,
        type: body.type,
        required: body.required ?? false,
        unique: body.unique ?? false,
        config: body.config ?? {},
      },
    ])
    return Promise.resolve()
  }

  const onRemoveField = (fieldKey: string) =>
    setFields((prev) => prev.filter((f) => f.key !== fieldKey))

  const onReorderFields = (orderedKeys: string[]) =>
    setFields((prev) => {
      const byKey = new Map(prev.map((f) => [f.key, f]))
      const next = orderedKeys.map((k) => byKey.get(k)).filter((f): f is SchemaFieldDraft => !!f)
      for (const f of prev) if (!orderedKeys.includes(f.key)) next.push(f)
      return next
    })

  const onSubmit = async () => {
    setError(null)
    try {
      const body: CreateCmsCollectionRequest = {
        key,
        label,
        icon: icon.trim() ? icon.trim() : undefined,
        group: group.trim() || undefined,
        type,
        revisionsOn,
        draftsOn,
        kind: isContent ? 'collection' : kind,
        fields: fields.map<CreateCmsCollectionFieldRequest>((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          required: f.required,
          unique: f.unique,
          config: f.config,
        })),
      }
      const created = await createMut.mutateAsync(body)
      router.push(`/admin/cms/collections/${encodeURIComponent(created.key)}`)
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
      } else {
        setError((e as Error).message)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BackButton href="/admin/cms/collections" label="Back to collections" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New collection</h1>
          <p className="text-sm text-muted-foreground">
            Define a content type — its own records, or custom fields for the built-in Content.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
          <CardDescription>
            These cannot be changed later (the key becomes your API path and database table name).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="coll-type">Type</Label>
            <AppSelect
              id="coll-type"
              value={type}
              onChange={(v) => onChangeType(v as CmsCollectionType)}
              options={[
                { value: 'COLLECTION', label: 'Collection — its own records + table' },
                { value: 'CONTENT', label: 'Content — custom fields for the built-in Content' },
              ]}
              isSearchable={false}
            />
            <p className="text-xs text-muted-foreground">
              {isContent
                ? 'Fields here appear on the Content editor (Admin → Content) and store on each post. Only one Content type may exist.'
                : 'A standalone content type with its own records list and database table.'}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="coll-label">Label</Label>
            <Input
              id="coll-label"
              value={label}
              onChange={(e) => onChangeLabel(e.target.value)}
              placeholder="Articles"
            />
            {labelError ? (
              <p className="text-xs text-destructive">{labelError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Shown across the admin.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="coll-key">Key</Label>
            <Input
              id="coll-key"
              value={key}
              onChange={(e) => {
                setKey(e.target.value.toLowerCase())
                setKeyDirty(true)
              }}
              placeholder="e.g. articles"
              aria-invalid={!!(collectionKeyError || collectionKeyDuplicateError)}
            />
            <p
              className={`text-xs ${
                collectionKeyError || collectionKeyDuplicateError
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              }`}
            >
              {collectionKeyError ??
                collectionKeyDuplicateError ??
                (isContent
                  ? `Auto-filled from the label — editable. Identifier for this Content type (no separate table).`
                  : `Auto-filled from the label — editable. Becomes table cms_${key || '…'}.`)}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="coll-group">Group</Label>
            <ComboboxInput
              id="coll-group"
              value={group}
              onChange={setGroup}
              placeholder="e.g. Content"
              options={groupOptions}
            />
            <p className="text-xs text-muted-foreground">
              Pick an existing group or type a new one.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Icon</Label>
            <CollectionIconPicker value={icon} onChange={setIcon} />
          </div>
          <div className="col-span-full flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={revisionsOn} onCheckedChange={(v) => setRevisionsOn(v === true)} />
              Track revisions
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={draftsOn} onCheckedChange={(v) => setDraftsOn(v === true)} />
              Enable draft / publish workflow
            </label>
            {!isContent ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={kind === 'single'}
                  onCheckedChange={(v) => setKind(v === true ? 'single' : 'collection')}
                />
                Single type (one entry only)
              </label>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <ExistingFieldsCard
        fields={fieldRows}
        actionsDisabled={createMut.isPending}
        onReorderFieldKeys={onReorderFields}
        onRemove={onRemoveField}
        description={`${fields.length} field${fields.length === 1 ? '' : 's'}. Drag the handle to reorder — order determines display order.`}
        headerAction={
          <AddFieldDialog
            disabled={createMut.isPending}
            existingKeys={fields.map((f) => f.key)}
            // A new collection can relate to any existing records collection
            // (never a Content-type one). Its own relation storage is created
            // right after the table, in the same transaction, on submit.
            relationTargets={(collectionsQuery.data ?? []).filter(
              (c) => c.source === 'DYNAMIC' && c.type !== 'CONTENT'
            )}
            siblingFields={fields}
            onAdd={onAddField}
          />
        }
      />
      {duplicateKey ? <p className="text-xs text-destructive">Field keys must be unique.</p> : null}

      {error ? <p className="text-sm text-destructive">Error: {error}</p> : null}

      <div className="flex justify-end gap-3">
        <Button variant="outline" render={<Link href="/admin/cms/collections" />}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={!canSubmit} className="gap-2">
          {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Create collection
        </Button>
      </div>
    </div>
  )
}

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
  const keyAlreadyExists = isValidKey(key) && existingCollectionKeys.has(key.toLowerCase())
  const [label, setLabel] = useState('')
  const [icon, setIcon] = useState('')
  const [group, setGroup] = useState('')
  const [revisionsOn, setRevisionsOn] = useState(true)
  const [draftsOn, setDraftsOn] = useState(true)
  const [kind, setKind] = useState<'collection' | 'single'>('collection')
  const [fields, setFields] = useState<SchemaFieldDraft[]>(() => [
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
  ])
  const [error, setError] = useState<string | null>(null)

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
    fields.length > 0 &&
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
        revisionsOn,
        draftsOn,
        kind,
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
            Define a content type backed by a dynamic database table.
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
          <div className="space-y-1">
            <Label htmlFor="coll-key">Key</Label>
            <Input
              id="coll-key"
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase())}
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
                `Will become /cms/${key || '…'} and table cms_${key || '…'}.`}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="coll-label">Label</Label>
            <Input
              id="coll-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Articles"
            />
            {labelError ? <p className="text-xs text-destructive">{labelError}</p> : null}
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
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={kind === 'single'}
                onCheckedChange={(v) => setKind(v === true ? 'single' : 'collection')}
              />
              Single type (one entry only)
            </label>
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
            relationTargets={(collectionsQuery.data ?? []).filter((c) => c.source === 'DYNAMIC')}
            siblingFields={fields}
            onAdd={onAddField}
            // Relations need a join table that only exists once the collection is
            // created — add them afterwards from the collection editor.
            allowRelation={false}
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

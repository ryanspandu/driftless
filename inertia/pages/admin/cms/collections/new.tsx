import { Link } from '@inertiajs/react'
import { useMemo, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import type { CreateCmsCollectionFieldRequest, CreateCmsCollectionRequest } from '~/types/api'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  emptyFieldDraft,
  isValidKey,
  keyHint,
  SchemaBuilder,
  type SchemaFieldDraft,
} from '~/components/cms/schema-builder'
import { ApiError } from '~/lib/api'
import { useCmsCollectionsList, useCreateCmsCollection } from '~/hooks/api/use-cms-collections'
import { ComboboxInput } from '~/components/ui/combobox-input'
import { CollectionIconField } from '~/components/cms/collection-icon-field'
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

  const addField = () => setFields((prev) => [...prev, emptyFieldDraft()])

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
          <div className="space-y-1 md:col-span-2">
            <CollectionIconField id="coll-icon" value={icon} onChange={setIcon} />
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Fields</CardTitle>
            <CardDescription>
              {fields.length} field{fields.length === 1 ? '' : 's'}. Order determines display order.
            </CardDescription>
          </div>
          <Button onClick={addField} className="gap-2" type="button">
            <Plus className="size-4" />
            Add field
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <SchemaBuilder fields={fields} onChange={setFields} />
          {duplicateKey ? (
            <p className="text-xs text-destructive">Field keys must be unique.</p>
          ) : null}
        </CardContent>
      </Card>

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

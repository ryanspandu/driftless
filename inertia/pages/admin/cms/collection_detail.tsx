import { Link, router } from '@inertiajs/react'
import { useUrlState } from '~/hooks/use-url-state'
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save, Trash2 } from 'lucide-react'
import type { CmsCollectionDto, CmsCollectionType } from '~/types/api'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Switch } from '~/components/ui/switch'
import { AppSelect } from '~/components/ui/app-select'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { BackButton } from '~/components/admin/back-button'
import { AddFieldDialog, ExistingFieldsCard } from '~/components/cms/collection-schema-fields'
import { keyHint } from '~/components/cms/schema-builder'
import {
  useAddCmsField,
  useCmsCollection,
  useCmsCollectionsList,
  useRemoveCmsField,
  useReorderCmsFields,
  useUpdateCmsCollection,
  useUpdateCmsField,
} from '~/hooks/api/use-cms-collections'
import { useModulesList } from '~/hooks/api/use-modules'
import { ComboboxInput } from '~/components/ui/combobox-input'
import { CollectionIconPicker } from '~/components/cms/collection-icon-popover'
import {
  isCustomCollectionIcon,
  resolveCollectionLucideIcon,
} from '~/components/cms/collection-icon-lucide'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'

/**
 * Single-collection editor. Native (Prisma-backed) collections are readonly
 * at the schema level; dynamic collections support renaming metadata and
 * adding/removing fields at runtime.
 */
interface SettingsForm {
  key: string
  type: CmsCollectionType
  label: string
  icon: string
  group: string
  revisionsOn: boolean
  draftsOn: boolean
  kind: 'collection' | 'single'
}

function baselineOf(c: CmsCollectionDto): SettingsForm {
  return {
    key: c.key,
    type: c.type ?? 'COLLECTION',
    label: c.label,
    icon: c.icon ?? 'LayoutList',
    group: c.group ?? '',
    revisionsOn: c.revisionsOn,
    draftsOn: c.draftsOn,
    kind: c.kind ?? 'collection',
  }
}

/** The tab values `?tab=` accepts. Anything else falls back to `settings`. */
const TABS = ['settings', 'fields'] as const

export default function CmsCollectionDetailPage({ collectionKey: key }: { collectionKey: string }) {
  const [fieldDeleteKey, setFieldDeleteKey] = useState<string | null>(null)

  /**
   * The tab lives in the URL so a link can point straight at the fields editor.
   * Derived, not mirrored into state — a `useState` copy shows the old tab for
   * a frame after a back-button navigation.
   */
  const url = useUrlState()
  const tab = url.one('tab', TABS, 'settings')
  const [form, setForm] = useState<SettingsForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const query = useCmsCollection(key)
  const updateMut = useUpdateCmsCollection(key)
  const addFieldMut = useAddCmsField(key)
  const removeFieldMut = useRemoveCmsField(key)
  const reorderFieldsMut = useReorderCmsFields(key)
  const updateFieldMut = useUpdateCmsField(key)

  const collection = query.data
  const isNative = collection?.source === 'PRISMA'
  const listQuery = useCmsCollectionsList()
  // The "Product (ecommerce)" type is only offered while the ecommerce module is
  // enabled; an existing PRODUCT collection still shows its label regardless.
  const ecommerceEnabled = (useModulesList().data ?? []).some(
    (m) => m.name === 'ecommerce' && m.enabled
  )
  const groupOptions = useMemo(
    () =>
      Array.from(
        new Set((listQuery.data ?? []).map((c) => c.group?.trim()).filter((g): g is string => !!g))
      ).sort((a, b) => a.localeCompare(b)),
    [listQuery.data]
  )

  // Reset local settings edits when navigating to a different collection.
  useEffect(() => {
    setForm(null)
    setSaveError(null)
  }, [key])

  const baseline = collection ? baselineOf(collection) : null
  // Until the user edits, mirror the server values (no flash, no init effect).
  const activeForm = form ?? baseline
  const dirty = !!form && !!baseline && JSON.stringify(form) !== JSON.stringify(baseline)
  const keyInvalid = !!activeForm && !!keyHint(activeForm.key)

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateMut.mutateAsync({
        label: form.label,
        icon: form.icon.trim() ? form.icon.trim() : null,
        group: form.group.trim() ? form.group.trim() : null,
        revisionsOn: form.revisionsOn,
        draftsOn: form.draftsOn,
        kind: form.kind,
        key: form.key.trim(),
        type: form.type,
      })
      // A key rename moves the page — the URL is keyed by the collection key.
      if (updated.key !== key) {
        router.visit(`/admin/cms/collections/${encodeURIComponent(updated.key)}`)
        return
      }
      setForm(null)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const headerIcon = activeForm?.icon || collection?.icon || 'LayoutList'
  const headerCustom = isCustomCollectionIcon(headerIcon)
  const HeaderIcon = resolveCollectionLucideIcon(headerIcon || 'LayoutList')

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <BackButton href="/admin/cms/collections" label="Back to collections" />
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/50 text-foreground/80">
          {headerCustom ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL / remote icon
            <img src={headerIcon} alt="" className="size-full object-cover" />
          ) : (
            <HeaderIcon className="size-5" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {collection?.label ?? key}
            </h1>
            {collection ? (
              <Badge variant="secondary">
                {isNative
                  ? 'Native'
                  : collection.type === 'CONTENT'
                    ? 'Content'
                    : collection.type === 'PRODUCT'
                      ? 'Product'
                      : 'Dynamic'}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {collection ? (
              <code className="font-mono">{collection.key}</code>
            ) : query.isLoading ? (
              'Loading…'
            ) : (
              'Not found'
            )}
            {isNative ? ' · schema managed by developers' : null}
          </p>
        </div>
        {collection ? (
          <Button
            variant="outline"
            className="hidden shrink-0 gap-2 sm:inline-flex"
            render={
              <Link
                href={
                  collection.type === 'CONTENT'
                    ? '/admin/content'
                    : collection.type === 'PRODUCT'
                      ? '/admin/ecommerce/products'
                      : `/admin/cms/${encodeURIComponent(collection.key)}`
                }
              />
            }
          >
            {collection.type === 'CONTENT'
              ? 'Open Content →'
              : collection.type === 'PRODUCT'
                ? 'Open Products →'
                : 'Open records →'}
          </Button>
        ) : null}
      </div>

      {query.error ? (
        <p className="text-sm text-destructive">{(query.error as Error).message}</p>
      ) : null}

      {collection && activeForm ? (
        <Tabs
          value={tab}
          onValueChange={(v) =>
            // 'settings' is the default, so it stays out of the URL entirely.
            url.set({ tab: v === 'settings' ? undefined : (v as string) })
          }
        >
          <TabsList>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="fields" className="gap-1.5">
              Fields
              <span className="text-muted-foreground">{collection.fields.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="mt-4">
            <SettingsPanel
              form={activeForm}
              onChange={setForm}
              disabled={isNative}
              groupOptions={groupOptions}
              ecommerceEnabled={ecommerceEnabled}
              error={saveError}
            />
          </TabsContent>

          <TabsContent value="fields" className="mt-4">
            <ExistingFieldsCard
              fields={collection.fields}
              actionsDisabled={isNative || removeFieldMut.isPending || reorderFieldsMut.isPending}
              onReorderFieldKeys={
                isNative
                  ? undefined
                  : (orderedKeys) => reorderFieldsMut.mutate({ fieldKeys: orderedKeys })
              }
              onRemove={(fieldKey) => setFieldDeleteKey(fieldKey)}
              onEditField={
                isNative
                  ? undefined
                  : (fieldKey, body) => updateFieldMut.mutateAsync({ fieldKey, body })
              }
              editSiblings={collection.fields}
              headerAction={
                !isNative ? (
                  <AddFieldDialog
                    disabled={addFieldMut.isPending}
                    existingKeys={collection.fields.map((f) => f.key)}
                    relationTargets={(listQuery.data ?? []).filter(
                      (c) => c.source === 'DYNAMIC' && c.type !== 'CONTENT' && c.type !== 'PRODUCT'
                    )}
                    siblingFields={collection.fields}
                    onAdd={(body) => addFieldMut.mutateAsync(body)}
                    // A field added to an existing collection must be optional —
                    // the server rejects `required` (existing rows would break).
                    allowRequired={false}
                  />
                ) : null
              }
            />
          </TabsContent>
        </Tabs>
      ) : null}

      {collection && activeForm && !isNative ? (
        <div className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2.5 shadow-sm">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            {dirty ? (
              <>
                <span className="size-2 rounded-full bg-amber-500" aria-hidden />
                Unsaved changes
              </>
            ) : null}
          </span>
          <div className="flex items-center gap-2">
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => baseline && setForm(baseline)}
                disabled={saving}
              >
                Discard
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty || keyInvalid}
              className="gap-2"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save settings
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={fieldDeleteKey !== null}
        onOpenChange={(open) => {
          if (!open) setFieldDeleteKey(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove field</DialogTitle>
            <DialogDescription>
              This will archive the column{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                {fieldDeleteKey ?? ''}
              </code>
              . Existing cell values are kept under an archived column name.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={removeFieldMut.isPending}
              onClick={() => setFieldDeleteKey(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="gap-2"
              disabled={removeFieldMut.isPending || !fieldDeleteKey}
              onClick={() => {
                if (!fieldDeleteKey) return
                removeFieldMut.mutate(fieldDeleteKey, {
                  onSuccess: () => setFieldDeleteKey(null),
                })
              }}
            >
              {removeFieldMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Remove field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SettingsPanel({
  form,
  onChange,
  disabled,
  groupOptions,
  ecommerceEnabled,
  error,
}: {
  form: SettingsForm
  onChange: (next: SettingsForm) => void
  disabled: boolean
  groupOptions: string[]
  ecommerceEnabled: boolean
  error: string | null
}) {
  const set = (patch: Partial<SettingsForm>) => onChange({ ...form, ...patch })
  const isContent = form.type === 'CONTENT'
  const isProduct = form.type === 'PRODUCT'
  // Content and Product are both metadata-only (no table, no single-type toggle).
  const isMetadata = isContent || isProduct
  const keyError = keyHint(form.key)

  return (
    <Card>
      <CardContent className="divide-y p-0">
        <section className="grid gap-6 p-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <h3 className="text-sm font-medium">General</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Name, icon and grouping shown across the admin.
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={form.label}
                onChange={(e) => set({ label: e.target.value })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coll-key">Key</Label>
              <Input
                id="coll-key"
                value={form.key}
                onChange={(e) => set({ key: e.target.value.toLowerCase() })}
                disabled={disabled}
                spellCheck={false}
                className="font-mono text-sm"
                aria-invalid={!!keyError}
              />
              <p className={`text-xs ${keyError ? 'text-destructive' : 'text-muted-foreground'}`}>
                {keyError ??
                  (isMetadata
                    ? `Identifier for this ${isProduct ? 'Product' : 'Content'} type. Renaming updates its stored key.`
                    : `Renames the database table to cms_${form.key || '…'} and any relation tables. Page-builder blocks or links using the old key must be re-pointed.`)}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <div className="space-y-1.5">
                <Label>Icon</Label>
                <CollectionIconPicker
                  value={form.icon}
                  onChange={(v) => set({ icon: v })}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Group</Label>
                <ComboboxInput
                  value={form.group}
                  onChange={(v) => set({ group: v })}
                  disabled={disabled}
                  options={groupOptions}
                  placeholder="e.g. Content"
                  className="[&_input]:h-9"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 p-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <h3 className="text-sm font-medium">Type</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              What this collection is, and how many entries it holds.
            </p>
          </div>
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="coll-type">Type</Label>
              <AppSelect
                id="coll-type"
                value={form.type || 'COLLECTION'}
                disabled={disabled}
                onChange={(v) => set({ type: v as CmsCollectionType })}
                options={[
                  { value: 'COLLECTION', label: 'Collection — its own records + table' },
                  { value: 'CONTENT', label: 'Content — custom fields for the built-in Content' },
                  // Offered while ecommerce is on, or when this collection already
                  // is a PRODUCT type (so its label still shows if the module is off).
                  ...(ecommerceEnabled || isProduct
                    ? [
                        {
                          value: 'PRODUCT',
                          label: 'Product (ecommerce) — custom fields for the built-in Product',
                        },
                      ]
                    : []),
                ]}
                isSearchable={false}
              />
              <p className="text-xs text-muted-foreground">
                {isProduct
                  ? 'Fields here appear on the Product editor (Admin → E-commerce → Products).'
                  : isContent
                    ? 'Fields here appear on the Content editor (Admin → Content).'
                    : 'A standalone content type with its own records.'}{' '}
                Switching type is only allowed while empty (no records / no saved data).
              </p>
            </div>
            {!isMetadata ? (
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="coll-single" className="cursor-pointer">
                  <span className="block text-sm">Single type</span>
                  <span className="block text-xs text-muted-foreground">
                    Exactly one entry (e.g. a homepage or global settings). No list view — opens
                    straight to the entry.
                  </span>
                </label>
                <Switch
                  id="coll-single"
                  checked={form.kind === 'single'}
                  disabled={disabled}
                  onCheckedChange={(v) => set({ kind: v ? 'single' : 'collection' })}
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-6 p-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <h3 className="text-sm font-medium">Publishing</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              How entries are versioned and staged.
            </p>
          </div>
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="coll-revisions" className="cursor-pointer">
                <span className="block text-sm">Track revisions</span>
                <span className="block text-xs text-muted-foreground">
                  Keep a history of every change.
                </span>
              </label>
              <Switch
                id="coll-revisions"
                checked={form.revisionsOn}
                disabled={disabled}
                onCheckedChange={(v) => set({ revisionsOn: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="coll-drafts" className="cursor-pointer">
                <span className="block text-sm">Enable drafts</span>
                <span className="block text-xs text-muted-foreground">
                  Separate draft and published states.
                </span>
              </label>
              <Switch
                id="coll-drafts"
                checked={form.draftsOn}
                disabled={disabled}
                onCheckedChange={(v) => set({ draftsOn: v })}
              />
            </div>
          </div>
        </section>

        {error ? (
          <div className="px-6 py-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

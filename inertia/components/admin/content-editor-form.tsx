import { useEffect, useState, type FormEvent } from 'react'
import { Link, router } from '@inertiajs/react'
import { toast } from 'sonner'
import { ArrowLeft, Check, ImagePlus, Loader2, X } from 'lucide-react'
import type { ContentDto, ContentStatus, ContentVisibility } from '~/types/api'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { AppSelect, AppMultiSelect } from '~/components/ui/app-select'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { ArticleEditor } from '~/components/admin/article-editor'
import { MediaImagePicker } from '~/components/admin/media-image-picker'
import { FieldRenderer } from '~/components/cms/field-renderer'
import { useContentSlugCheck } from '~/hooks/api/use-content'
import { useCmsCollectionsList } from '~/hooks/api/use-cms-collections'
import { useContentCategories, useCreateContentCategory } from '~/hooks/api/use-content-categories'
import { useContentTags, useCreateContentTag } from '~/hooks/api/use-content-tags'
import { apiErrorMessage, apiFetch } from '~/lib/api'
import { formatAdminTableDateTime } from '~/lib/utils'

export type ContentFormValues = {
  title: string
  slug: string
  body: string
  status: ContentStatus
  visibility: ContentVisibility
  /** Only sent when non-empty; blank keeps any existing Protected password. */
  password?: string | null
  featuredImage: string | null
  data: Record<string, unknown> | null
  categoryIds: string[]
  tagIds: string[]
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** Category multi-select + inline create, for the editor's Categories card. */
function CategoriesField({
  value,
  onChange,
}: {
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const { data } = useContentCategories()
  const createMut = useCreateContentCategory()
  const [newName, setNewName] = useState('')
  const categories = data ?? []
  const options = categories.map((c) => ({ value: c.id, label: c.name }))

  const addNew = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      const cat = await createMut.mutateAsync({ name })
      onChange([...value, cat.id])
      setNewName('')
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Could not create category'))
    }
  }

  return (
    <div className="space-y-2">
      <AppMultiSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder="Select categories…"
        isSearchable
      />
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void addNew()
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void addNew()}
          disabled={!newName.trim() || createMut.isPending}
        >
          Add
        </Button>
      </div>
      <a
        href="/admin/content/categories"
        className="inline-block text-xs font-medium text-ring underline-offset-2 hover:underline"
      >
        Manage categories
      </a>
    </div>
  )
}

/** Tag multi-select + inline create, for the editor's Tags card. */
function TagsField({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data } = useContentTags()
  const createMut = useCreateContentTag()
  const [newName, setNewName] = useState('')
  const tags = data ?? []
  const options = tags.map((t) => ({ value: t.id, label: t.name }))

  const addNew = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      const tag = await createMut.mutateAsync({ name })
      onChange([...value, tag.id])
      setNewName('')
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Could not create tag'))
    }
  }

  return (
    <div className="space-y-2">
      <AppMultiSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder="Select tags…"
        isSearchable
      />
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New tag…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void addNew()
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void addNew()}
          disabled={!newName.trim() || createMut.isPending}
        >
          Add
        </Button>
      </div>
      <a
        href="/admin/content/tags"
        className="inline-block text-xs font-medium text-ring underline-offset-2 hover:underline"
      >
        Manage tags
      </a>
    </div>
  )
}

/**
 * Full-page article editor shared by the New and Edit content pages. Owns the
 * form state and the rich-text body; persistence is delegated to `onSave`
 * (offline-first create/update from the page), then navigates back to the list.
 */
export function ContentEditorForm({
  initial,
  heading,
  submitLabel,
  onSave,
}: {
  initial?: ContentDto | null
  heading: string
  submitLabel: string
  onSave: (values: ContentFormValues) => Promise<void>
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [status, setStatus] = useState<ContentStatus>(initial?.status ?? 'DRAFT')
  const [visibility, setVisibility] = useState<ContentVisibility>(initial?.visibility ?? 'PUBLIC')
  const [password, setPassword] = useState('')
  const [revealing, setRevealing] = useState(false)
  const [featuredImage, setFeaturedImage] = useState<string | null>(initial?.featuredImage ?? null)
  const [data, setData] = useState<Record<string, unknown>>(
    (initial?.data as Record<string, unknown> | null) ?? {}
  )
  const [categoryIds, setCategoryIds] = useState<string[]>(
    initial?.categories?.map((c) => c.id) ?? []
  )
  const [tagIds, setTagIds] = useState<string[]>(initial?.tags?.map((t) => t.id) ?? [])
  const [slugDirty, setSlugDirty] = useState(Boolean(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  // The singleton Content-type collection defines the custom fields shown here.
  const collectionsQuery = useCmsCollectionsList()
  const contentType = (collectionsQuery.data ?? []).find((c) => c.type === 'CONTENT')
  const customFields = contentType?.fields ?? []

  // Live slug availability: debounce the input, then check against the DB.
  const [debouncedSlug, setDebouncedSlug] = useState(slug)
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSlug(slug), 400)
    return () => window.clearTimeout(t)
  }, [slug])
  const slugCheck = useContentSlugCheck(debouncedSlug, initial?.id)
  const slugSettled = debouncedSlug === slug
  const slugChecking = slug.trim().length > 0 && (!slugSettled || slugCheck.isFetching)
  const slugTaken = slug.trim().length > 0 && slugSettled && slugCheck.data?.available === false
  const slugAvailable = slug.trim().length > 0 && slugSettled && slugCheck.data?.available === true

  const canReveal = Boolean(initial?.id && initial.hasPassword)

  async function revealPassword() {
    if (!initial?.id) return
    setRevealing(true)
    try {
      const res = await apiFetch<{ password: string | null }>(
        `/api/admin/content/${initial.id}/password`
      )
      setPassword(res.password ?? '')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not reveal password'))
    } finally {
      setRevealing(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    // A protected post needs a password — either a new one typed here, or an
    // existing one already stored (then the field may stay blank).
    if (visibility === 'PROTECTED' && !password.trim() && !initial?.hasPassword) {
      setError('Set a password for this protected post.')
      return
    }
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        slug: slug.trim() || slugify(title),
        body,
        status,
        visibility,
        // Only send when the operator typed something; blank keeps the stored one.
        password: password.trim() ? password : undefined,
        featuredImage,
        data: customFields.length > 0 ? data : null,
        categoryIds,
        tagIds,
      })
      toast.success(initial ? 'Content updated' : 'Content created')
      router.visit('/admin/content')
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save'))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            render={<Link href="/admin/content" aria-label="Back to content" />}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
            <p className="text-sm text-muted-foreground">
              Drafts save locally and sync in the background.
            </p>
          </div>
        </div>
        <Button
          type="submit"
          disabled={saving || !title.trim() || slugTaken || slugChecking}
          className="gap-1.5"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <Card className="overflow-hidden focus-within:border-ring/40 focus-within:ring-2 focus-within:ring-ring/40">
            <input
              aria-label="Title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (!slugDirty) setSlug(slugify(e.target.value))
              }}
              placeholder="Post title"
              className="w-full border-b border-border bg-transparent px-4 py-3.5 text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40"
            />
            <ArticleEditor
              bare
              value={body}
              onChange={setBody}
              placeholder="Start writing your article…"
            />
          </Card>

          {customFields.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{contentType?.label ?? 'Details'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {customFields.map((field) => (
                  <FieldRenderer
                    key={field.id}
                    field={field}
                    value={data[field.key]}
                    onChange={(v) => setData((prev) => ({ ...prev, [field.key]: v }))}
                    disabled={saving}
                  />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Publish</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="content-status">Status</Label>
                <AppSelect
                  id="content-status"
                  value={status}
                  onChange={(v) => setStatus(v as ContentStatus)}
                  options={[
                    { value: 'DRAFT', label: 'Draft' },
                    { value: 'PUBLISHED', label: 'Published' },
                  ]}
                  isSearchable={false}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content-visibility">Visibility</Label>
                <AppSelect
                  id="content-visibility"
                  value={visibility}
                  onChange={(v) => setVisibility(v as ContentVisibility)}
                  options={[
                    { value: 'PUBLIC', label: 'Public' },
                    { value: 'PROTECTED', label: 'Password protected' },
                    { value: 'MEMBER', label: 'Members only' },
                  ]}
                  isSearchable={false}
                />
                {visibility === 'PROTECTED' ? (
                  <div className="space-y-1.5">
                    <Input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        initial?.hasPassword ? 'Password set — type to change' : 'Set a password'
                      }
                      autoComplete="off"
                    />
                    {canReveal ? (
                      <button
                        type="button"
                        onClick={() => void revealPassword()}
                        disabled={revealing}
                        className="text-xs font-medium text-ring underline-offset-2 hover:underline disabled:opacity-60"
                      >
                        {revealing ? 'Revealing…' : 'Reveal current password'}
                      </button>
                    ) : null}
                  </div>
                ) : visibility === 'MEMBER' ? (
                  <p className="text-xs text-muted-foreground">
                    Only signed-in members can read this post.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="content-slug">Slug</Label>
                <Input
                  id="content-slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value)
                    setSlugDirty(true)
                  }}
                  placeholder="post-slug"
                  aria-invalid={slugTaken}
                />
                {slugChecking ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Checking availability…
                  </p>
                ) : slugTaken ? (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <X className="size-3" /> This slug is already in use
                  </p>
                ) : slugAvailable ? (
                  <p className="flex items-center gap-1 text-xs text-green-600 dark:text-green-500">
                    <Check className="size-3" /> Slug is available
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Used in the public URL.</p>
                )}
              </div>
              {initial ? (
                <p className="text-xs text-muted-foreground">
                  Last updated {formatAdminTableDateTime(initial.updatedAt)}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Featured image</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {featuredImage ? (
                <div className="space-y-2">
                  <img
                    src={featuredImage}
                    alt="Featured"
                    className="aspect-[16/9] w-full rounded-md border object-cover"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setPickerOpen(true)}
                    >
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => setFeaturedImage(null)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                >
                  <ImagePlus className="size-6" />
                  <span className="text-xs">Set featured image</span>
                </button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoriesField value={categoryIds} onChange={setCategoryIds} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <TagsField value={tagIds} onChange={setTagIds} />
            </CardContent>
          </Card>
        </aside>
      </div>

      <MediaImagePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(url) => setFeaturedImage(url)}
      />
    </form>
  )
}

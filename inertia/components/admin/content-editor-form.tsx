import { useEffect, useState, type FormEvent } from 'react'
import { Link, router } from '@inertiajs/react'
import { toast } from 'sonner'
import { ArrowLeft, Check, Loader2, X } from 'lucide-react'
import type { ContentDto, ContentStatus } from '~/types/api'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { AppSelect } from '~/components/ui/app-select'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { ArticleEditor } from '~/components/admin/article-editor'
import { useContentSlugCheck } from '~/hooks/api/use-content'
import { apiErrorMessage } from '~/lib/api'
import { formatAdminTableDateTime } from '~/lib/utils'

export type ContentFormValues = {
  title: string
  slug: string
  body: string
  status: ContentStatus
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
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
  const [slugDirty, setSlugDirty] = useState(Boolean(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        slug: slug.trim() || slugify(title),
        body,
        status,
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
        </aside>
      </div>
    </form>
  )
}

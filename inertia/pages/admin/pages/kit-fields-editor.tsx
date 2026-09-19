import { useEffect, useRef, useState } from 'react'
import { Link } from '@inertiajs/react'
import { ArrowLeft, Eye, ExternalLink, Layers, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import { usePublishPage, useSaveDraft, useDiscardDraft } from '~/hooks/api/use-pages'
import { KitFieldInput } from '~/pages/admin/pages/kit-field-input'
import type { KitFieldDef } from '~/custom/types'
import type { PageDto } from '~/types/api'
import { Toaster } from '~/components/ui/toaster'
import { reportError } from '~/lib/notify'

/**
 * Simplified "content region" editor for a CODE page whose resolved template
 * has a kit-declared set of simple fields (`KitCapability`'s `fields` case) —
 * not a real `<BuilderRegion/>`. Shows the actual rendered design (the admin
 * preview route, same one `CodePageNotice`/`BuilderInner` already link to)
 * beside a schema-driven form, instead of the full Puck block canvas — there
 * is nothing block-composable to drop here, only kit-author-exposed values.
 */
export function KitFieldsEditor({
  id,
  page,
  fields,
}: {
  id: string
  page: PageDto
  fields: KitFieldDef[]
}) {
  const publishMut = usePublishPage()
  const saveDraftMut = useSaveDraft()
  const discardMut = useDiscardDraft()

  const initialValues = useRef<Record<string, unknown>>(
    (page.draftContentFields ?? page.contentFields ?? {}) as Record<string, unknown>
  )
  const [values, setValues] = useState<Record<string, unknown>>(initialValues.current)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    page.draftContentFields ? 'saved' : 'idle'
  )
  const lastAutosaved = useRef<Record<string, unknown> | null>(initialValues.current)
  const [previewKey, setPreviewKey] = useState(0)

  // Autosave to the draft, debounced on idle — matches BuilderShell's own
  // 1500ms cadence. The live page is never touched here; only Publish does.
  useEffect(() => {
    if (lastAutosaved.current === values) return
    const t = window.setTimeout(async () => {
      setSaveState('saving')
      try {
        await saveDraftMut.mutateAsync({ id, contentFields: values })
        lastAutosaved.current = values
        setSaveState('saved')
        setPreviewKey((k) => k + 1) // reload the preview iframe with the just-saved draft
      } catch {
        setSaveState('error')
      }
    }, 1500)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, id])

  const setField = (key: string, next: unknown) => {
    setValues((v) => ({ ...v, [key]: next }))
  }

  const publish = async () => {
    try {
      await publishMut.mutateAsync({ id, contentFields: values })
      setPreviewKey((k) => k + 1) // reload the preview iframe with the live values
      toast.success('Page published')
    } catch (error) {
      reportError(error, 'Failed to publish')
    }
  }

  const discardDraft = async () => {
    await discardMut.mutateAsync(id)
    window.location.reload() // reopen on the live values, mirroring BuilderInner
  }

  const hasDraft = Boolean(page.draftContentFields)

  return (
    <div className="flex h-screen flex-col">
      {/* This route has no layout of its own, so it mounts the toast host itself —
          otherwise the publish toasts below render nowhere. */}
      <Toaster position="bottom-right" />
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <Link
          href="/admin/pages"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0 gap-1.5')}
        >
          <ArrowLeft className="size-4" />
          Pages
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{page.title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'saved'
              ? 'Draft saved'
              : saveState === 'error'
                ? 'Could not save'
                : ''}
        </span>
        {hasDraft ? (
          <Button type="button" variant="ghost" size="sm" onClick={discardDraft}>
            Discard draft
          </Button>
        ) : null}
        <a
          href={`/admin/pages/${id}/preview`}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
        >
          <Eye className="size-4" />
          Preview
        </a>
        {page.status === 'PUBLISHED' ? (
          <a
            href={`/${page.path}`}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
          >
            <ExternalLink className="size-4" />
            View live
          </a>
        ) : null}
        <Button type="button" size="sm" onClick={publish} disabled={publishMut.isPending}>
          {publishMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Publish
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 bg-muted/20">
          <iframe
            key={previewKey}
            src={`/admin/pages/${id}/preview`}
            title="Page preview"
            className="size-full border-0"
          />
        </div>
        <div className="w-80 shrink-0 overflow-y-auto border-l p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Layers className="size-4" />
            Content
          </div>
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to edit here.</p>
          ) : (
            <div className="space-y-4">
              {fields.map((field) => (
                <KitFieldInput
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  onChange={(next) => setField(field.key, next)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import '@measured/puck/puck.css'
import { useMemo, useState } from 'react'
import { Puck, Render, type Data } from '@measured/puck'
import { renderToStaticMarkup } from 'react-dom/server'
import { Link } from '@inertiajs/react'
import { ArrowLeft } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { puckConfig } from '~/puck/config'
import { emailPuckConfig } from '~/puck/email-config'
import { collectionPuckConfig } from '~/puck/collection-config'
import { builderViewports } from '~/puck/style-fields'
import { puckOverrides } from '~/puck/overrides'
import { BuilderShell } from '~/puck/builder-shell'
import { BuilderLoadState } from '~/puck/builder-load-state'
import { CollectionScopeContext, RecordContext } from '~/puck/record-binding'
import { collectionQuery, useRecords, useCollections, type CmsRecord } from '~/puck/collection-list'
import { PanelSelect } from '~/puck/panel-select'
import { useTemplate, useUpdateTemplate } from '~/hooks/api/use-templates'
import { useBreakpoints, useUpdateBreakpoints } from '~/hooks/api/use-breakpoints'
import { useWebsiteSettings } from '~/hooks/api/use-website-settings'
import { parseSavedColors } from '~/puck/saved-colors'
import { readBreakpoints, type Breakpoint } from '~/puck/breakpoints'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'

const EMPTY_DOC = { content: [], root: {} } as unknown as Data

// See pages/builder.tsx: render the canvas in the host document (no iframe) to
// avoid Puck's freeze-prone auto-frame path; stable refs so props are identity-stable.
const PUCK_IFRAME = { enabled: false }
const PUCK_VIEWPORTS = [...builderViewports]
/**
 * One width for email. Clients have no reliable media-query support, so a
 * responsive preview would promise something the medium cannot deliver; 600px
 * is the width `layout.edge`'s 560px card sits inside.
 */
const EMAIL_VIEWPORTS = [
  { width: 600, height: 'auto' as const, label: 'Email', icon: 'Smartphone' as const },
]

/**
 * The email document, flattened to markup.
 *
 * `renderToStaticMarkup` rather than `renderToString`: no hydration markers, no
 * `data-reactroot` — an email is never hydrated, and those attributes are dead
 * bytes in every inbox that receives it.
 */
function renderEmailHtml(data: Data): string {
  return renderToStaticMarkup(<Render config={emailPuckConfig} data={data} />)
}

/** A human label for a record row in the preview-record picker. */
function recordLabel(rec: CmsRecord, titleField: string | undefined): string {
  const data = rec.data
  const candidate =
    (titleField ? data[titleField] : undefined) ?? data.title ?? data.name ?? data.slug
  if (typeof candidate === 'string' && candidate.trim()) return candidate
  return rec.id
}

export default function TemplateBuilder({ id }: { id: string }) {
  const templateQuery = useTemplate(id)
  const updateMut = useUpdateTemplate()
  const bpQuery = useBreakpoints()
  const updateBp = useUpdateBreakpoints()
  const breakpoints = readBreakpoints(bpQuery.data?.breakpoints)
  const settingsQuery = useWebsiteSettings()
  const themeSection = settingsQuery.data?.sections?.theme ?? {}
  const savedColors = parseSavedColors(themeSection.saved_colors)
  const themeColors = {
    primary: themeSection.primary_color || undefined,
    secondary: themeSection.secondary_color || undefined,
  }
  const template = templateQuery.data

  /**
   * A COLLECTION template is designed against one real record.
   *
   * A page of the collection's published records is fetched and one is provided
   * as the ambient record, so a Heading bound to `title` shows the actual title
   * in the canvas instead of a placeholder. Which record is a per-author preview
   * preference (the topbar picker) — kept in `localStorage`, never written to
   * the template — and defaults to the newest. With no record yet, bound
   * elements show their static text and `{{tokens}}` stay visible (`editing:
   * true`), which still makes the binding legible. The query is empty (no key)
   * for every other type, and `useRecords` then fetches nothing.
   */
  const isCollection = template?.type === 'COLLECTION'
  const collectionKey = (isCollection && template?.collectionKey) || ''
  const sampleQuery = useMemo(
    () => collectionQuery({ collectionKey }, { limit: 50 }),
    [collectionKey]
  )
  const { records: sampleRecords } = useRecords(sampleQuery, 1)
  const collections = useCollections()

  const storageKey = `tpl-preview-record:${id}`
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey)
    } catch {
      return null
    }
  })
  const pickPreviewRecord = (value: string) => {
    const next = value || null
    setSelectedRecordId(next)
    try {
      if (next) localStorage.setItem(storageKey, next)
      else localStorage.removeItem(storageKey)
    } catch {
      // A private window can refuse writes — the choice just isn't remembered.
    }
  }

  const sample = sampleRecords.find((r) => r.id === selectedRecordId) ?? sampleRecords[0]
  const sampleFields = useMemo<Record<string, unknown>>(
    () => (sample ? { id: sample.id, createdAt: sample.createdAt, ...sample.data } : {}),
    [sample]
  )

  if (!template) {
    return (
      <BuilderLoadState
        error={templateQuery.error}
        backHref="/admin/templates"
        backLabel="Back to Templates"
        missingLabel="This template no longer exists. It may have been deleted, or its link may be out of date."
      />
    )
  }

  const initial =
    template.content && Object.keys(template.content).length
      ? (template.content as unknown as Data)
      : EMPTY_DOC

  const save = async (data: Data) => {
    try {
      await updateMut.mutateAsync({
        id,
        content: data as unknown as Record<string, unknown>,
        /**
         * Flattened to email HTML here, in the browser, and stored alongside
         * the document.
         *
         * The alternative — rendering on the server at send time — would mean
         * building and shipping a second SSR bundle purely so the queue worker
         * could run React. This browser already has React and the email block
         * set loaded, and rendering once per publish is cheaper than once per
         * email besides.
         */
        ...(isEmail ? { renderedHtml: renderEmailHtml(data) } : {}),
      })
      toast.success('Template design saved')
    } catch (error) {
      toast.error('Failed to save')
      // Rethrown so BuilderShell keeps the template marked unsaved — see the
      // guard there; a failed save must not clear it.
      throw error
    }
  }

  /**
   * The block set depends on the type.
   *
   * EMAIL gets a different set entirely: the page blocks carry Tailwind classes
   * and flex/grid layout, neither of which survives an email client — offering
   * them here would produce a design that looks right in this canvas and
   * arrives broken. See `inertia/puck/email-config.tsx`.
   *
   * COLLECTION gets the page set minus the blocks that make no sense inside a
   * repeated item card. See `inertia/puck/collection-config.tsx`.
   */
  const isEmail = template.type === 'EMAIL'
  const config = isEmail ? emailPuckConfig : isCollection ? collectionPuckConfig : puckConfig

  // Options for the preview-record picker, labelled by the collection's first
  // text field (falling back to title/name/slug/id inside `recordLabel`).
  const previewTitleField = collections
    .find((c) => c.key === collectionKey)
    ?.fields.find((f) => /TEXT|STRING|SLUG/i.test(f.type))?.key
  const recordOptions = sampleRecords.map((r) => ({
    value: r.id,
    label: recordLabel(r, previewTitleField),
  }))

  const editor = (
    <Puck
      config={config}
      data={initial}
      onPublish={save}
      overrides={isEmail ? undefined : puckOverrides}
      viewports={isEmail ? EMAIL_VIEWPORTS : PUCK_VIEWPORTS}
      iframe={PUCK_IFRAME}
    >
      <BuilderShell
        onPublish={save}
        breakpoints={breakpoints}
        onBreakpointsChange={
          isEmail
            ? undefined
            : (next: Breakpoint[]) =>
                updateBp.mutate(next, { onError: () => toast.error('Could not save breakpoints') })
        }
        savedColors={savedColors}
        themeColors={themeColors}
        topbarStart={
          <>
            <Link
              href="/admin/templates"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5')}
            >
              <ArrowLeft className="size-4" />
              Templates
            </Link>
            <span className="truncate text-sm font-medium">{template.name}</span>
            {isCollection ? (
              <div className="hidden shrink-0 items-center gap-2 md:flex">
                <span
                  className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-300"
                  title={
                    sample
                      ? `Designing one ${collectionKey} item card. Bind elements from their Settings tab; the card repeats once per record in a Collection List.`
                      : `No published ${collectionKey} record to preview yet — bound fields show their static text.`
                  }
                >
                  Item card · {collectionKey}
                </span>
                {sampleRecords.length > 0 ? (
                  <label className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Preview</span>
                    <PanelSelect
                      value={sample?.id}
                      onChange={pickPreviewRecord}
                      options={recordOptions}
                      className="w-44"
                      placeholder="Newest record"
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
          </>
        }
      />

      <Toaster richColors position="bottom-right" />
    </Puck>
  )

  if (!isCollection) return editor

  // The iframe is disabled, so both contexts reach the canvas: the scope feeds
  // the Settings tab's field dropdowns, the record feeds the bound elements.
  return (
    <CollectionScopeContext.Provider value={collectionKey || null}>
      <RecordContext.Provider value={{ fields: sampleFields, editing: true }}>
        {editor}
      </RecordContext.Provider>
    </CollectionScopeContext.Provider>
  )
}

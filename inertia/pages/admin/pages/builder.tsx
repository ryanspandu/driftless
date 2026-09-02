import '@measured/puck/puck.css'
import { Puck, type Data } from '@measured/puck'
import { useState } from 'react'
import { Link } from '@inertiajs/react'
import { ArrowLeft, Code2, Eye, ExternalLink, History } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { puckConfig } from '~/puck/config'
import { builderViewports } from '~/puck/style-fields'
import { puckOverrides } from '~/puck/overrides'
import { BuilderShell } from '~/puck/builder-shell'
import { BuilderLoadState } from '~/puck/builder-load-state'
import { customPageHasRegion } from '~/custom/registry'
import type { PageMeta } from '~/puck/settings-dialog'
import {
  usePage as usePageRecord,
  usePublishPage,
  useSaveDraft,
  useDiscardDraft,
} from '~/hooks/api/use-pages'
import { useBreakpoints, useUpdateBreakpoints } from '~/hooks/api/use-breakpoints'
import { readBreakpoints, type Breakpoint } from '~/puck/breakpoints'
import type { PageDto } from '~/types/api'
import { buttonVariants } from '~/components/ui/button'
import { PageRevisionsPanel } from '~/components/admin/page-revisions-panel'
import { cn } from '~/lib/utils'

const EMPTY_DOC = { content: [], root: {} } as unknown as Data

// Render the canvas in the host document instead of an isolated iframe. Puck's
// iframe auto-frame (style/attribute sync + cross-document measurement) is the
// heavy, freeze-prone path; disabling it keeps the editor responsive. Stable
// module-level refs so these props don't change identity across renders.
const PUCK_IFRAME = { enabled: false }
const PUCK_VIEWPORTS = [...builderViewports]

export default function PageBuilder({ id }: { id: string }) {
  const pageQuery = usePageRecord(id)
  const page = pageQuery.data

  if (!page) {
    return (
      <BuilderLoadState
        error={pageQuery.error}
        backHref="/admin/pages"
        backLabel="Back to Pages"
        missingLabel="This page no longer exists. It may have been deleted, or its link may be out of date."
      />
    )
  }

  /**
   * A code page opens the builder only if it declares an editable region.
   *
   * Without one there is no block tree to edit: Puck would show an empty canvas
   * and Publish would save that empty document over a page whose markup lives
   * in a file. With one, the builder edits exactly that region — the same
   * `content` column a builder page uses — so nothing here needs to change
   * except the decision to open it.
   */
  const isCode = page.kind === 'CODE'
  const hasRegion = isCode && customPageHasRegion(page.component ?? '')
  if (isCode && !hasRegion) {
    return <CodePageNotice page={page} />
  }

  return <BuilderInner id={id} page={page} regionOf={hasRegion ? page.component : null} />
}

function CodePageNotice({ page }: { page: PageDto }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <Code2 className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium">This page is built in code</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Its markup comes from{' '}
        <code className="font-mono text-xs">inertia/custom/pages/{page.component}.tsx</code>, not
        from the visual builder. Edit that file to change the page; use the Pages list for its path,
        status and SEO.
      </p>
      <div className="mt-1 flex items-center gap-2">
        <Link
          href="/admin/pages"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
        >
          <ArrowLeft className="size-4" />
          Pages
        </Link>
        <a
          href={`/admin/pages/${page.id}/preview`}
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
      </div>
    </div>
  )
}

/**
 * Inner builder — rendered only once the page has loaded, so page-level settings
 * (title/path/status/render mode/templates/SEO) can be seeded into local state
 * and edited from the Settings dialog. Everything is persisted together on
 * Publish (Puck `content` + `PageMeta`).
 */
function BuilderInner({
  id,
  page,
  regionOf,
}: {
  id: string
  page: PageDto
  /** Slug of the code page this region belongs to, when editing one. */
  regionOf?: string | null
}) {
  const publishMut = usePublishPage()
  const saveDraftMut = useSaveDraft()
  const discardMut = useDiscardDraft()
  const bpQuery = useBreakpoints()
  const updateBp = useUpdateBreakpoints()
  // Site-wide tiers, normalised client-side (falls back to the standard set while
  // loading or if the read is not permitted).
  const breakpoints = readBreakpoints(bpQuery.data?.breakpoints)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [meta, setMeta] = useState<PageMeta>(() => ({
    title: page.title,
    path: page.path,
    status: page.status,
    renderMode: page.renderMode,
    layoutId: page.layoutId,
    headerTemplateId: page.headerTemplateId,
    footerTemplateId: page.footerTemplateId,
    hideHeader: Boolean(page.hideHeader),
    hideFooter: Boolean(page.hideFooter),
    // Edit the staged draft SEO when one exists, else the live SEO.
    seo: (page.draftSeo ?? page.seo ?? {}) as Record<string, unknown>,
    scheduledPublishAt: page.scheduledPublishAt,
    scheduledUnpublishAt: page.scheduledUnpublishAt,
  }))

  // Open the staged draft design when there is one, so autosaved work resumes.
  const openDoc = (page.draftContent ?? page.content) as Record<string, unknown> | null
  const initial = openDoc && Object.keys(openDoc).length ? (openDoc as unknown as Data) : EMPTY_DOC

  const metaFields = () => ({
    title: meta.title,
    path: meta.path,
    renderMode: meta.renderMode,
    layoutId: meta.layoutId,
    headerTemplateId: meta.headerTemplateId,
    footerTemplateId: meta.footerTemplateId,
    hideHeader: meta.hideHeader,
    hideFooter: meta.hideFooter,
    seo: meta.seo,
    scheduledPublishAt: meta.scheduledPublishAt ?? null,
    scheduledUnpublishAt: meta.scheduledUnpublishAt ?? null,
  })

  const save = async (data: Data) => {
    try {
      await publishMut.mutateAsync({
        id,
        content: data as unknown as Record<string, unknown>,
        ...metaFields(),
      })
      setMeta((m) => ({ ...m, status: 'PUBLISHED' }))
      toast.success('Page published')
    } catch (error) {
      toast.error('Failed to publish')
      // Rethrown so BuilderShell keeps the page marked unsaved — a failed save
      // that clears the guard is how you lose the work you thought was safe.
      throw error
    }
  }

  // Autosave stages content + SEO to the draft; the live page is untouched.
  const autosave = async (data: Data, seo: Record<string, unknown>) => {
    await saveDraftMut.mutateAsync({
      id,
      content: data as unknown as Record<string, unknown>,
      seo,
    })
  }

  const discardDraft = async () => {
    await discardMut.mutateAsync(id)
    // Reload to reopen the builder on the live design.
    window.location.reload()
  }

  return (
    <Puck
      config={puckConfig}
      data={initial}
      onPublish={save}
      overrides={puckOverrides}
      viewports={PUCK_VIEWPORTS}
      iframe={PUCK_IFRAME}
    >
      <BuilderShell
        onPublish={save}
        onAutosave={autosave}
        hasDraft={Boolean(page.draftContent)}
        onDiscardDraft={discardDraft}
        pageMeta={meta}
        onPageMetaChange={setMeta}
        breakpoints={breakpoints}
        onBreakpointsChange={(next: Breakpoint[]) =>
          updateBp.mutate(next, { onError: () => toast.error('Could not save breakpoints') })
        }
        topbarStart={
          <>
            <Link
              href="/admin/pages"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0 gap-1.5')}
            >
              <ArrowLeft className="size-4" />
              Pages
            </Link>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{meta.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">/{meta.path}</span>
            {/*
              Says what is being edited. Without it the canvas looks like a whole
              page, when in fact it is one region inside a component — and the
              surrounding markup, which is not shown here, is not editable.
            */}
            {regionOf ? (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                Editable region of <code className="font-mono">custom/pages/{regionOf}.tsx</code>
              </span>
            ) : null}
          </>
        }
        topbarEnd={
          <>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
              onClick={() => setHistoryOpen(true)}
            >
              <History className="size-4" />
              Version history
            </button>
            <a
              href={`/admin/pages/${id}/preview`}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
            >
              <Eye className="size-4" />
              Preview draft
            </a>
            {meta.status === 'PUBLISHED' ? (
              <a
                href={`/${meta.path}`}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
              >
                <ExternalLink className="size-4" />
                View live page
              </a>
            ) : null}
          </>
        }
      />

      <PageRevisionsPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        pageId={id}
        onRestored={() => window.location.reload()}
      />

      <Toaster richColors position="bottom-right" />
    </Puck>
  )
}

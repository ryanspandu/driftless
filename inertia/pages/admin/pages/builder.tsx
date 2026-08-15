import '@measured/puck/puck.css'
import { Puck, type Data } from '@measured/puck'
import { useState } from 'react'
import { Link } from '@inertiajs/react'
import { ArrowLeft, Eye, ExternalLink, History } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { puckConfig } from '~/puck/config'
import { builderViewports } from '~/puck/style-fields'
import { puckOverrides } from '~/puck/overrides'
import { BuilderShell } from '~/puck/builder-shell'
import type { PageMeta } from '~/puck/settings-dialog'
import { usePage as usePageRecord, useUpdatePage } from '~/hooks/api/use-pages'
import type { PageDto } from '~/types/api'
import { Button, buttonVariants } from '~/components/ui/button'
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

  if (pageQuery.isLoading || !page) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading builder…
      </div>
    )
  }

  return <BuilderInner id={id} page={page} />
}

/**
 * Inner builder — rendered only once the page has loaded, so page-level settings
 * (title/path/status/render mode/templates/SEO) can be seeded into local state
 * and edited from the Settings dialog. Everything is persisted together on
 * Publish (Puck `content` + `PageMeta`).
 */
function BuilderInner({ id, page }: { id: string; page: PageDto }) {
  const updateMut = useUpdatePage()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [meta, setMeta] = useState<PageMeta>(() => ({
    title: page.title,
    path: page.path,
    status: page.status,
    renderMode: page.renderMode,
    layoutId: page.layoutId,
    headerTemplateId: page.headerTemplateId,
    footerTemplateId: page.footerTemplateId,
    seo: (page.seo ?? {}) as Record<string, unknown>,
  }))

  const initial =
    page.content && Object.keys(page.content).length
      ? (page.content as unknown as Data)
      : EMPTY_DOC

  const save = async (data: Data) => {
    try {
      await updateMut.mutateAsync({
        id,
        content: data as unknown as Record<string, unknown>,
        title: meta.title,
        path: meta.path,
        status: meta.status,
        renderMode: meta.renderMode,
        layoutId: meta.layoutId,
        headerTemplateId: meta.headerTemplateId,
        footerTemplateId: meta.footerTemplateId,
        seo: meta.seo,
      })
      toast.success('Page saved')
    } catch (error) {
      toast.error('Failed to save')
      // Rethrown so BuilderShell keeps the page marked unsaved — a failed save
      // that clears the guard is how you lose the work you thought was safe.
      throw error
    }
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
        pageMeta={meta}
        onPageMetaChange={setMeta}
        topbarStart={
          <>
            <Link
              href="/admin/pages"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5')}
            >
              <ArrowLeft className="size-4" />
              Pages
            </Link>
            <span className="truncate text-sm font-medium">{meta.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">/{meta.path}</span>
          </>
        }
        topbarEnd={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => setHistoryOpen(true)}
            >
              <History className="size-4" />
              History
            </Button>
            <a
              href={`/admin/pages/${id}/preview`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Eye className="size-4" />
              Preview
            </a>
            {meta.status === 'PUBLISHED' ? (
              <a
                href={`/${meta.path}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-4" />
                View live
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

import '@measured/puck/puck.css'
import { Puck, type Data } from '@measured/puck'
import { useState } from 'react'
import { Link } from '@inertiajs/react'
import { ArrowLeft, ExternalLink, History } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { puckConfig } from '~/puck/config'
import { builderViewports } from '~/puck/style-fields'
import { puckOverrides } from '~/puck/overrides'
import { usePage as usePageRecord, useUpdatePage } from '~/hooks/api/use-pages'
import { Button, buttonVariants } from '~/components/ui/button'
import { PageRevisionsPanel } from '~/components/admin/page-revisions-panel'
import { cn } from '~/lib/utils'

const EMPTY_DOC = { content: [], root: {} } as unknown as Data

export default function PageBuilder({ id }: { id: string }) {
  const pageQuery = usePageRecord(id)
  const updateMut = useUpdatePage()
  const page = pageQuery.data
  const [historyOpen, setHistoryOpen] = useState(false)

  if (pageQuery.isLoading || !page) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading builder…
      </div>
    )
  }

  const initial =
    page.content && Object.keys(page.content).length
      ? (page.content as unknown as Data)
      : EMPTY_DOC

  const save = async (data: Data) => {
    try {
      await updateMut.mutateAsync({ id, content: data as unknown as Record<string, unknown> })
      toast.success('Page design saved')
    } catch {
      toast.error('Failed to save')
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-3">
        <div className="flex items-center gap-2">
          <Link
            href="/admin/pages"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5')}
          >
            <ArrowLeft className="size-4" />
            Pages
          </Link>
          <span className="text-sm font-medium">{page.title}</span>
          <span className="text-xs text-muted-foreground">/{page.path}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setHistoryOpen(true)}
          >
            <History className="size-4" />
            History
          </Button>
          {page.status === 'PUBLISHED' ? (
            <a
              href={`/${page.path}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-4" />
              View live
            </a>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Puck
          config={puckConfig}
          data={initial}
          onPublish={save}
          overrides={puckOverrides}
          viewports={[...builderViewports]}
        />
      </div>

      <PageRevisionsPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        pageId={id}
        onRestored={() => window.location.reload()}
      />

      <Toaster richColors position="bottom-right" />
    </div>
  )
}

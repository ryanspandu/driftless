import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { useGlobalCode, useUpdateGlobalCode } from '~/hooks/api/use-page-code'
import type { CodeSnippet } from './custom-code'
import { SnippetManager } from './snippet-manager'

/**
 * Editor for the site-wide custom code. Saved EXPLICITLY (not tied to page
 * Publish) since it's stored in `web_settings` and applies to every page. Reused
 * by the builder Settings dialog ("Global code" section) and the `/admin/pages`
 * Global code dialog — both share the same data via `use-page-code`.
 */
export function GlobalCodePanel({ onClose }: { onClose?: () => void }) {
  const query = useGlobalCode()
  const updateMut = useUpdateGlobalCode()
  const server = query.data?.snippets
  const [draft, setDraft] = useState<CodeSnippet[] | null>(null)

  // Seed the editable draft once the server data arrives.
  useEffect(() => {
    if (server && draft === null) setDraft(server)
  }, [server, draft])

  const snippets = draft ?? server ?? []
  const dirty =
    draft !== null && server !== undefined && JSON.stringify(draft) !== JSON.stringify(server)

  const save = async () => {
    if (!draft) return
    try {
      const res = await updateMut.mutateAsync(draft)
      setDraft(res.snippets)
      toast.success('Global code saved')
    } catch {
      toast.error('Failed to save global code')
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        {query.isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <SnippetManager
            snippets={snippets}
            onChange={setDraft}
            title="Global code"
            description={
              <>
                Injected on <strong>every published page</strong> (site-wide). JS runs on live pages
                only, never in the editor.
              </>
            }
          />
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t p-3">
        <span className="text-xs text-muted-foreground">
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <div className="flex gap-2">
          {onClose ? (
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          ) : null}
          <Button size="sm" disabled={!dirty || updateMut.isPending} onClick={save}>
            {updateMut.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

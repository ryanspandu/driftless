import { History, Loader2, RotateCcw } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { usePageRevisions, useRestorePageRevision } from '~/hooks/api/use-page-revisions'
import { formatAdminTableDateTime } from '~/lib/utils'

interface PageRevisionsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pageId: string
  /** Called after a revision is successfully restored. */
  onRestored?: () => void
}

/**
 * Modal listing append-only page revisions. "Restore" snapshots the selected
 * revision as a new update so history is preserved.
 */
export function PageRevisionsPanel({
  open,
  onOpenChange,
  pageId,
  onRestored,
}: PageRevisionsPanelProps) {
  const query = usePageRevisions(pageId, open)
  const restoreMut = useRestorePageRevision()
  const confirmDelete = useConfirmDelete()

  const revisions = query.data ?? []

  const handleRestore = (revisionId: string, createdAt: string) => {
    void confirmDelete({
      title: 'Restore revision',
      description: `Restore the page design from ${formatAdminTableDateTime(createdAt)}? Your current design will be saved as a new revision first.`,
      confirmLabel: 'Restore',
      onConfirm: async () => {
        await restoreMut.mutateAsync({ pageId, revisionId })
        onRestored?.()
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5" />
            Revision history
          </DialogTitle>
          <DialogDescription>
            {query.isLoading
              ? 'Loading…'
              : `${revisions.length} revision${revisions.length === 1 ? '' : 's'}`}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {revisions.map((rev) => (
            <div key={rev.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {formatAdminTableDateTime(rev.createdAt)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {rev.authorId ?? 'system'} ·{' '}
                    <Badge variant="outline" className="text-[10px]">
                      {rev.status}
                    </Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="gap-1"
                  disabled={restoreMut.isPending}
                  onClick={() => handleRestore(rev.id, rev.createdAt)}
                >
                  {restoreMut.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3" />
                  )}
                  Restore
                </Button>
              </div>
            </div>
          ))}
          {!query.isLoading && revisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No revisions yet.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

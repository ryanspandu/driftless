
import { useState } from "react";
import { History, Loader2, RotateCcw } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  useCmsRevisions,
  useRestoreRevision,
} from "~/hooks/api/use-cms-records";

interface RevisionsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionKey: string;
  recordId: string;
}

/**
 * Modal listing append-only revisions. "Restore" snapshots the selected
 * revision as a new update so history is preserved.
 */
export function RevisionsPanel({
  open,
  onOpenChange,
  collectionKey,
  recordId,
}: RevisionsPanelProps) {
  
  const query = useCmsRevisions(collectionKey, recordId)
  const restoreMut = useRestoreRevision(collectionKey, recordId)
  const [preview, setPreview] = useState<string | null>(null);

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
              ? "Loading…"
              : `${query.data?.length ?? 0} revision${(query.data?.length ?? 0) === 1 ? "" : "s"}`}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {query.data?.map((rev) => (
            <div
              key={rev.id}
              className="rounded-lg border bg-card p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {new Date(rev.createdAt).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {rev.authorId ?? "system"} ·{" "}
                    <Badge variant="outline" className="text-[10px]">
                      {rev.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPreview(
                        preview === rev.id
                          ? null
                          : rev.id,
                      )
                    }
                  >
                    {preview === rev.id ? "Hide" : "Preview"}
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1"
                    disabled={restoreMut.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `Restore revision from ${new Date(rev.createdAt).toLocaleString()}?`,
                        )
                      ) {
                        restoreMut.mutate(rev.id);
                      }
                    }}
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
              {preview === rev.id ? (
                <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 text-[11px]">
                  {JSON.stringify(rev.data, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
          {query.data && query.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No revisions yet.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import * as React from "react";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";
import { DataTable } from "~/components/data-table";
import { useConfirmDelete } from "~/components/providers/delete-confirm-provider";

export type TrashModalProps<TRow extends { id: string | number }> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** Soft-deleted rows to display. */
  rows: TRow[];
  /** Columns to show (TrashModal appends its own Restore / Delete-forever actions). */
  columns: ColumnDef<TRow, unknown>[];
  isLoading?: boolean;
  emptyMessage?: string;
  getRowId?: (row: TRow) => string;
  onRestore: (id: string) => Promise<void>;
  onForceDelete: (id: string) => Promise<void>;
  /** Singular noun for the items, used in confirmation copy (e.g. "post", "user"). */
  itemNoun?: string;
};

/**
 * Reusable Trash dialog: lists soft-deleted rows in the shared `DataTable`, with
 * per-row and bulk Restore / Delete-forever actions. Permanent deletes are
 * routed through the shared `confirmDelete` modal.
 */
export function TrashModal<TRow extends { id: string | number }>({
  open,
  onOpenChange,
  title = "Trash",
  rows,
  columns,
  isLoading,
  emptyMessage = "Trash is empty.",
  getRowId,
  onRestore,
  onForceDelete,
  itemNoun = "item",
}: TrashModalProps<TRow>) {
  const confirmDelete = useConfirmDelete();
  const [selection, setSelection] = React.useState<RowSelectionState>({});
  const [busy, setBusy] = React.useState(false);

  const resolveId = React.useCallback(
    (row: TRow) => String(getRowId ? getRowId(row) : row.id),
    [getRowId],
  );

  const selectedIds = React.useMemo(
    () => Object.keys(selection).filter((k) => selection[k]),
    [selection],
  );

  React.useEffect(() => {
    if (!open) setSelection({});
  }, [open]);

  const runRestore = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    try {
      for (const id of ids) await onRestore(id);
      setSelection({});
    } finally {
      setBusy(false);
    }
  };

  const runForceDelete = async (ids: string[]) => {
    if (!ids.length) return;
    const ok = await confirmDelete({
      title: "Delete forever",
      description: `Permanently delete ${ids.length} ${itemNoun}${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Delete forever",
    });
    if (!ok) return;
    setBusy(true);
    try {
      for (const id of ids) await onForceDelete(id);
      setSelection({});
    } finally {
      setBusy(false);
    }
  };

  const trashColumns = React.useMemo<ColumnDef<TRow, unknown>[]>(
    () => [
      ...columns,
      {
        id: "trash-actions",
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const id = resolveId(row.original);
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="gap-1"
                disabled={busy}
                onClick={() => void runRestore([id])}
              >
                <RotateCcw className="size-4" />
                Restore
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-destructive"
                disabled={busy}
                aria-label="Delete forever"
                onClick={() => void runForceDelete([id])}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runRestore/runForceDelete are stable enough; busy gates them
    [columns, resolveId, busy],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="relative max-w-4xl">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isLoading
              ? "Loading…"
              : `${rows.length} deleted ${itemNoun}${rows.length === 1 ? "" : "s"}. Restore to recover, or delete forever to remove permanently.`}
          </DialogDescription>
        </DialogHeader>

        {selectedIds.length > 0 && (
          <div className="mb-3 flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
            <span>{selectedIds.length} selected</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={busy}
                onClick={() => void runRestore(selectedIds)}
              >
                <RotateCcw className="size-4" />
                Restore
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1"
                disabled={busy}
                onClick={() => void runForceDelete(selectedIds)}
              >
                <Trash2 className="size-4" />
                Delete forever
              </Button>
            </div>
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto">
          <DataTable
            columns={trashColumns}
            data={rows}
            getRowId={getRowId}
            enableBulkSelect
            onRowSelectionChange={setSelection}
            hideSearch
            hideSyncColumn
            emptyMessage={isLoading ? "Loading…" : emptyMessage}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

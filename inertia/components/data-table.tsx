
import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type FilterFn,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { useSearchParams } from "~/hooks/use-inertia-url";
import {
  useDataTableUrlSync,
  type DataTableUrlSyncState,
} from "~/hooks/use-data-table-url-sync";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  CloudOff,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { DataTablePagination } from "~/components/data-table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

export type SyncStatus = {
  /** Whether the row is already persisted on the server. */
  synced: boolean;
  /** ISO string / Date of the last successful sync (used for the tooltip and overall label). */
  syncedAt?: Date | string | null;
  /** ISO string / Date when the local change was queued, for "pending" rows. */
  pendingSince?: Date | string | null;
  /** True when an offline change could not be reconciled and needs the user to resolve it. */
  conflict?: boolean;
  /** Human-readable reason shown in the Sync tooltip when conflict/error. */
  error?: string | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return "never";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "just now";
  const s = Math.floor(diffMs / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAbsoluteTime(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function defaultGetSyncStatus<TData>(row: TData): SyncStatus {
  const r = row as Record<string, unknown>;
  const raw = r.syncStatus;
  if (raw && typeof raw === "object") {
    const s = raw as SyncStatus;
    return {
      synced: s.synced !== false,
      syncedAt: s.syncedAt ?? null,
      pendingSince: s.pendingSince ?? null,
    };
  }
  const syncedAt =
    (r.syncedAt as string | Date | undefined) ??
    (r.updatedAt as string | Date | undefined) ??
    null;
  return { synced: true, syncedAt };
}

function applyUpdater<T>(updater: Updater<T>, prev: T): T {
  return typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
}

/** Sticky actions column — matches the header / row surface and selection (not page bg). */
const stickyActionsHeadClass =
  "sticky right-0 z-20 w-12 min-w-12 bg-muted";
const stickyActionsCellClass =
  "sticky right-0 z-10 w-12 min-w-12 bg-card group-hover:bg-muted/50 group-data-[state=selected]:bg-muted";

const defaultGlobalFilter: FilterFn<unknown> = (row, _columnId, filterValue) => {
  const q = String(filterValue ?? "")
    .toLowerCase()
    .trim();
  if (!q) return true;
  return JSON.stringify(row.original).toLowerCase().includes(q);
};

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}) {
  if (!column.getCanSort()) {
    return <div className={cn("text-[13px] font-medium", className)}>{title}</div>;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "-ml-2 h-7 gap-1 px-2 text-[13px] font-medium hover:bg-transparent hover:font-bold dark:hover:bg-transparent",
        className
      )}
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      aria-sort={
        column.getIsSorted() === "asc"
          ? "ascending"
          : column.getIsSorted() === "desc"
            ? "descending"
            : "none"
      }
    >
      <span>{title}</span>
      {column.getIsSorted() === "desc" ? (
        <ArrowDown className="size-3.5 shrink-0 opacity-80" aria-hidden />
      ) : column.getIsSorted() === "asc" ? (
        <ArrowUp className="size-3.5 shrink-0 opacity-80" aria-hidden />
      ) : (
        <ArrowUpDown
          className="size-3.5 shrink-0 text-muted-foreground opacity-60"
          aria-hidden
        />
      )}
    </Button>
  );
}

export type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  searchPlaceholder?: string;
  /** Page size options in the selector (default: 5, 10, 20, 50) */
  pageSizeOptions?: number[];
  /** Initial rows per page (default: 10) */
  defaultPageSize?: number;
  emptyMessage?: React.ReactNode;
  className?: string;
  /** When true, hides the built-in search input (e.g. if you add a custom filter elsewhere) */
  hideSearch?: boolean;
  /**
   * Controlled search value. When `onSearchChange` is provided the search box
   * is driven by the parent (e.g. server-side search) and the built-in
   * client-side global filter is bypassed.
   */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Extra filter controls rendered to the right of the search box (left cluster of the toolbar). */
  filters?: React.ReactNode;
  /** Actions rendered on the right of the toolbar, next to "Last synced" (e.g. a Trash button). */
  toolbarActions?: React.ReactNode;
  /** First-column bulk select checkboxes (default: true). Requires stable row ids via `getRowId` or `id` on each row. */
  enableBulkSelect?: boolean;
  /** Stable unique id per row; defaults to `String(row.id)` when present, else row index. */
  getRowId?: (originalRow: TData, index: number) => string;
  /** Called when selection changes (for bulk actions, etc.). */
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  /** Hide the default Sync column (default: false). */
  hideSyncColumn?: boolean;
  /**
   * Returns the sync state for a row. Defaults to reading `row.syncStatus` if present,
   * otherwise assumes the row is synced using `row.syncedAt ?? row.updatedAt`.
   */
  getSyncStatus?: (row: TData) => SyncStatus;
  /**
   * Overall dataset "last synced" timestamp shown in the top-right of the toolbar.
   * When omitted, derived from the latest `syncedAt` across rows.
   */
  lastSyncedAt?: Date | string | null;
  /**
   * When set, search / pagination / sort are reflected in the URL query string.
   * Use `paramPrefix` when multiple tables share one route (e.g. dashboard tabs).
   */
  urlSync?: { paramPrefix?: string };
  /**
   * Server-driven pagination (e.g. API returns one page of rows).
   * Disables client-side page slicing; use a single shared pagination footer.
   */
  serverPagination?: {
    /** 0-based page index */
    pageIndex: number;
    pageSize: number;
    totalRows: number;
    pageCount: number;
    onPageIndexChange: (pageIndex: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    pageSizeOptions?: number[];
    disabled?: boolean;
  };
};

type DataTableInnerProps<TData> = Omit<DataTableProps<TData>, "urlSync"> & {
  urlSynced?: DataTableUrlSyncState;
};

function DataTableUrlSynced<TData>(props: DataTableProps<TData>) {
  const searchParams = useSearchParams();
  const { urlSync, ...rest } = props;
  const sync = useDataTableUrlSync({
    paramPrefix: urlSync?.paramPrefix,
    defaultPageSize: rest.defaultPageSize ?? 10,
    pageSizeOptions: rest.pageSizeOptions ?? [5, 10, 20, 50],
    searchParams,
    includeQueryInUrl: !rest.hideSearch,
  });
  return <DataTableInner {...rest} urlSynced={sync} />;
}

function DataTableInner<TData>({
  columns,
  data,
  searchPlaceholder = "Search…",
  pageSizeOptions = [5, 10, 20, 50],
  defaultPageSize = 10,
  emptyMessage = "No results.",
  className,
  hideSearch = false,
  searchValue,
  onSearchChange,
  filters,
  toolbarActions,
  enableBulkSelect = true,
  getRowId: getRowIdProp,
  onRowSelectionChange: onRowSelectionChangeProp,
  hideSyncColumn = false,
  getSyncStatus,
  lastSyncedAt,
  urlSynced,
  serverPagination,
}: DataTableInnerProps<TData>) {
  const isServerPagination = !!serverPagination;
  const [localGlobalFilter, setLocalGlobalFilter] = React.useState("");
  const [localSorting, setLocalSorting] = React.useState<SortingState>([]);
  const [localPagination, setLocalPagination] = React.useState({
    pageIndex: 0,
    pageSize: defaultPageSize,
  });
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const globalFilter = urlSynced?.globalFilter ?? localGlobalFilter;
  const sorting = urlSynced?.sorting ?? localSorting;
  const pagination = isServerPagination
    ? {
        pageIndex: serverPagination.pageIndex,
        pageSize: serverPagination.pageSize,
      }
    : (urlSynced?.pagination ?? localPagination);

  const onGlobalFilterChange = React.useCallback(
    (updater: Updater<string>) => {
      const next = applyUpdater(updater, globalFilter);
      if (urlSynced) {
        urlSynced.setGlobalFilter(String(next));
      } else {
        setLocalGlobalFilter(String(next));
        setLocalPagination((p) => ({ ...p, pageIndex: 0 }));
      }
    },
    [globalFilter, urlSynced],
  );

  const onPaginationChange = React.useCallback(
    (updater: Updater<{ pageIndex: number; pageSize: number }>) => {
      if (isServerPagination) return;
      if (urlSynced) {
        urlSynced.setPagination(updater);
      } else {
        setLocalPagination((prev) => applyUpdater(updater, prev));
      }
    },
    [isServerPagination, urlSynced],
  );

  const onSortingChange = React.useCallback(
    (updater: Updater<SortingState>) => {
      if (urlSynced) {
        urlSynced.setSorting(updater);
      } else {
        setLocalSorting((prev) => applyUpdater(updater, prev));
      }
    },
    [urlSynced],
  );

  const onRowSelectionChangeRef = React.useRef(onRowSelectionChangeProp);
  onRowSelectionChangeRef.current = onRowSelectionChangeProp;

  const resolveRowId = React.useCallback(
    (row: TData, index: number) => {
      if (getRowIdProp) return getRowIdProp(row, index);
      const r = row as Record<string, unknown>;
      if (r.id !== undefined && r.id !== null) return String(r.id);
      return String(index);
    },
    [getRowIdProp]
  );

  const resolveSyncStatus = React.useCallback(
    (row: TData): SyncStatus => {
      return getSyncStatus ? getSyncStatus(row) : defaultGetSyncStatus(row);
    },
    [getSyncStatus]
  );

  const tableColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    const cols = [...columns];

    if (!hideSyncColumn) {
      const syncColumn: ColumnDef<TData, unknown> = {
        id: "sync",
        size: 64,
        enableSorting: false,
        enableGlobalFilter: false,
        header: () => (
          <div className="text-center text-[13px] font-medium text-muted-foreground">
            Sync
          </div>
        ),
        cell: ({ row }) => {
          const status = resolveSyncStatus(row.original);
          const syncedAt = toDate(status.syncedAt);
          const pendingSince = toDate(status.pendingSince);
          const isConflict = !status.synced && !!status.conflict;

          return (
            <div className="flex items-center justify-center">
              <Tooltip>
                <TooltipTrigger
                  className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60"
                  aria-label={
                    status.synced
                      ? `Synced ${syncedAt ? formatRelativeTime(syncedAt) : ""}`.trim()
                      : isConflict
                        ? "Sync conflict — needs attention"
                        : "Not yet synced to server"
                  }
                >
                  {status.synced ? (
                    <CheckCircle2
                      className="size-4 text-emerald-600 dark:text-emerald-400"
                      aria-hidden
                    />
                  ) : isConflict ? (
                    <AlertTriangle
                      className="size-4 text-amber-600 dark:text-amber-400"
                      aria-hidden
                    />
                  ) : (
                    <CloudOff
                      className="size-4 text-grey-600 dark:text-grey-400"
                      aria-hidden
                    />
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  {status.synced ? (
                    <span>
                      Synced
                      {syncedAt ? (
                        <>
                          {" · "}
                          <span className="tabular-nums">
                            {formatRelativeTime(syncedAt)}
                          </span>
                          <span className="opacity-70">
                            {" "}
                            ({formatAbsoluteTime(syncedAt)})
                          </span>
                        </>
                      ) : null}
                    </span>
                  ) : isConflict ? (
                    <span className="flex max-w-[220px] flex-col gap-0.5">
                      <span className="font-medium text-amber-500">
                        Sync conflict
                      </span>
                      <span className="text-xs opacity-90">
                        {status.error ??
                          "This change could not be saved to the server."}
                      </span>
                    </span>
                  ) : (
                    <span>
                      Not synced to server yet
                      {pendingSince ? (
                        <>
                          {" · pending "}
                          <span className="tabular-nums">
                            {formatRelativeTime(pendingSince)}
                          </span>
                        </>
                      ) : null}
                    </span>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          );
        },
      };

      // Insert before a trailing "actions" column if present, otherwise append.
      const lastIdx = cols.length - 1;
      if (lastIdx >= 0 && cols[lastIdx]?.id === "actions") {
        cols.splice(lastIdx, 0, syncColumn);
      } else {
        cols.push(syncColumn);
      }
    }

    if (!enableBulkSelect) return cols;

    const selectColumn: ColumnDef<TData, unknown> = {
      id: "select",
      size: 48,
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
          }
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all rows on this page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          disabled={!row.getCanSelect()}
          aria-label="Select row"
        />
      ),
    };

    return [selectColumn, ...cols];
  }, [columns, enableBulkSelect, hideSyncColumn, resolveSyncStatus]);

  React.useEffect(() => {
    onRowSelectionChangeRef.current?.(rowSelection);
  }, [rowSelection]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is designed around this hook
  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { globalFilter, sorting, rowSelection, pagination },
    onGlobalFilterChange,
    onPaginationChange,
    onSortingChange,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: enableBulkSelect,
    getRowId: enableBulkSelect ? resolveRowId : undefined,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(isServerPagination
      ? { manualPagination: true as const, pageCount: serverPagination.pageCount }
      : { getPaginationRowModel: getPaginationRowModel() }),
    globalFilterFn: defaultGlobalFilter as FilterFn<TData>,
    // We reset pageIndex manually inside onGlobalFilterChange. Without this,
    // TanStack auto-resets to 0 whenever the `data` array reference changes
    // (e.g. offline refetch / live sync), wiping pagination from the URL.
    autoResetPageIndex: false,
  });

  const filteredRows = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize } = isServerPagination
    ? {
        pageIndex: serverPagination.pageIndex,
        pageSize: serverPagination.pageSize,
      }
    : table.getState().pagination;
  const pageCount = isServerPagination
    ? serverPagination.pageCount
    : table.getPageCount();
  const totalRows = isServerPagination ? serverPagination.totalRows : filteredRows;

  // Clamp the current page when filtering shrinks the dataset below it.
  // We keep `autoResetPageIndex: false` (so refetches don't wipe URL state),
  // but still want to avoid sitting on an out-of-range page after filter changes.
  React.useEffect(() => {
    if (isServerPagination) return;
    if (pageCount > 0 && pageIndex > pageCount - 1) {
      table.setPageIndex(pageCount - 1);
    }
  }, [isServerPagination, pageCount, pageIndex, table]);

  const overallLastSyncedAt = React.useMemo<Date | null>(() => {
    if (hideSyncColumn) return toDate(lastSyncedAt);
    if (lastSyncedAt !== undefined) return toDate(lastSyncedAt);
    let latest: Date | null = null;
    let sawPending = false;
    for (const row of data) {
      const s = resolveSyncStatus(row);
      if (!s.synced) {
        sawPending = true;
        continue;
      }
      const d = toDate(s.syncedAt);
      if (d && (!latest || d.getTime() > latest.getTime())) {
        latest = d;
      }
    }
    if (!latest && sawPending) return null;
    return latest;
  }, [data, hideSyncColumn, lastSyncedAt, resolveSyncStatus]);

  const isControlledSearch = onSearchChange != null;
  const searchInputValue = isControlledSearch ? searchValue ?? "" : globalFilter;
  const showToolbar =
    !hideSearch || !hideSyncColumn || filters != null || toolbarActions != null;

  return (
    <TooltipProvider>
    <div className={cn("space-y-4", className)}>
      {showToolbar && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full flex-col gap-2 sm:max-w-2xl sm:flex-row sm:items-center">
            {!hideSearch && (
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={searchInputValue}
                  onChange={(e) =>
                    isControlledSearch
                      ? onSearchChange(e.target.value)
                      : onGlobalFilterChange(e.target.value)
                  }
                  className="h-9 border-transparent bg-muted/60 pl-8 shadow-none focus-visible:border-border focus-visible:bg-background"
                  aria-label="Search table"
                />
              </div>
            )}
            {filters}
          </div>

          {(toolbarActions != null || !hideSyncColumn) && (
            <div className="flex items-center gap-2">
              {toolbarActions}
              {!hideSyncColumn && (
                <Tooltip>
                  <TooltipTrigger
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60"
                    aria-label={
                      overallLastSyncedAt
                        ? `Last synced ${formatRelativeTime(overallLastSyncedAt)}`
                        : "No sync information"
                    }
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                    <span>
                      Last synced{" "}
                      <span className="font-medium tabular-nums text-foreground/80">
                        {formatRelativeTime(overallLastSyncedAt)}
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {overallLastSyncedAt
                      ? formatAbsoluteTime(overallLastSyncedAt)
                      : "No data has been synced yet"}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </div>
      )}

      <div className="data-table rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      header.column.id === "actions" && stickyActionsHeadClass,
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="group hover:bg-muted/50"
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        cell.column.id === "actions" && stickyActionsCellClass,
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={tableColumns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination
        pageIndex={pageIndex}
        pageSize={pageSize}
        totalRows={totalRows}
        pageCount={Math.max(pageCount, 1)}
        pageSizeOptions={
          isServerPagination
            ? (serverPagination.pageSizeOptions ?? pageSizeOptions)
            : pageSizeOptions
        }
        disabled={isServerPagination ? serverPagination.disabled : false}
        onPageIndexChange={
          isServerPagination
            ? serverPagination.onPageIndexChange
            : (idx) => table.setPageIndex(idx)
        }
        onPageSizeChange={
          isServerPagination
            ? serverPagination.onPageSizeChange
            : (size) => table.setPageSize(size)
        }
      />
    </div>
    </TooltipProvider>
  );
}

export function DataTable<TData>(props: DataTableProps<TData>) {
  const { urlSync, ...rest } = props
  if (urlSync) {
    return <DataTableUrlSynced {...props} />
  }
  return <DataTableInner {...rest} />
}

export type { ColumnDef, RowSelectionState };
export {
  DataTablePagination,
  getDataTablePageList,
  type DataTablePaginationProps,
} from "~/components/data-table-pagination";


import { Link } from "@inertiajs/react";
import { usePathname, useRouter, useSearchParams } from '~/hooks/use-inertia-url'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Settings, Trash2 } from "lucide-react";
import type {
  CmsCollectionDto,
  CmsRecordDto,
  ContentStatus,
} from "~/types/api";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  CmsRecordActions,
  cmsRecordEditPath,
  cmsRecordLabel,
} from "~/components/cms/cms-record-actions";
import { useAbility } from "~/components/providers/ability-provider";
import { AppSelect } from "~/components/ui/app-select";
import {
  DataTable,
  DataTableColumnHeader,
  type SyncStatus,
} from "~/components/data-table";
import { RevisionsPanel } from "~/components/cms/revisions-panel";
import { TrashModal } from "~/components/trash-modal";
import { useCmsCollection } from "~/hooks/api/use-cms-collections";
import {
  useForceDeleteCmsRecord,
  useRestoreCmsRecord,
  useTrashedCmsRecords,
} from "~/hooks/api/use-cms-records";
import { useOfflineRecords } from "~/hooks/offline/use-offline-records";
import { useConfirmDelete } from "~/components/providers/delete-confirm-provider";
import { toSyncStatus } from "~/lib/offline/sync-status";
import {
  mergeSearchParamsLive,
  replaceUrlIfChanged,
} from "~/lib/table-url-params";
import { formatAdminTableDateTime } from "~/lib/utils";

function parseStatusParam(
  raw: string | null,
  draftsOn: boolean,
): ContentStatus | "ALL" {
  if (!draftsOn) return "ALL";
  if (raw === "DRAFT" || raw === "PUBLISHED") return raw;
  return "ALL";
}

function CmsRecordsPageInner({ collectionKey: key }: { collectionKey: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const confirmDelete = useConfirmDelete();
  const { permissions } = useAbility();

  const collectionQuery = useCmsCollection(key);
  const collection = collectionQuery.data;
  const isUserCollection = collection?.source === "PRISMA" && key === "user";
  const canCreate = permissions.canCms("create", key) && !isUserCollection;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ContentStatus | "ALL">("ALL");
  const [revisionsFor, setRevisionsFor] = useState<string | null>(null);

  const parsedFilters = useMemo(
    () => ({
      q: searchParams.get("q") ?? "",
      status: parseStatusParam(
        searchParams.get("status"),
        collection?.draftsOn ?? false,
      ),
    }),
    [searchParams, collection?.draftsOn],
  );

  useLayoutEffect(() => {
    setSearch(parsedFilters.q);
    setStatus(parsedFilters.status);
  }, [parsedFilters.q, parsedFilters.status]);

  const filtersRef = useRef({ search, status });
  useLayoutEffect(() => {
    filtersRef.current = { search, status };
  });

  const writeListFiltersToUrl = useCallback(
    () => {
      const { search: sq, status: st } = filtersRef.current;
      const patch: Record<string, string | undefined> = {};
      patch.q = sq.trim() ? sq : undefined;
      if (collection?.draftsOn) {
        patch.status = st === "ALL" ? undefined : st;
      } else {
        patch.status = undefined;
      }
      const merged = mergeSearchParamsLive(searchParams, patch);
      replaceUrlIfChanged(pathname, router, merged, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mergeSearchParamsLive reads window.location on the client
    [collection?.draftsOn, pathname, router],
  );

  const skipInitialFilterWrite = useRef(true);
  useEffect(() => {
    if (skipInitialFilterWrite.current) {
      skipInitialFilterWrite.current = false;
      return;
    }
    const id = window.setTimeout(() => writeListFiltersToUrl(), 280);
    return () => window.clearTimeout(id);
  }, [search, writeListFiltersToUrl]);

  const skipInitialStatusWrite = useRef(true);
  useEffect(() => {
    if (skipInitialStatusWrite.current) {
      skipInitialStatusWrite.current = false;
      return;
    }
    writeListFiltersToUrl();
  }, [status, writeListFiltersToUrl]);

  const offline = useOfflineRecords(key);

  const trashedQuery = useTrashedCmsRecords(key);
  const restoreMut = useRestoreCmsRecord(key);
  const forceMut = useForceDeleteCmsRecord(key);
  const trashedItems = useMemo(() => trashedQuery.data ?? [], [trashedQuery.data]);
  const [trashOpen, setTrashOpen] = useState(false);

  const trashButton = (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5"
      onClick={() => {
        setTrashOpen(true);
        void trashedQuery.refetch();
      }}
    >
      <Trash2 className="size-4" />
      Trash{trashedItems.length ? ` (${trashedItems.length})` : ""}
    </Button>
  );

  const trashColumns = useMemo<ColumnDef<CmsRecordDto, unknown>[]>(() => {
    const cols: ColumnDef<CmsRecordDto, unknown>[] = [
      {
        id: "label",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Record" />,
        cell: ({ row }) => (
          <span className="font-medium">
            {collection ? cmsRecordLabel(row.original, collection) : row.original.id}
          </span>
        ),
      },
    ];
    if (collection?.draftsOn) {
      cols.push({
        id: "status",
        accessorFn: (r) => r.status,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "PUBLISHED" ? "default" : "secondary"}>
            {row.original.status === "PUBLISHED" ? "Published" : "Draft"}
          </Badge>
        ),
      });
    }
    cols.push({
      id: "updated",
      accessorFn: (r) => r.updatedAt,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatAdminTableDateTime(row.original.updatedAt)}
        </span>
      ),
    });
    return cols;
  }, [collection]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return offline.rows.filter((r) => {
      if (status !== "ALL" && r.data.status !== status) return false;
      if (!q) return true;
      try {
        return JSON.stringify(r.data.data).toLowerCase().includes(q);
      } catch {
        return false;
      }
    });
  }, [offline.rows, search, status]);

  const items: CmsRecordDto[] = useMemo(
    () => filtered.map((r) => r.data),
    [filtered],
  );
  const total = items.length;

  const syncMap = useMemo(
    () => new Map(filtered.map((r) => [r.data.id, r.sync])),
    [filtered],
  );

  const getSyncStatus = (row: CmsRecordDto): SyncStatus => {
    const meta = syncMap.get(row.id);
    if (meta) return toSyncStatus(meta);
    return { synced: true, syncedAt: row.updatedAt };
  };

  const columns = useMemo<ColumnDef<CmsRecordDto>[]>(() => {
    if (!collection) return [];
    return buildColumns(collection, {
      onDelete: (row) => {
        void confirmDelete({
          description: `Delete "${cmsRecordLabel(row, collection)}"? This cannot be undone.`,
        }).then((confirmed) => {
          if (confirmed) void offline.remove(row.id);
        });
      },
      onRevisions: (row) => setRevisionsFor(row.id),
    });
  }, [collection, confirmDelete, offline]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {collection?.label ?? key}
          </h1>
          <p className="text-sm text-muted-foreground">
            {collection ? (
              <>
                <code className="font-mono">{collection.key}</code> records
                {offline.isFetching ? " · refreshing…" : ""}
              </>
            ) : collectionQuery.isLoading ? (
              "Loading…"
            ) : collectionQuery.error ? (
              (collectionQuery.error as Error).message
            ) : (
              "Not found"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            render={
              <Link
                href={`/admin/cms/collections/${encodeURIComponent(key)}`}
              />
            }
          >
            <Settings className="size-4" />
            Schema
          </Button>
          <Button
            className="gap-2"
            disabled={!collection || !canCreate}
            title={
              !canCreate ? "You do not have permission to create records" : undefined
            }
            render={
              <Link href={`/admin/cms/${encodeURIComponent(key)}/new`} />
            }
          >
            <Plus className="size-4" />
            New
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All records</CardTitle>
          <CardDescription>
            {offline.isLoading
              ? "Loading…"
              : `${total} record${total === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <DataTable
            columns={columns}
            data={items}
            getRowId={(r) => r.id}
            getSyncStatus={getSyncStatus}
            lastSyncedAt={offline.lastSyncedAt}
            toolbarActions={trashButton}
            searchPlaceholder="Search…"
            searchValue={search}
            onSearchChange={setSearch}
            filters={
              collection?.draftsOn ? (
                <AppSelect
                  value={status}
                  onChange={(v) => setStatus(v as ContentStatus | "ALL")}
                  options={[
                    { value: "ALL", label: "All" },
                    { value: "DRAFT", label: "Draft" },
                    { value: "PUBLISHED", label: "Published" },
                  ]}
                  isSearchable={false}
                  className="w-full sm:w-44"
                />
              ) : undefined
            }
            urlSync={{ paramPrefix: "rec" }}
            emptyMessage={
              offline.isLoading ? "Loading records…" : "No records yet."
            }
          />
        </CardContent>
      </Card>

      {collection && revisionsFor ? (
        <RevisionsPanel
          open={!!revisionsFor}
          onOpenChange={(open) => {
            if (!open) setRevisionsFor(null);
          }}
          collectionKey={collection.key}
          recordId={revisionsFor}
        />
      ) : null}

      <TrashModal
        open={trashOpen}
        onOpenChange={setTrashOpen}
        title="Trash — Records"
        itemNoun="record"
        rows={trashedItems}
        columns={trashColumns}
        isLoading={trashedQuery.isLoading}
        getRowId={(r) => r.id}
        onRestore={async (id) => {
          await restoreMut.mutateAsync(id);
          await offline.refresh();
        }}
        onForceDelete={(id) => forceMut.mutateAsync(id)}
        emptyMessage="No deleted records."
      />
    </div>
  );
}

export default function CmsRecordsPage({ collectionKey }: { collectionKey: string }) {
  return <CmsRecordsPageInner collectionKey={collectionKey} />
}

function buildColumns(
  collection: CmsCollectionDto,
  callbacks: {
    onDelete: (row: CmsRecordDto) => void;
    onRevisions: (row: CmsRecordDto) => void;
  },
): ColumnDef<CmsRecordDto>[] {
  const listConfigColumns = collection.listConfig?.columns
  const rawListCols = Array.isArray(listConfigColumns)
    ? listConfigColumns.slice(0, 4)
    : (collection.fields ?? []).slice(0, 3).map((f) => f.key);

  // `status` and `updatedAt` are rendered by dedicated columns below — exclude
  // them here so we don't register two TanStack columns with the same id.
  const reservedIds = new Set(["status", "updatedAt", "actions"]);
  const listCols = rawListCols.filter((k) => !reservedIds.has(k));

  const linkableKeys = new Set(["title", "slug", "email", "filename", "username"]);
  const primaryLinkKey =
    listCols.find((k) => linkableKeys.has(k)) ?? listCols[0] ?? null;

  const cols: ColumnDef<CmsRecordDto>[] = listCols.map((fieldKey) => {
    const field = collection.fields.find((f) => f.key === fieldKey);
    const isPrimary = fieldKey === primaryLinkKey;
    return {
      id: fieldKey,
      accessorFn: (r) => renderValue(r.data[fieldKey]),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={field?.label ?? fieldKey}
        />
      ),
      cell: ({ row }) => {
        const text = renderValue(row.original.data[fieldKey]) || "—";
        if (!isPrimary) {
          return <span className="truncate">{text}</span>;
        }
        const rowHref =
          collection.source === "PRISMA" && collection.key === "user"
            ? "/admin/users"
            : cmsRecordEditPath(collection.key, row.original.id);
        return (
          <Link
            href={rowHref}
            className="truncate font-medium hover:underline"
          >
            {text}
          </Link>
        );
      },
    };
  });

  if (collection.draftsOn) {
    cols.push({
      id: "status",
      accessorFn: (r) => r.status,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === "PUBLISHED" ? "default" : "outline"}
        >
          {row.original.status}
        </Badge>
      ),
    });
  }

  cols.push({
    id: "updatedAt",
    accessorFn: (r) => r.updatedAt,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Updated"
        className="ml-auto w-full justify-end"
      />
    ),
    cell: ({ row }) => (
      <div className="text-right text-sm text-muted-foreground tabular-nums">
        {formatAdminTableDateTime(row.original.updatedAt)}
      </div>
    ),
  });

  cols.push({
    id: "actions",
    enableSorting: false,
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <CmsRecordActions
        collection={collection}
        record={row.original}
        onDelete={() => callbacks.onDelete(row.original)}
        onRevisions={
          collection.revisionsOn
            ? () => callbacks.onRevisions(row.original)
            : undefined
        }
      />
    ),
  });
  return cols;
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

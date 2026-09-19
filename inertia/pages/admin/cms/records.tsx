import { Link } from '@inertiajs/react'
import { usePathname, useRouter, useSearchParams } from '~/hooks/use-inertia-url'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { Plus, Settings, Trash2 } from 'lucide-react'
import type { CmsCollectionDto, CmsRecordDto, ContentStatus } from '~/types/api'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { BulkActionBar, BulkDeleteButton } from '~/components/admin/bulk-action-bar'
import {
  CmsRecordActions,
  cmsRecordEditPath,
  cmsRecordLabel,
} from '~/components/cms/cms-record-actions'
import { useAbility } from '~/components/providers/ability-provider'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader, type SyncStatus } from '~/components/data-table'
import { RevisionsPanel } from '~/components/cms/revisions-panel'
import { TrashModal } from '~/components/trash-modal'
import { useCmsCollection } from '~/hooks/api/use-cms-collections'
import {
  useForceDeleteCmsRecord,
  useRestoreCmsRecord,
  useTrashedCmsRecords,
} from '~/hooks/api/use-cms-records'
import { useOfflineRecords } from '~/hooks/offline/use-offline-records'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { toSyncStatus } from '~/lib/offline/sync-status'
import { mergeSearchParamsLive, replaceUrlIfChanged } from '~/lib/table-url-params'
import { formatAdminTableDateTime } from '~/lib/utils'
import { reportError, reportSuccess } from '~/lib/notify'
import { TableFilterTabs } from '~/components/admin/table-filter-tabs'

function parseStatusParam(raw: string | null, draftsOn: boolean): ContentStatus | 'ALL' {
  if (!draftsOn) return 'ALL'
  if (raw === 'DRAFT' || raw === 'PUBLISHED') return raw
  return 'ALL'
}

function CmsRecordsPageInner({ collectionKey: key }: { collectionKey: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const confirmDelete = useConfirmDelete()
  const { permissions } = useAbility()

  const collectionQuery = useCmsCollection(key)
  const collection = collectionQuery.data
  const isUserCollection = collection?.source === 'PRISMA' && key === 'user'
  const canCreate = permissions.canCms('create', key) && !isUserCollection
  // Same rule as the row's own Delete action (see CmsRecordActions).
  const canDelete = permissions.canCms('delete', key) && !isUserCollection
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ContentStatus | 'ALL'>('ALL')
  const [revisionsFor, setRevisionsFor] = useState<string | null>(null)

  const parsedFilters = useMemo(
    () => ({
      q: searchParams.get('q') ?? '',
      status: parseStatusParam(searchParams.get('status'), collection?.draftsOn ?? false),
    }),
    [searchParams, collection?.draftsOn]
  )

  useLayoutEffect(() => {
    setSearch(parsedFilters.q)
    setStatus(parsedFilters.status)
  }, [parsedFilters.q, parsedFilters.status])

  const filtersRef = useRef({ search, status })
  useLayoutEffect(() => {
    filtersRef.current = { search, status }
  })

  const writeListFiltersToUrl = useCallback(
    () => {
      const { search: sq, status: st } = filtersRef.current
      const patch: Record<string, string | undefined> = {}
      patch.q = sq.trim() ? sq : undefined
      if (collection?.draftsOn) {
        patch.status = st === 'ALL' ? undefined : st
      } else {
        patch.status = undefined
      }
      const merged = mergeSearchParamsLive(searchParams, patch)
      replaceUrlIfChanged(pathname, router, merged, { scroll: false })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mergeSearchParamsLive reads window.location on the client
    [collection?.draftsOn, pathname, router]
  )

  const skipInitialFilterWrite = useRef(true)
  useEffect(() => {
    if (skipInitialFilterWrite.current) {
      skipInitialFilterWrite.current = false
      return
    }
    const id = window.setTimeout(() => writeListFiltersToUrl(), 280)
    return () => window.clearTimeout(id)
  }, [search, writeListFiltersToUrl])

  const skipInitialStatusWrite = useRef(true)
  useEffect(() => {
    if (skipInitialStatusWrite.current) {
      skipInitialStatusWrite.current = false
      return
    }
    writeListFiltersToUrl()
  }, [status, writeListFiltersToUrl])

  const offline = useOfflineRecords(key)

  // Bulk selection: delete every checked record (a soft delete — Trash can restore them).
  const [selection, setSelection] = useState<RowSelectionState>({})
  const selectedIds = useMemo(() => Object.keys(selection).filter((k) => selection[k]), [selection])
  const [bulkBusy, setBulkBusy] = useState(false)

  const onBulkTrash = async () => {
    const count = selectedIds.length
    const noun = `record${count === 1 ? '' : 's'}`
    const confirmed = await confirmDelete({
      title: `Delete ${count} ${noun}?`,
      description: `You can restore ${count === 1 ? 'it' : 'them'} from the trash later.`,
      confirmLabel: 'Delete',
    })
    if (!confirmed) return
    setBulkBusy(true)
    let moved = 0
    try {
      for (const id of selectedIds) {
        await offline.remove(id)
        moved += 1
      }
    } catch (err) {
      reportError(err, `Failed to delete ${noun}`)
    } finally {
      setBulkBusy(false)
      // A partial run still moved some: say so and keep only the ones left.
      if (moved > 0) {
        reportSuccess(`${moved} ${moved === 1 ? 'record' : 'records'} deleted`)
        setSelection((prev) => {
          const next = { ...prev }
          for (const id of selectedIds.slice(0, moved)) delete next[id]
          return next
        })
      }
    }
  }

  const trashedQuery = useTrashedCmsRecords(key)
  const restoreMut = useRestoreCmsRecord(key)
  const forceMut = useForceDeleteCmsRecord(key)
  const trashedItems = useMemo(() => trashedQuery.data ?? [], [trashedQuery.data])
  const [trashOpen, setTrashOpen] = useState(false)

  const trashButton = (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5"
      onClick={() => {
        setTrashOpen(true)
        void trashedQuery.refetch()
      }}
    >
      <Trash2 className="size-4" />
      Trash{trashedItems.length ? ` (${trashedItems.length})` : ''}
    </Button>
  )

  const trashColumns = useMemo<ColumnDef<CmsRecordDto, unknown>[]>(() => {
    const cols: ColumnDef<CmsRecordDto, unknown>[] = [
      {
        id: 'label',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Record" />,
        cell: ({ row }) => (
          <span className="font-medium">
            {collection ? cmsRecordLabel(row.original, collection) : row.original.id}
          </span>
        ),
      },
    ]
    if (collection?.draftsOn) {
      cols.push({
        id: 'status',
        accessorFn: (r) => r.status,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'PUBLISHED' ? 'success' : 'secondary'}>
            {row.original.status === 'PUBLISHED' ? 'Published' : 'Draft'}
          </Badge>
        ),
      })
    }
    cols.push({
      id: 'updated',
      accessorFn: (r) => r.updatedAt,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatAdminTableDateTime(row.original.updatedAt)}
        </span>
      ),
    })
    return cols
  }, [collection])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return offline.rows.filter((r) => {
      if (status !== 'ALL' && r.data.status !== status) return false
      if (!q) return true
      try {
        return JSON.stringify(r.data.data).toLowerCase().includes(q)
      } catch {
        return false
      }
    })
  }, [offline.rows, search, status])

  const items: CmsRecordDto[] = useMemo(() => filtered.map((r) => r.data), [filtered])
  const total = items.length

  // Status counts across all loaded rows (independent of the active filter), so
  // the segmented control labels stay stable while filtering.
  const statusCounts = useMemo(() => {
    let published = 0
    let draft = 0
    for (const r of offline.rows) {
      if (r.data.status === 'PUBLISHED') published += 1
      else if (r.data.status === 'DRAFT') draft += 1
    }
    return { all: offline.rows.length, published, draft }
  }, [offline.rows])

  const statusFilter = collection?.draftsOn ? (
    <TableFilterTabs
      value={status}
      options={[
        { value: 'ALL' as const, label: 'All', count: statusCounts.all },
        { value: 'PUBLISHED' as const, label: 'Published', count: statusCounts.published },
        { value: 'DRAFT' as const, label: 'Draft', count: statusCounts.draft },
      ]}
      onChange={setStatus}
    />
  ) : undefined

  const syncMap = useMemo(() => new Map(filtered.map((r) => [r.data.id, r.sync])), [filtered])

  const getSyncStatus = (row: CmsRecordDto): SyncStatus => {
    const meta = syncMap.get(row.id)
    if (meta) return toSyncStatus(meta)
    return { synced: true, syncedAt: row.updatedAt }
  }

  const columns = useMemo<ColumnDef<CmsRecordDto>[]>(() => {
    if (!collection) return []
    return buildColumns(collection, {
      onDelete: (row) => {
        void confirmDelete({
          description: `Delete "${cmsRecordLabel(row, collection)}"? This cannot be undone.`,
        }).then((confirmed) => {
          if (!confirmed) return
          offline.remove(row.id).then(
            () => reportSuccess('Record deleted'),
            (err) => reportError(err, 'Failed to delete')
          )
        })
      },
      onRevisions: (row) => setRevisionsFor(row.id),
    })
  }, [collection, confirmDelete, offline])

  return (
    <div className="space-y-6">
      <PageHeader
        title={collection?.label ?? key}
        subtitle={
          collection ? (
            <>
              <code className="font-mono">{collection.key}</code> records
              {offline.isFetching ? ' · refreshing…' : ''}
            </>
          ) : collectionQuery.isLoading ? (
            'Loading…'
          ) : collectionQuery.error ? (
            (collectionQuery.error as Error).message
          ) : (
            'Not found'
          )
        }
        count={offline.isLoading ? undefined : total}
        actions={
          <>
            <Button
              variant="outline"
              className="gap-2"
              render={<Link href={`/admin/cms/collections/${encodeURIComponent(key)}`} />}
            >
              <Settings className="size-4" />
              Schema
            </Button>
            <Button
              className="gap-2"
              disabled={!collection || !canCreate}
              title={!canCreate ? 'You do not have permission to create records' : undefined}
              render={<Link href={`/admin/cms/${encodeURIComponent(key)}/new`} />}
            >
              <Plus className="size-4" />
              New
            </Button>
          </>
        }
      />

      {canDelete && selectedIds.length > 0 ? (
        <BulkActionBar count={selectedIds.length} noun="record" onClear={() => setSelection({})}>
          <BulkDeleteButton busy={bulkBusy} onClick={() => void onBulkTrash()} />
        </BulkActionBar>
      ) : null}

      <DataTable
        columns={columns}
        data={items}
        getRowId={(r) => r.id}
        enableBulkSelect={canDelete}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        getSyncStatus={getSyncStatus}
        lastSyncedAt={offline.lastSyncedAt}
        toolbarActions={trashButton}
        searchPlaceholder="Search…"
        searchValue={search}
        onSearchChange={setSearch}
        filters={statusFilter}
        urlSync={{}}
        emptyMessage={offline.isLoading ? 'Loading records…' : 'No records yet.'}
      />

      {collection && revisionsFor ? (
        <RevisionsPanel
          open={!!revisionsFor}
          onOpenChange={(open) => {
            if (!open) setRevisionsFor(null)
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
          await restoreMut.mutateAsync(id)
          await offline.refresh()
        }}
        onForceDelete={(id) => forceMut.mutateAsync(id)}
        emptyMessage="No deleted records."
      />
    </div>
  )
}

export default function CmsRecordsPage({ collectionKey }: { collectionKey: string }) {
  return <CmsRecordsPageInner collectionKey={collectionKey} />
}

/** Caps a text cell's width so one long value cannot blow its column out; the rest becomes "…". */
const CELL_TEXT_CLASS = 'inline-block max-w-[24rem] truncate align-bottom'

function buildColumns(
  collection: CmsCollectionDto,
  callbacks: {
    onDelete: (row: CmsRecordDto) => void
    onRevisions: (row: CmsRecordDto) => void
  }
): ColumnDef<CmsRecordDto>[] {
  const listConfigColumns = collection.listConfig?.columns
  const rawListCols = Array.isArray(listConfigColumns)
    ? listConfigColumns.slice(0, 4)
    : (collection.fields ?? []).slice(0, 3).map((f) => f.key)

  // `status` and `updatedAt` are rendered by dedicated columns below — exclude
  // them here so we don't register two TanStack columns with the same id.
  const reservedIds = new Set(['status', 'updatedAt', 'actions'])
  const listCols = rawListCols.filter((k) => !reservedIds.has(k))

  const linkableKeys = new Set(['title', 'slug', 'email', 'filename', 'username'])
  const primaryLinkKey = listCols.find((k) => linkableKeys.has(k)) ?? listCols[0] ?? null

  const cols: ColumnDef<CmsRecordDto>[] = listCols.map((fieldKey) => {
    const field = collection.fields.find((f) => f.key === fieldKey)
    const isPrimary = fieldKey === primaryLinkKey
    return {
      id: fieldKey,
      accessorFn: (r) => renderValue(r.data[fieldKey]),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={field?.label ?? fieldKey} />
      ),
      cell: ({ row }) => {
        const text = renderValue(row.original.data[fieldKey]) || '—'
        // Long content (a review, a body) is clipped with an ellipsis instead of
        // stretching its column across the page; the full text is on hover.
        if (!isPrimary) {
          return (
            <span className={CELL_TEXT_CLASS} title={text}>
              {text}
            </span>
          )
        }
        const rowHref =
          collection.source === 'PRISMA' && collection.key === 'user'
            ? '/admin/users'
            : cmsRecordEditPath(collection.key, row.original.id)
        return (
          <Link
            href={rowHref}
            className={`${CELL_TEXT_CLASS} font-medium hover:underline`}
            title={text}
          >
            {text}
          </Link>
        )
      },
    }
  })

  if (collection.draftsOn) {
    cols.push({
      id: 'status',
      accessorFn: (r) => r.status,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'PUBLISHED' ? 'success' : 'secondary'}>
          {row.original.status === 'PUBLISHED' ? 'Published' : 'Draft'}
        </Badge>
      ),
    })
  }

  cols.push({
    id: 'updatedAt',
    accessorFn: (r) => r.updatedAt,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Updated"
        className="ml-auto w-full justify-end"
      />
    ),
    cell: ({ row }) => (
      <div className="text-right text-xs text-muted-foreground tabular-nums">
        {formatAdminTableDateTime(row.original.updatedAt)}
      </div>
    ),
  })

  cols.push({
    id: 'actions',
    enableSorting: false,
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <CmsRecordActions
        collection={collection}
        record={row.original}
        onDelete={() => callbacks.onDelete(row.original)}
        onRevisions={collection.revisionsOn ? () => callbacks.onRevisions(row.original) : undefined}
      />
    ),
  })
  return cols
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

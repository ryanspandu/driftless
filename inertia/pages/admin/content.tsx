import { useMemo, useState } from 'react'
import { router as inertiaRouter } from '@inertiajs/react'
import { usePathname, useRouter, useSearchParams } from '~/hooks/use-inertia-url'
import type { ColumnDef } from '@tanstack/react-table'
import {
  CloudUpload,
  FileText,
  FolderTree,
  Globe,
  ImageOff,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Tags,
  Trash2,
  Users,
} from 'lucide-react'
import type { RowSelectionState } from '@tanstack/react-table'
import type { ContentDto } from '~/types/api'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { TrashModal } from '~/components/trash-modal'
import { useOfflineContent, type OfflineContentRow } from '~/hooks/offline/use-offline-content'
import {
  useTrashedContent,
  useRestoreContent,
  useForceDeleteContent,
} from '~/hooks/api/use-content'
import { syncStatusOf } from '~/lib/offline/sync-status'
import { mergeSearchParamsLive, replaceUrlIfChanged } from '~/lib/table-url-params'
import { formatAdminTableDateTime } from '~/lib/utils'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { TableFilterTabs } from '~/components/admin/table-filter-tabs'

function parseContentTab(sp: ReturnType<typeof useSearchParams>): string {
  const t = sp.get('tab')
  if (t === 'published' || t === 'draft' || t === 'all') return t
  return 'all'
}

function ContentPageInner() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const confirmDelete = useConfirmDelete()
  const tab = useMemo(() => parseContentTab(searchParams), [searchParams])

  const onTabChange = (value: string) => {
    const merged = mergeSearchParamsLive(searchParams, {
      tab: value === 'all' ? undefined : value,
    })
    replaceUrlIfChanged(pathname, router, merged, { scroll: false })
  }
  const {
    rows,
    isLoading,
    lastSyncedAt,
    refresh,
    update,
    remove,
    discardConflict,
    recreateFromConflict,
  } = useOfflineContent()

  // Bulk selection: change status or move rows to trash for every checked row.
  const [selection, setSelection] = useState<RowSelectionState>({})
  const selectedIds = useMemo(
    () => Object.keys(selection).filter((k) => selection[k]),
    [selection]
  )
  const [bulkBusy, setBulkBusy] = useState(false)

  const onBulkStatus = async (status: 'PUBLISHED' | 'DRAFT') => {
    setBulkBusy(true)
    try {
      for (const id of selectedIds) await update(id, { status })
      setSelection({})
    } finally {
      setBulkBusy(false)
    }
  }

  const onBulkTrash = async () => {
    const confirmed = await confirmDelete({
      title: `Move ${selectedIds.length} post${selectedIds.length === 1 ? '' : 's'} to trash?`,
      description: 'You can restore them from the trash later.',
      confirmLabel: 'Move to trash',
    })
    if (!confirmed) return
    setBulkBusy(true)
    try {
      for (const id of selectedIds) await remove(id)
      setSelection({})
    } finally {
      setBulkBusy(false)
    }
  }

  const trashedQuery = useTrashedContent()
  const restoreMut = useRestoreContent()
  const forceDeleteMut = useForceDeleteContent()
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

  const trashColumns = useMemo<ColumnDef<ContentDto, unknown>[]>(
    () => [
      {
        id: 'title',
        accessorFn: (r) => r.title,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        id: 'slug',
        accessorFn: (r) => r.slug,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Slug" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.slug}</span>
        ),
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'PUBLISHED' ? 'default' : 'secondary'}>
            {row.original.status === 'PUBLISHED' ? 'Published' : 'Draft'}
          </Badge>
        ),
      },
      {
        id: 'updated',
        accessorFn: (r) => r.updatedAt,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatAdminTableDateTime(row.original.updatedAt)}
          </span>
        ),
      },
    ],
    []
  )

  const published = rows.filter((r) => r.data.status === 'PUBLISHED')
  const drafts = rows.filter((r) => r.data.status === 'DRAFT')

  const columns = useMemo<ColumnDef<OfflineContentRow>[]>(
    () => [
      {
        accessorFn: (r) => r.data.title,
        id: 'title',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        // Primary cell: a featured-image thumbnail (or a placeholder) beside the
        // title, with the slug as muted secondary text beneath it.
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            {row.original.data.featuredImage ? (
              <img
                src={row.original.data.featuredImage}
                alt=""
                className="size-10 shrink-0 rounded-md border border-border object-cover"
              />
            ) : (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted text-muted-foreground">
                <ImageOff className="size-4" aria-label="No image" />
              </div>
            )}
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">{row.original.data.title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {row.original.data.slug}
              </span>
            </div>
          </div>
        ),
      },
      {
        accessorFn: (r) => r.data.status,
        id: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <Badge variant={row.original.data.status === 'PUBLISHED' ? 'success' : 'secondary'}>
            {row.original.data.status === 'PUBLISHED' ? 'Published' : 'Draft'}
          </Badge>
        ),
      },
      {
        accessorFn: (r) => r.data.visibility,
        id: 'visibility',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Visibility" />,
        cell: ({ row }) => {
          const v = row.original.data.visibility
          const meta =
            v === 'PROTECTED'
              ? { icon: Lock, label: 'Protected' }
              : v === 'MEMBER'
                ? { icon: Users, label: 'Members' }
                : { icon: Globe, label: 'Public' }
          const Icon = meta.icon
          return (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="size-3.5" aria-hidden />
              {meta.label}
            </span>
          )
        },
      },
      {
        id: 'categories',
        enableSorting: false,
        accessorFn: (r) => (r.data.categories ?? []).map((c) => c.name).join(', '),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Categories" />,
        cell: ({ row }) => {
          const cats = row.original.data.categories ?? []
          if (cats.length === 0) {
            return <span className="text-xs text-muted-foreground">—</span>
          }
          return (
            <div className="flex flex-wrap gap-1">
              {cats.map((c) => (
                <Badge key={c.id} variant="secondary" className="font-normal">
                  {c.name}
                </Badge>
              ))}
            </div>
          )
        },
      },
      {
        accessorFn: (r) => r.data.updatedAt,
        id: 'updatedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Updated"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right text-xs text-muted-foreground tabular-nums">
            {formatAdminTableDateTime(row.original.data.updatedAt)}
          </div>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="size-8" />}
              aria-label="Row actions"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="gap-2"
                onClick={() => inertiaRouter.visit(`/admin/content/${row.original.data.id}/edit`)}
              >
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                className="gap-2"
                onClick={() => {
                  void confirmDelete({
                    description: 'Delete this content?',
                  }).then((confirmed) => {
                    if (confirmed) void remove(row.original.id)
                  })
                }}
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
              {row.original.sync.conflict && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={() => void recreateFromConflict(row.original.id)}
                  >
                    <CloudUpload className="size-4" />
                    Recreate on server
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    className="gap-2"
                    onClick={() => {
                      void confirmDelete({
                        title: 'Discard local change?',
                        description:
                          'This record no longer exists on the server. Discarding permanently drops your offline copy of this post.',
                        confirmLabel: 'Discard',
                      }).then((confirmed) => {
                        if (confirmed) void discardConflict(row.original.id)
                      })
                    }}
                  >
                    <Trash2 className="size-4" />
                    Discard local change
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [confirmDelete, remove, discardConflict, recreateFromConflict]
  )

  const getRowId = (r: OfflineContentRow) => r.id
  const getSync = (r: OfflineContentRow) => syncStatusOf({ id: r.id, data: r.data, _sync: r.sync })

  // Status filter (All / Published / Drafts) lives in the table toolbar.
  const activeData = tab === 'published' ? published : tab === 'draft' ? drafts : rows
  const statusFilters = [
    { value: 'all', label: 'All', count: rows.length },
    { value: 'published', label: 'Published', count: published.length },
    { value: 'draft', label: 'Drafts', count: drafts.length },
  ]
  const statusFilter = (
    <TableFilterTabs value={tab} options={statusFilters} onChange={onTabChange} />
  )

  const emptyState = isLoading ? (
    'Loading…'
  ) : rows.length === 0 ? (
    <div className="flex flex-col items-center gap-1.5 py-6 text-center">
      <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileText className="size-5" />
      </div>
      <p className="text-sm font-medium text-foreground">No content yet</p>
      <p className="text-xs text-muted-foreground">Create your first post to get started.</p>
    </div>
  ) : (
    'No posts match your filter.'
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content"
        subtitle="Manage posts, pages, and media entries"
        count={isLoading ? undefined : rows.length}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => inertiaRouter.visit('/admin/content/categories')}
            >
              <FolderTree className="size-4" />
              Categories
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => inertiaRouter.visit('/admin/content/tags')}
            >
              <Tags className="size-4" />
              Tags
            </Button>
            <Button className="gap-2" onClick={() => inertiaRouter.visit('/admin/content/new')}>
              <Plus className="size-4" />
              New post
            </Button>
          </div>
        }
      />

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2 text-sm">
          <span className="font-medium">{selectedIds.length} selected</span>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              onClick={() => void onBulkStatus('PUBLISHED')}
            >
              Publish
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              onClick={() => void onBulkStatus('DRAFT')}
            >
              Unpublish
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              disabled={bulkBusy}
              onClick={() => void onBulkTrash()}
            >
              Move to trash
            </Button>
          </div>
        </div>
      ) : null}

      <DataTable
        key={tab}
        columns={columns}
        data={activeData}
        getRowId={getRowId}
        getSyncStatus={getSync}
        lastSyncedAt={lastSyncedAt}
        searchPlaceholder="Search by title or slug…"
        filters={statusFilter}
        toolbarActions={trashButton}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        urlSync={{}}
        emptyMessage={emptyState}
      />

      <TrashModal
        open={trashOpen}
        onOpenChange={setTrashOpen}
        title="Trash — Content"
        itemNoun="post"
        rows={trashedItems}
        columns={trashColumns}
        isLoading={trashedQuery.isLoading}
        getRowId={(r) => r.id}
        onRestore={async (id) => {
          await restoreMut.mutateAsync(id)
          await refresh()
        }}
        onForceDelete={(id) => forceDeleteMut.mutateAsync(id)}
        emptyMessage="No deleted content."
      />
    </div>
  )
}

export default function ContentPage() {
  return <ContentPageInner />
}

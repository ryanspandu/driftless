import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from '~/hooks/use-inertia-url'
import type { ColumnDef } from '@tanstack/react-table'
import { FileText, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ContentDto } from '~/types/api'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { TrashModal } from '~/components/trash-modal'
import { ContentFormDialog } from '~/components/admin/content-form-dialog'
import { useOfflineContent, type OfflineContentRow } from '~/hooks/offline/use-offline-content'
import {
  useTrashedContent,
  useRestoreContent,
  useForceDeleteContent,
} from '~/hooks/api/use-content'
import { syncStatusOf } from '~/lib/offline/sync-status'
import { mergeSearchParamsLive, replaceUrlIfChanged } from '~/lib/table-url-params'
import { cn, formatAdminTableDateTime } from '~/lib/utils'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'

type DialogMode = { kind: 'create' } | { kind: 'edit'; row: ContentDto }

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
  const { rows, isLoading, lastSyncedAt, refresh, create, update, remove } = useOfflineContent()

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

  const [dialog, setDialog] = useState<{ open: boolean; mode: DialogMode }>({
    open: false,
    mode: { kind: 'create' },
  })

  const published = rows.filter((r) => r.data.status === 'PUBLISHED')
  const drafts = rows.filter((r) => r.data.status === 'DRAFT')

  const columns = useMemo<ColumnDef<OfflineContentRow>[]>(
    () => [
      {
        accessorFn: (r) => r.data.title,
        id: 'title',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        // Primary cell: title with the slug as muted secondary text beneath it.
        cell: ({ row }) => (
          <div className="flex flex-col leading-tight">
            <span className="font-medium">{row.original.data.title}</span>
            <span className="text-xs text-muted-foreground">{row.original.data.slug}</span>
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
                onClick={() =>
                  setDialog({
                    open: true,
                    mode: { kind: 'edit', row: row.original.data },
                  })
                }
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
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [confirmDelete, remove]
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
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      {statusFilters.map((f) => {
        const active = tab === f.value
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onTabChange(f.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
              active
                ? 'bg-background font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
            <span className="text-xs tabular-nums text-muted-foreground">{f.count}</span>
          </button>
        )
      })}
    </div>
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
          <Button
            className="gap-2"
            onClick={() => setDialog({ open: true, mode: { kind: 'create' } })}
          >
            <Plus className="size-4" />
            New post
          </Button>
        }
      />

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
        urlSync={{ paramPrefix: tab }}
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

      <ContentFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
        mode={dialog.mode}
        onSubmit={async (values) => {
          if (dialog.mode.kind === 'edit') {
            await update(dialog.mode.row.id, values)
          } else {
            await create(values)
          }
        }}
      />
    </div>
  )
}

export default function ContentPage() {
  return <ContentPageInner />
}

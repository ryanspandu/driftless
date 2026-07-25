import { useMemo, useState } from 'react'
import { router } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import { ExternalLink, MoreHorizontal, Pencil, Plus, SquarePen, Trash2 } from 'lucide-react'
import type { PageSummaryDto } from '~/types/api'
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
import { PageFormDialog } from '~/components/admin/page-form-dialog'
import {
  usePagesList,
  useCreatePage,
  useUpdatePage,
  useDeletePage,
  useTrashedPages,
  useRestorePage,
  useForceDeletePage,
} from '~/hooks/api/use-pages'
import { formatAdminTableDateTime } from '~/lib/utils'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'

const RENDER_MODE_LABEL: Record<string, string> = {
  SSR: 'SSR',
  SSG: 'Static',
  CSR: 'PWA',
}

type DialogMode = { kind: 'create' } | { kind: 'edit'; row: PageSummaryDto }

export default function PagesPage() {
  const confirmDelete = useConfirmDelete()
  const listQuery = usePagesList()
  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const createMut = useCreatePage()
  const updateMut = useUpdatePage()
  const deleteMut = useDeletePage()

  const trashedQuery = useTrashedPages()
  const restoreMut = useRestorePage()
  const forceDeleteMut = useForceDeletePage()
  const trashedItems = useMemo(() => trashedQuery.data ?? [], [trashedQuery.data])
  const [trashOpen, setTrashOpen] = useState(false)
  const [dialog, setDialog] = useState<{ open: boolean; mode: DialogMode }>({
    open: false,
    mode: { kind: 'create' },
  })

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

  const columns = useMemo<ColumnDef<PageSummaryDto, unknown>[]>(
    () => [
      {
        id: 'title',
        accessorFn: (r) => r.title,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        // Primary cell: title with the page path as muted secondary text beneath it.
        cell: ({ row }) => (
          <div className="flex flex-col leading-tight">
            <span className="font-medium">{row.original.title}</span>
            <span className="text-xs text-muted-foreground">/{row.original.path}</span>
          </div>
        ),
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'PUBLISHED' ? 'success' : 'secondary'}>
            {row.original.status === 'PUBLISHED' ? 'Published' : 'Draft'}
          </Badge>
        ),
      },
      {
        id: 'renderMode',
        accessorFn: (r) => r.renderMode,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Render" />,
        cell: ({ row }) => (
          <Badge variant="outline">
            {RENDER_MODE_LABEL[row.original.renderMode] ?? row.original.renderMode}
          </Badge>
        ),
      },
      {
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
      },
      {
        id: 'view',
        enableSorting: false,
        header: () => <span className="sr-only">View</span>,
        // Open the page on the frontend: live URL when published, else the
        // admin-only preview (drafts aren't reachable on the public route).
        cell: ({ row }) => {
          const r = row.original
          const published = r.status === 'PUBLISHED'
          const href = published ? `/${r.path}` : `/admin/pages/${r.id}/preview`
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              title={published ? 'Open the live page' : 'Preview this draft'}
            >
              <ExternalLink className="size-3.5" />
              {published ? 'View' : 'Preview'}
            </a>
          )
        },
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
                onClick={() => router.visit(`/admin/pages/${row.original.id}/edit`)}
              >
                <SquarePen className="size-4" />
                Open builder
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onClick={() => setDialog({ open: true, mode: { kind: 'edit', row: row.original } })}
              >
                <Pencil className="size-4" />
                Edit settings
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                className="gap-2"
                onClick={() => {
                  void confirmDelete({ description: 'Delete this page?' }).then((confirmed) => {
                    if (confirmed) void deleteMut.mutateAsync(row.original.id)
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
    [confirmDelete, deleteMut]
  )

  const trashColumns = useMemo<ColumnDef<PageSummaryDto, unknown>[]>(
    () => [
      {
        id: 'title',
        accessorFn: (r) => r.title,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        id: 'path',
        accessorFn: (r) => r.path,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Path" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">/{row.original.path}</span>
        ),
      },
    ],
    []
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pages"
        subtitle="Build landing & marketing pages with the visual builder"
        count={listQuery.isLoading ? undefined : rows.length}
        actions={
          <Button
            className="gap-2"
            onClick={() => setDialog({ open: true, mode: { kind: 'create' } })}
          >
            <Plus className="size-4" />
            New page
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        hideSyncColumn
        searchPlaceholder="Search by title or path…"
        toolbarActions={trashButton}
        emptyMessage={listQuery.isLoading ? 'Loading…' : 'No pages yet — create your first page.'}
      />

      <TrashModal
        open={trashOpen}
        onOpenChange={setTrashOpen}
        title="Trash — Pages"
        itemNoun="page"
        rows={trashedItems}
        columns={trashColumns}
        isLoading={trashedQuery.isLoading}
        getRowId={(r) => r.id}
        onRestore={async (id) => {
          await restoreMut.mutateAsync(id)
          await listQuery.refetch()
        }}
        onForceDelete={(id) => forceDeleteMut.mutateAsync(id)}
        emptyMessage="No deleted pages."
      />

      <PageFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
        mode={dialog.mode}
        onSubmit={async (values) => {
          if (dialog.mode.kind === 'edit') {
            await updateMut.mutateAsync({ id: dialog.mode.row.id, ...values })
          } else {
            const created = await createMut.mutateAsync(values)
            router.visit(`/admin/pages/${created.id}/edit`)
          }
        }}
      />
    </div>
  )
}

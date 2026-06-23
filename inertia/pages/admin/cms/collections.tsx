import { Link } from '@inertiajs/react'
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { List, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { CmsCollectionDto } from '~/types/api'
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
import {
  useCmsCollectionsList,
  useDeleteCmsCollection,
  useForceDeleteCmsCollection,
  useRestoreCmsCollection,
  useTrashedCmsCollections,
} from '~/hooks/api/use-cms-collections'
import { formatAdminTableDateTime } from '~/lib/utils'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { cmsRecordListPath } from '~/components/cms/cms-record-actions'
import { useAbility } from '~/components/providers/ability-provider'

export default function CmsCollectionsPage() {
  const confirmDelete = useConfirmDelete()
  const { permissions } = useAbility()
  const query = useCmsCollectionsList()
  const deleteMut = useDeleteCmsCollection()

  const trashedQuery = useTrashedCmsCollections()
  const restoreMut = useRestoreCmsCollection()
  const forceMut = useForceDeleteCmsCollection()
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

  const trashColumns = useMemo<ColumnDef<CmsCollectionDto, unknown>[]>(
    () => [
      {
        id: 'label',
        accessorFn: (c) => c.label,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Collection" />,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.label}</div>
            <div className="text-xs text-muted-foreground">{row.original.key}</div>
          </div>
        ),
      },
      {
        id: 'group',
        accessorFn: (c) => c.group ?? '',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Group" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.group ?? '—'}</span>
        ),
      },
      {
        id: 'fields',
        accessorFn: (c) => c.fields.length,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Fields" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.fields.length}</span>
        ),
      },
    ],
    []
  )

  const items: CmsCollectionDto[] = useMemo(() => query.data ?? [], [query.data])

  const columns = useMemo<ColumnDef<CmsCollectionDto>[]>(
    () => [
      {
        id: 'label',
        accessorFn: (r) => r.label,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Collection" />,
        cell: ({ row }) => (
          <div className="flex flex-col leading-tight">
            <span className="font-medium">{row.original.label}</span>
            <span className="text-xs text-muted-foreground">{row.original.key}</span>
          </div>
        ),
      },
      {
        id: 'source',
        accessorFn: (r) => r.source,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
        cell: ({ row }) => (
          <Badge variant={row.original.source === 'PRISMA' ? 'secondary' : 'default'}>
            {row.original.source === 'PRISMA' ? 'Native' : 'Dynamic'}
          </Badge>
        ),
      },
      {
        id: 'fields',
        accessorFn: (r) => r.fields.length,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Fields" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.fields.length}</span>
        ),
      },
      {
        id: 'group',
        accessorFn: (r) => r.group ?? '',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Group" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.group ?? '—'}</span>
        ),
      },
      {
        id: 'updated',
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
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const key = row.original.key
          const canReadRecords = permissions.canCms('read', key)
          const canManageSchema = permissions.canManageCms()
          const canDeleteCollection = permissions.canManageCms()

          return (
            <div className="flex items-center justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon" className="size-8" />}
                  aria-label="Row actions"
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canReadRecords ? (
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      render={<Link href={cmsRecordListPath(key)} />}
                    >
                      <List className="size-4" />
                      Records
                    </DropdownMenuItem>
                  ) : null}
                  {canManageSchema ? (
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      render={<Link href={`/admin/cms/collections/${encodeURIComponent(key)}`} />}
                    >
                      <Pencil className="size-4" />
                      Edit schema
                    </DropdownMenuItem>
                  ) : null}
                  {canDeleteCollection ? (
                    <DropdownMenuItem
                      variant="destructive"
                      className="gap-2 cursor-pointer"
                      onClick={() => {
                        void confirmDelete({
                          title: 'Delete collection',
                          description: `Drop collection "${key}" and its data? This cannot be undone.`,
                        }).then((confirmed) => {
                          if (confirmed) deleteMut.mutate(key)
                        })
                      }}
                    >
                      <Trash2 className="size-4" />
                      Delete collection
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ],
    [confirmDelete, deleteMut, permissions]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collections"
        subtitle={
          <>
            Define and manage CMS content types
            {query.isFetching ? ' · refreshing…' : ''}
            {query.error ? (
              <span className="ml-2 text-destructive">· {(query.error as Error).message}</span>
            ) : null}
          </>
        }
        count={query.isLoading ? undefined : items.length}
        actions={
          <Button className="gap-2" render={<Link href="/admin/cms/collections/new" />}>
            <Plus className="size-4" />
            New collection
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={items}
        getRowId={(c) => c.id}
        hideSyncColumn
        toolbarActions={trashButton}
        urlSync={{}}
        emptyMessage={
          query.isLoading ? 'Loading collections…' : 'No collections yet. Create your first one.'
        }
      />

      <TrashModal
        open={trashOpen}
        onOpenChange={setTrashOpen}
        title="Trash — Collections"
        itemNoun="collection"
        rows={trashedItems}
        columns={trashColumns}
        isLoading={trashedQuery.isLoading}
        getRowId={(r) => r.id}
        onRestore={async (id) => {
          await restoreMut.mutateAsync(id)
        }}
        onForceDelete={(id) => forceMut.mutateAsync(id)}
        emptyMessage="No deleted collections."
      />
    </div>
  )
}

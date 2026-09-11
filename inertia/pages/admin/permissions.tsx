import { Link } from '@inertiajs/react'
import { useRouter } from '~/hooks/use-inertia-url'
import { useMemo, useState } from 'react'
import { Key, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { PermissionDto } from '~/types/api'
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
  useDeletePermission,
  useForceDeletePermission,
  usePermissionsList,
  useRestorePermission,
  useTrashedPermissions,
} from '~/hooks/api/use-permissions'
import { useAbility } from '~/components/providers/ability-provider'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { formatAdminTableDateTime } from '~/lib/utils'

export default function PermissionsPage() {
  const router = useRouter()
  const confirmDelete = useConfirmDelete()
  const { permissions } = useAbility()
  const canManage = permissions.has('permission:manage')
  const query = usePermissionsList()
  const deleteMut = useDeletePermission()

  const trashedQuery = useTrashedPermissions()
  const restoreMut = useRestorePermission()
  const forceMut = useForceDeletePermission()
  const trashedItems = useMemo(() => trashedQuery.data ?? [], [trashedQuery.data])
  const [trashOpen, setTrashOpen] = useState(false)

  const items = useMemo(() => query.data ?? [], [query.data])

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

  const trashColumns = useMemo<ColumnDef<PermissionDto, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (p) => p.name,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium">{row.original.name}</span>
        ),
      },
      {
        id: 'description',
        accessorFn: (p) => p.description ?? '',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.description ?? '—'}</span>
        ),
      },
    ],
    []
  )

  const columns = useMemo<ColumnDef<PermissionDto>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
        cell: ({ row }) => {
          const p = row.original
          return (
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg border bg-primary/5 text-muted-foreground">
                {p.isSystem ? <Lock className="size-4" /> : <Key className="size-4" />}
              </div>
              <div className="flex flex-col leading-tight">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/permissions/${p.id}`}
                    className="font-mono text-sm font-medium text-ring hover:underline"
                  >
                    {p.name}
                  </Link>
                  {p.isSystem ? (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                      system
                    </Badge>
                  ) : null}
                </div>
                {p.description ? (
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {p.description}
                  </span>
                ) : null}
              </div>
            </div>
          )
        },
      },
      {
        id: 'roles',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Roles" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.roleCount ?? 0}</span>
        ),
      },
      {
        accessorKey: 'updatedAt',
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
          const p = row.original
          return (
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
                  onClick={() => router.push(`/admin/permissions/${p.id}`)}
                >
                  <Pencil className="size-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  className="gap-2"
                  disabled={p.isSystem}
                  onClick={() => {
                    if (!canManage || p.isSystem) return
                    void confirmDelete({
                      title: 'Delete permission',
                      description: `Delete permission "${p.name}"? Any roles using it will lose it.`,
                    }).then((confirmed) => {
                      if (confirmed) deleteMut.mutate(p.id)
                    })
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [canManage, confirmDelete, deleteMut, router]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Permissions"
        subtitle="All permission codes. System codes are seeded or generated and cannot be deleted."
        count={query.isLoading ? undefined : items.length}
        actions={
          canManage ? (
            <Button className="gap-2" render={<Link href="/admin/permissions/new" />}>
              <Plus className="size-4" />
              New permission
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        data={items}
        getRowId={(p) => p.id}
        searchPlaceholder="Search permissions…"
        toolbarActions={trashButton}
        urlSync={{}}
        emptyMessage={query.isLoading ? 'Loading permissions…' : 'No permissions found.'}
      />

      <TrashModal
        open={trashOpen}
        onOpenChange={setTrashOpen}
        title="Trash — Permissions"
        itemNoun="permission"
        rows={trashedItems}
        columns={trashColumns}
        isLoading={trashedQuery.isLoading}
        getRowId={(r) => r.id}
        onRestore={async (id) => {
          await restoreMut.mutateAsync(id)
        }}
        onForceDelete={(id) => forceMut.mutateAsync(id)}
        emptyMessage="No deleted permissions."
      />
    </div>
  )
}

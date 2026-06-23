import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from '~/hooks/use-inertia-url'
import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Trash2, UserPlus } from 'lucide-react'
import type { UserPublic } from '~/types/api'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { AppSelect } from '~/components/ui/app-select'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader, type SyncStatus } from '~/components/data-table'
import { TrashModal } from '~/components/trash-modal'
import { UserFormDialog } from '~/components/admin/user-form-dialog'
import {
  useCreateUser,
  useDeleteUser,
  useForceDeleteUser,
  useGeneratePassword,
  useRestoreUser,
  useTrashedUsers,
  useUpdateUser,
  useUsersList,
} from '~/hooks/api/use-users'
import { useRolesList } from '~/hooks/api/use-roles'
import { useSyncMetaMap } from '~/hooks/offline/use-offline-overlay'
import { toSyncStatus } from '~/lib/offline/sync-status'
import { mergeSearchParamsLive, replaceUrlIfChanged } from '~/lib/table-url-params'
import { formatAdminTableDateTime } from '~/lib/utils'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'

type DialogState =
  | { open: false }
  | { open: true; mode: 'create' }
  | { open: true; mode: 'edit'; row: UserPublic }

function parseUsersUrl(sp: ReturnType<typeof useSearchParams>) {
  const q = sp.get('q') ?? ''
  const roleRaw = sp.get('role')
  const role = roleRaw && roleRaw.length > 0 && roleRaw !== 'ALL' ? roleRaw : 'ALL'
  const pageRaw = Number.parseInt(sp.get('page') ?? '1', 10)
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1
  const rawSize = Number.parseInt(sp.get('size') ?? '20', 10)
  const pageSize = [10, 20, 50, 100].includes(rawSize) ? rawSize : 20
  return { q, role, page, pageSize }
}

function UsersPageInner() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const confirmDelete = useConfirmDelete()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')
  const [dialog, setDialog] = useState<DialogState>({ open: false })

  const parsed = useMemo(() => parseUsersUrl(searchParams), [searchParams])
  const snapKey = `${parsed.q}|${parsed.role}|${parsed.page}|${parsed.pageSize}`
  const prevSnapKey = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (prevSnapKey.current === snapKey) return
    prevSnapKey.current = snapKey
    setSearch(parsed.q)
    setRoleFilter(parsed.role)
    setPage(parsed.page)
    setPageSize(parsed.pageSize)
  }, [parsed, snapKey])

  const listRef = useRef({
    search,
    roleFilter,
    page,
    pageSize,
  })
  useLayoutEffect(() => {
    listRef.current = { search, roleFilter, page, pageSize }
  })

  const writeListToUrl = useCallback(
    () => {
      const r = listRef.current
      const patch: Record<string, string | undefined> = {}
      patch.q = r.search.trim() ? r.search.trim() : undefined
      patch.role = r.roleFilter === 'ALL' ? undefined : r.roleFilter
      patch.page = r.page > 1 ? String(r.page) : undefined
      patch.size = r.pageSize !== 20 ? String(r.pageSize) : undefined
      const merged = mergeSearchParamsLive(searchParams, patch)
      replaceUrlIfChanged(pathname, router, merged, { scroll: false })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mergeSearchParamsLive reads window.location on the client
    [pathname, router]
  )

  const skipInitialSearchUrl = useRef(true)
  useEffect(() => {
    if (skipInitialSearchUrl.current) {
      skipInitialSearchUrl.current = false
      return
    }
    const id = window.setTimeout(() => writeListToUrl(), 300)
    return () => window.clearTimeout(id)
  }, [search, writeListToUrl])

  const skipInitialRestUrl = useRef(true)
  useEffect(() => {
    if (skipInitialRestUrl.current) {
      skipInitialRestUrl.current = false
      return
    }
    writeListToUrl()
  }, [roleFilter, page, pageSize, writeListToUrl])

  const listQuery = useMemo(
    () => ({
      page,
      pageSize,
      search: search.trim() || undefined,
      role: roleFilter === 'ALL' ? undefined : [roleFilter],
    }),
    [page, pageSize, search, roleFilter]
  )

  const query = useUsersList(listQuery)

  const createMut = useCreateUser()
  const updateMut = useUpdateUser()
  const deleteMut = useDeleteUser()
  const genPwMut = useGeneratePassword()
  const rolesQuery = useRolesList()
  const syncMetaMap = useSyncMetaMap('users')

  const trashedQuery = useTrashedUsers()
  const restoreMut = useRestoreUser()
  const forceMut = useForceDeleteUser()
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

  const trashColumns = useMemo<ColumnDef<UserPublic, unknown>[]>(
    () => [
      {
        id: 'user',
        accessorFn: (r) => `${r.firstName ?? ''} ${r.lastName ?? ''} ${r.email}`,
        header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
        cell: ({ row }) => {
          const u = row.original
          return (
            <div>
              <div className="font-medium">
                {u.firstName} {u.lastName}
              </div>
              <div className="text-xs text-muted-foreground">{u.email}</div>
            </div>
          )
        },
      },
      {
        accessorKey: 'username',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Username" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">@{row.original.username}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'ACTIVE' ? 'success' : 'destructive'}>
            {row.original.status === 'ACTIVE' ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
    ],
    []
  )

  const items = useMemo(() => query.data?.items ?? [], [query.data])
  const total = query.data?.total ?? 0
  const totalPages = query.data?.totalPages ?? 1

  const columns = useMemo<ColumnDef<UserPublic>[]>(
    () => [
      {
        id: 'user',
        accessorFn: (r) => `${r.firstName} ${r.lastName ?? ''} ${r.email}`,
        header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
        cell: ({ row }) => {
          const u = row.original
          return (
            <div className="flex items-center gap-3">
              <Avatar size="sm">
                <AvatarFallback>
                  {u.firstName[0]}
                  {u.lastName?.[0] ?? ''}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col leading-tight">
                <span className="font-medium">
                  {u.firstName} {u.lastName}
                </span>
                <span className="text-xs text-muted-foreground">{u.email}</span>
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: 'username',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Username" />,
        cell: ({ row }) => <span className="text-muted-foreground">@{row.original.username}</span>,
      },
      {
        id: 'roles',
        accessorFn: (r) => r.roles.join(' '),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Roles" />,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((r) => (
              <Badge key={r} variant="outline" className="text-xs">
                {r}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'ACTIVE' ? 'success' : 'destructive'}>
            {row.original.status === 'ACTIVE' ? 'Active' : 'Inactive'}
          </Badge>
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
                onClick={() => setDialog({ open: true, mode: 'edit', row: row.original })}
              >
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                className="gap-2"
                onClick={() => {
                  void confirmDelete({
                    description: `Delete user "${row.original.email}"?`,
                  }).then((confirmed) => {
                    if (confirmed) deleteMut.mutate(row.original.id)
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

  const getSyncStatus = (u: UserPublic): SyncStatus => {
    const meta = syncMetaMap.get(u.id)
    if (meta) return toSyncStatus(meta)
    return { synced: true, syncedAt: u.updatedAt }
  }

  const lastSyncedAt = useMemo(() => {
    let latest: Date | null = null
    for (const u of items) {
      const d = new Date(u.updatedAt)
      if (!latest || d > latest) latest = d
    }
    return latest
  }, [items])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle={`Manage user accounts and permissions${query.isFetching ? ' · refreshing…' : ''}`}
        count={query.isLoading ? undefined : total}
        actions={
          <Button className="gap-2" onClick={() => setDialog({ open: true, mode: 'create' })}>
            <UserPlus className="size-4" />
            Add user
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={items}
        getRowId={(u) => u.id}
        getSyncStatus={getSyncStatus}
        lastSyncedAt={lastSyncedAt}
        searchPlaceholder="Name, email, username…"
        toolbarActions={trashButton}
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        filters={
          <AppSelect
            id="users-role"
            value={roleFilter}
            onChange={(v) => {
              setRoleFilter(v || 'ALL')
              setPage(1)
            }}
            options={[
              { value: 'ALL', label: 'All roles' },
              ...(rolesQuery.data ?? []).map((r) => ({
                value: r.name,
                label: r.name,
              })),
            ]}
            className="w-full sm:w-44"
            isSearchable
          />
        }
        emptyMessage={query.isLoading ? 'Loading users…' : 'No users match the current filter.'}
        serverPagination={{
          pageIndex: page - 1,
          pageSize,
          totalRows: total,
          pageCount: Math.max(totalPages, 1),
          pageSizeOptions: [10, 20, 50, 100],
          disabled: query.isFetching,
          onPageIndexChange: (idx) => setPage(idx + 1),
          onPageSizeChange: (size) => {
            setPageSize(size)
            setPage(1)
          },
        }}
      />

      <TrashModal
        open={trashOpen}
        onOpenChange={setTrashOpen}
        title="Trash — Users"
        itemNoun="user"
        rows={trashedItems}
        columns={trashColumns}
        isLoading={trashedQuery.isLoading}
        getRowId={(r) => String(r.id)}
        onRestore={async (id) => {
          await restoreMut.mutateAsync(Number(id))
        }}
        onForceDelete={(id) => forceMut.mutateAsync(Number(id))}
        emptyMessage="No deleted users."
      />

      <UserFormDialog
        open={dialog.open}
        onOpenChange={(open) => {
          if (!open) setDialog({ open: false })
        }}
        mode={
          dialog.open && dialog.mode === 'edit'
            ? { kind: 'edit', row: dialog.row }
            : { kind: 'create' }
        }
        roles={rolesQuery.data ?? []}
        rolesLoading={rolesQuery.isLoading}
        generatePassword={async () => {
          const res = await genPwMut.mutateAsync()
          return res.password
        }}
        onSubmit={async (input) => {
          if (input.mode === 'create') {
            await createMut.mutateAsync(input.body)
          } else {
            await updateMut.mutateAsync({ id: input.id, body: input.body })
          }
        }}
      />
    </div>
  )
}

export default function UsersPage() {
  return <UsersPageInner />
}

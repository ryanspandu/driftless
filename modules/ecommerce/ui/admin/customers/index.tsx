import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Download, MoreHorizontal, Plus, ShieldOff, ShieldCheck, Users } from 'lucide-react'
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
import { Can } from '~/components/providers/ability-provider'
import { useUrlState } from '~/hooks/use-url-state'
import { formatAdminTableDateTime } from '~/lib/utils'
import { useCustomers, useSetCustomerStatus, type AccountDto } from '../_api'
import { TableFilterTabs } from '~/components/admin/table-filter-tabs'
import { CreateCustomerDialog } from './create-dialog'

const STATUS_VALUES = ['all', 'active', 'blocked'] as const
type StatusFilter = (typeof STATUS_VALUES)[number]

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'blocked', label: 'Blocked' },
]

const DEFAULT_STATUS: StatusFilter = 'all'
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const DEFAULT_PAGE_SIZE = 20

export default function CustomersPage() {
  // The URL is the only source of truth for this view: tab, search and paging
  // are all derived from it, so the page is linkable and survives a reload.
  const url = useUrlState()
  const status = url.one('status', STATUS_VALUES, DEFAULT_STATUS)
  const search = url.get('q')
  const page = url.int('page', 1)
  const pageSizeParam = url.int('pageSize', DEFAULT_PAGE_SIZE)
  const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeParam) ? pageSizeParam : DEFAULT_PAGE_SIZE

  const query = useCustomers({ page, pageSize, search, status })
  const setStatusMutation = useSetCustomerStatus()
  const [createOpen, setCreateOpen] = useState(false)

  const customers = query.data?.items ?? []
  const total = query.data?.total ?? 0

  const columns = useMemo<ColumnDef<AccountDto>[]>(
    () => [
      {
        accessorKey: 'email',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
        cell: ({ row }) => {
          const name = [row.original.firstName, row.original.lastName].filter(Boolean).join(' ')
          return (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">{name || row.original.email}</span>
              {name ? (
                <span className="truncate text-xs text-muted-foreground">{row.original.email}</span>
              ) : null}
            </div>
          )
        },
      },
      {
        id: 'account',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            {row.original.isGuest ? (
              <Badge variant="outline">Guest</Badge>
            ) : (
              <Badge variant="secondary">Registered</Badge>
            )}
            {!row.original.isGuest && !row.original.emailVerified ? (
              <Badge variant="warning">Unverified</Badge>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'ordersCount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Orders"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right text-sm tabular-nums">{row.original.ordersCount}</div>
        ),
      },
      {
        id: 'spent',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Spent"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right text-sm tabular-nums">{row.original.totalSpent.formatted}</div>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title="First seen" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.createdAt ? formatAdminTableDateTime(row.original.createdAt) : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) =>
          row.original.status === 'active' ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="destructive">Blocked</Badge>
          ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const customer = row.original
          const blocking = customer.status === 'active'
          return (
            <Can permission="ecommerce:customers:manage">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon" className="size-8" />}
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                  <span className="sr-only">Actions for {customer.email}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    variant={blocking ? 'destructive' : undefined}
                    onClick={() =>
                      setStatusMutation.mutate({
                        id: customer.id,
                        status: blocking ? 'blocked' : 'active',
                      })
                    }
                  >
                    {blocking ? (
                      <>
                        <ShieldOff className="mr-2 size-4" aria-hidden />
                        Block
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 size-4" aria-hidden />
                        Unblock
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Can>
          )
        },
      },
    ],
    [setStatusMutation]
  )

  const statusFilter = (
    <TableFilterTabs
      value={status}
      options={STATUS_FILTERS}
      onChange={(value) =>
        // Back to page 1: page 5 of the old filter is usually past the end of
        // the new one, which reads as an empty table.
        url.set({ status: value === DEFAULT_STATUS ? undefined : value, page: undefined })
      }
    />
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        subtitle="Everyone who has bought from you, guests included."
        count={total}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              render={<a href="/api/admin/ecommerce/exports/customers" />}
            >
              <Download className="size-4" aria-hidden />
              Export CSV
            </Button>
            <Can permission="ecommerce:customers:manage">
              <Button className="gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" aria-hidden />
                New customer
              </Button>
            </Can>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={customers}
        getRowId={(row) => row.id}
        hideSyncColumn
        enableBulkSelect={false}
        searchPlaceholder="Search by name or email…"
        searchValue={search}
        onSearchChange={(value) => url.set({ q: value, page: undefined })}
        filters={statusFilter}
        serverPagination={{
          pageIndex: page - 1,
          pageSize,
          totalRows: total,
          pageCount: Math.max(Math.ceil(total / pageSize), 1),
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          disabled: query.isFetching,
          onPageIndexChange: (index) => url.set({ page: index + 1 === 1 ? undefined : index + 1 }),
          onPageSizeChange: (size) =>
            url.set({
              pageSize: size === DEFAULT_PAGE_SIZE ? undefined : size,
              page: undefined,
            }),
        }}
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-8">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Users className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-sm font-medium">No customers yet</p>
            <p className="text-xs text-muted-foreground">
              A record appears the first time someone checks out.
            </p>
          </div>
        }
      />

      <CreateCustomerDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

import { useMemo } from 'react'
import { Link } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import { Download, Plus, Receipt } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { PageHeader } from '~/components/admin/page-header'
import { Can } from '~/components/providers/ability-provider'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { useUrlState } from '~/hooks/use-url-state'
import { cn, formatAdminTableDateTime } from '~/lib/utils'
import { useOrders, type OrderListItemDto, type OrderStage, type PaymentStatus } from '../_api'

/**
 * Tabs are cut by **stage**, not by payment status.
 *
 * Payment is one of three axes an order moves along (payment, fulfilment,
 * status) and on its own it answers the wrong question. "Paid" mixes an order
 * that still has to be posted with one delivered a fortnight ago; the first is
 * work, the second is history. `stage` is derived server-side from all three —
 * see `stageOf` — so the tab and the row badges cannot disagree.
 */
const STAGE_FILTERS: { value: OrderStage | 'all'; label: string; hint: string }[] = [
  { value: 'all', label: 'All', hint: 'Every order' },
  { value: 'action', label: 'Needs action', hint: 'Paid, not yet sent' },
  { value: 'open', label: 'Open', hint: 'Awaiting payment, or on its way' },
  { value: 'closed', label: 'Closed', hint: 'Completed, cancelled or refunded' },
]

/**
 * The filter values the URL will honour — exactly what the segmented control can
 * produce. Anything else in `?stage=` falls back to `all`, so a stale link
 * cannot leave the control with no active tab.
 */
const STAGE_VALUES: readonly (OrderStage | 'all')[] = STAGE_FILTERS.map((f) => f.value)

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const DEFAULT_PAGE_SIZE = 20

/**
 * Payment state gets the prominent badge, not fulfilment state.
 *
 * The question someone scanning this list is answering is "has the money
 * arrived", and an order can be `confirmed` while its payment has been
 * refunded — the two axes move independently.
 */
export function PaymentBadge({ status }: { status: PaymentStatus }) {
  switch (status) {
    case 'paid':
      return <Badge variant="success">Paid</Badge>
    case 'unpaid':
      return <Badge variant="warning">Unpaid</Badge>
    case 'partially_refunded':
      return <Badge variant="warning">Part refunded</Badge>
    case 'refunded':
      return <Badge variant="outline">Refunded</Badge>
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

/**
 * What has happened to the goods, in the words someone reading this list uses.
 *
 * The raw `status` enum was showing through here before, which meant a digital
 * order that had already been delivered read as "confirmed" — accurate to the
 * schema and useless to a person. Cancelled and completed are terminal, so they
 * win over the fulfilment axis; otherwise this column answers one question: has
 * it gone out?
 */
function FulfilmentBadge({ order }: { order: OrderListItemDto }) {
  if (order.status === 'cancelled') return <Badge variant="outline">Cancelled</Badge>
  if (order.status === 'completed') return <Badge variant="secondary">Completed</Badge>
  if (order.fulfillmentStatus === 'fulfilled') return <Badge variant="success">Sent</Badge>
  if (order.fulfillmentStatus === 'partially_fulfilled') {
    return <Badge variant="warning">Part sent</Badge>
  }
  return <span className="text-sm text-muted-foreground">Not sent</span>
}

export default function OrdersPage() {
  // The URL is the only source of truth for this view: filter, search and paging
  // are read straight out of the query string, never mirrored into `useState`.
  const url = useUrlState()
  const stage = url.one('stage', STAGE_VALUES, 'all')
  const search = url.get('q')
  const page = url.int('page', 1)
  const requestedPageSize = url.int('pageSize', DEFAULT_PAGE_SIZE)
  const pageSize = PAGE_SIZE_OPTIONS.includes(requestedPageSize)
    ? requestedPageSize
    : DEFAULT_PAGE_SIZE

  const query = useOrders({ page, pageSize, search, stage })
  const orders = query.data?.items ?? []
  const total = query.data?.total ?? 0

  const columns = useMemo<ColumnDef<OrderListItemDto>[]>(
    () => [
      {
        accessorKey: 'number',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Order" />,
        cell: ({ row }) => (
          <div className="flex flex-col leading-tight">
            <Link
              href={`/admin/ecommerce/orders/${row.original.id}`}
              className="font-medium hover:underline"
            >
              {row.original.number}
            </Link>
            <span className="truncate text-xs text-muted-foreground">{row.original.email}</span>
          </div>
        ),
      },
      {
        accessorKey: 'paymentStatus',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Payment" />,
        cell: ({ row }) => <PaymentBadge status={row.original.paymentStatus} />,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Fulfilment" />,
        cell: ({ row }) => <FulfilmentBadge order={row.original} />,
      },
      {
        id: 'items',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Items"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right text-sm tabular-nums">{row.original.itemCount}</div>
        ),
      },
      {
        id: 'total',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Total"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => {
          const refunded = row.original.refunded.amount > 0
          return (
            <div className="text-right text-sm tabular-nums">
              <span className={cn(refunded && 'text-muted-foreground line-through')}>
                {row.original.total.formatted}
              </span>
              {refunded ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  −{row.original.refunded.formatted}
                </span>
              ) : null}
            </div>
          )
        },
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Placed"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right text-xs tabular-nums text-muted-foreground">
            {formatAdminTableDateTime(row.original.createdAt)}
          </div>
        ),
      },
    ],
    []
  )

  const stageFilter = (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      {STAGE_FILTERS.map((f) => {
        const active = stage === f.value
        return (
          <button
            key={f.value}
            type="button"
            aria-pressed={active}
            title={f.hint}
            onClick={() =>
              url.set({ stage: f.value === 'all' ? undefined : f.value, page: undefined })
            }
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
              active
                ? 'bg-background font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        subtitle="Every sale, paid or otherwise."
        count={total}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              // A plain link: this is a file download, and the browser handles
              // Content-Disposition better than we would.
              render={<a href="/api/admin/ecommerce/exports/orders" />}
            >
              <Download className="size-4" aria-hidden />
              Export CSV
            </Button>
            <Can permission="ecommerce:orders:manage">
              <Button className="gap-2" render={<Link href="/admin/ecommerce/orders/new" />}>
                <Plus className="size-4" aria-hidden />
                New order
              </Button>
            </Can>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={orders}
        getRowId={(row) => row.id}
        hideSyncColumn
        enableBulkSelect={false}
        searchPlaceholder="Search by order number or email…"
        searchValue={search}
        onSearchChange={(value) => url.set({ q: value, page: undefined })}
        filters={stageFilter}
        serverPagination={{
          pageIndex: page - 1,
          pageSize,
          totalRows: total,
          pageCount: Math.max(Math.ceil(total / pageSize), 1),
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          disabled: query.isFetching,
          onPageIndexChange: (index) => url.set({ page: index + 1 > 1 ? index + 1 : undefined }),
          onPageSizeChange: (size) =>
            url.set({ pageSize: size === DEFAULT_PAGE_SIZE ? undefined : size, page: undefined }),
        }}
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-8">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Receipt className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-sm font-medium">
              {stage === 'action' ? 'Nothing to do' : 'No orders yet'}
            </p>
            <p className="text-xs text-muted-foreground">
              {stage === 'action'
                ? 'Every paid order has been sent. Downloads send themselves.'
                : 'They will appear here as soon as someone buys something.'}
            </p>
          </div>
        }
      />
    </div>
  )
}

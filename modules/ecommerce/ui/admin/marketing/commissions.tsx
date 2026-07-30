import { useMemo, useState } from 'react'
import { Link } from '@inertiajs/react'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { Banknote, Download } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { Can } from '~/components/providers/ability-provider'
import { useUrlState } from '~/hooks/use-url-state'
import { apiErrorMessage } from '~/lib/api-client'
import { formatMoney } from '../../lib/money'
import { cn } from '~/lib/utils'
import { useCommissions, usePayCommissions, useStoreSettings, type CommissionDto } from '../_api'

type StatusFilter = 'all' | CommissionDto['status']

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'approved', label: 'Ready to pay' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
  { value: 'all', label: 'All' },
]

/** The values `?status=` accepts; anything else falls back to the default. */
const STATUS_VALUES = FILTERS.map((f) => f.value)

/**
 * Opens on **approved** rather than "all".
 *
 * This page exists to answer one question — who is owed money right now —
 * and approved is exactly that set: past the refund window, not yet paid.
 */
const DEFAULT_FILTER: StatusFilter = 'approved'

function StatusBadge({ commission }: { commission: CommissionDto }) {
  switch (commission.status) {
    case 'approved':
      return <Badge variant="success">Approved</Badge>
    case 'pending':
      return <Badge variant="warning">Pending</Badge>
    case 'paid':
      return <Badge variant="secondary">Paid</Badge>
    default:
      return <Badge variant="outline">Void</Badge>
  }
}

export default function CommissionsPage() {
  /**
   * The filter lives in the URL, not in React: this view should survive a
   * reload, be linkable, and come back with the browser's back button.
   */
  const url = useUrlState()
  const filter = url.one('status', STATUS_VALUES, DEFAULT_FILTER)

  const [selection, setSelection] = useState<RowSelectionState>({})
  const [error, setError] = useState<string | null>(null)
  /**
   * DataTable owns its selection internally, so the only way to clear it from
   * out here is to remount the table. Bumping this key does that.
   */
  const [tableKey, setTableKey] = useState(0)

  const query = useCommissions(filter === 'all' ? undefined : filter)
  const pay = usePayCommissions()
  const settings = useStoreSettings()

  const commissions = query.data ?? []

  /**
   * Only approved rows can be paid, so the bar counts those and nothing else —
   * a selection that included pending rows would promise a total the API would
   * then refuse to honour.
   */
  const payable = useMemo(
    () => commissions.filter((c) => selection[c.id] && c.status === 'approved'),
    [commissions, selection]
  )

  /**
   * The one place this admin adds money up itself.
   *
   * It is safe precisely because these are integer minor units in a single
   * currency: the addition is exact, so the preview cannot drift from what the
   * server records. Anything involving a rate or a share stays server-side.
   */
  const payableTotal = useMemo(
    () => payable.reduce((sum, c) => sum + c.amount.amount, 0),
    [payable]
  )

  function clearSelection() {
    setSelection({})
    setTableKey((key) => key + 1)
  }

  /**
   * The default is left out of the URL so a pristine page has a clean address,
   * and paging is dropped so narrowing the list cannot strand you past its last
   * page. Selection is cleared because it referred to the rows we just left.
   */
  function setFilter(value: StatusFilter) {
    url.set({ status: value === DEFAULT_FILTER ? undefined : value, page: undefined })
    clearSelection()
  }

  async function markPaid() {
    setError(null)
    try {
      await pay.mutateAsync(payable.map((c) => c.id))
      clearSelection()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const columns = useMemo<ColumnDef<CommissionDto>[]>(
    () => [
      {
        accessorKey: 'affiliateName',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Affiliate" />,
        cell: ({ row }) => <span className="font-medium">{row.original.affiliateName}</span>,
      },
      {
        accessorKey: 'orderNumber',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Order" />,
        cell: ({ row }) => (
          <Link
            href={`/admin/ecommerce/orders/${row.original.orderId}`}
            className="font-mono text-sm hover:underline"
          >
            {row.original.orderNumber}
          </Link>
        ),
      },
      {
        accessorKey: 'ratePercent',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Rate" />,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {row.original.ratePercent}%
          </span>
        ),
      },
      {
        id: 'amount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Commission"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right text-sm font-medium tabular-nums">
            {row.original.amount.formatted}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5 leading-tight">
            <StatusBadge commission={row.original} />
            {row.original.voidReason ? (
              <span className="text-xs text-muted-foreground">{row.original.voidReason}</span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Earned" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString(undefined, {
              dateStyle: 'medium',
            })}
          </span>
        ),
      },
    ],
    []
  )

  const statusFilter = (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      {FILTERS.map((f) => {
        const active = filter === f.value
        return (
          <button
            key={f.value}
            type="button"
            aria-pressed={active}
            onClick={() => setFilter(f.value)}
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
        title="Commissions"
        subtitle="What affiliates have earned, and what is still owed."
        count={commissions.length}
        actions={
          <Can permission="ecommerce:commissions:approve">
            <Button
              variant="outline"
              className="gap-2"
              // A plain link, not fetch: this is a file download, and the
              // browser handles Content-Disposition better than we would.
              render={<a href="/api/admin/ecommerce/commissions/export" />}
            >
              <Download className="size-4" aria-hidden />
              Export CSV
            </Button>
          </Can>
        }
      />

      {payable.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
          <p className="text-sm">
            <span className="font-medium">{payable.length}</span>{' '}
            {payable.length === 1 ? 'commission' : 'commissions'} selected ·{' '}
            <span className="font-medium tabular-nums">
              {formatMoney(
                payableTotal,
                settings.data?.currency ?? 'USD',
                settings.data?.locale ?? undefined
              )}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
            <Can permission="ecommerce:commissions:approve">
              <Button size="sm" className="gap-2" disabled={pay.isPending} onClick={markPaid}>
                <Banknote className="size-4" aria-hidden />
                {pay.isPending ? 'Recording…' : 'Mark as paid'}
              </Button>
            </Can>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <DataTable
        key={tableKey}
        columns={columns}
        data={commissions}
        getRowId={(row) => row.id}
        hideSyncColumn
        // Selection drives the payout action, so it is only useful on the rows
        // that can actually be paid.
        enableBulkSelect={filter === 'approved'}
        onRowSelectionChange={setSelection}
        filters={statusFilter}
        hideSearch
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-8">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Banknote className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-sm font-medium">Nothing here</p>
            <p className="text-xs text-muted-foreground">
              Commissions appear once a referred order is paid.
            </p>
          </div>
        }
      />
    </div>
  )
}

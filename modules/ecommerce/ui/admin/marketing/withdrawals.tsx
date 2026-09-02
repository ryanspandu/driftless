import { useMemo, useState } from 'react'
import { Link } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import { Banknote, Check, X } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { Can } from '~/components/providers/ability-provider'
import { useUrlState } from '~/hooks/use-url-state'
import { apiErrorMessage } from '~/lib/api-client'
import { useWithdrawals, useProcessWithdrawal, type WithdrawalDto } from '../_api'
import { TableFilterTabs } from '~/components/admin/table-filter-tabs'

type StatusFilter = 'all' | WithdrawalDto['status']

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'requested', label: 'To pay' },
  { value: 'paid', label: 'Paid' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]
const STATUS_VALUES = FILTERS.map((f) => f.value)
const DEFAULT_FILTER: StatusFilter = 'requested'

function StatusBadge({ status }: { status: WithdrawalDto['status'] }) {
  if (status === 'requested') return <Badge variant="warning">Requested</Badge>
  if (status === 'paid') return <Badge variant="success">Paid</Badge>
  return <Badge variant="destructive">Rejected</Badge>
}

export default function WithdrawalsPage() {
  const url = useUrlState()
  const filter = url.one('status', STATUS_VALUES, DEFAULT_FILTER)
  const query = useWithdrawals(filter === 'all' ? undefined : filter)
  const process = useProcessWithdrawal()
  const [error, setError] = useState<string | null>(null)

  function act(id: string, action: 'paid' | 'reject') {
    setError(null)
    process.mutate({ id, action }, { onError: (err) => setError(apiErrorMessage(err)) })
  }

  const columns = useMemo<ColumnDef<WithdrawalDto>[]>(
    () => [
      {
        accessorKey: 'affiliateName',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Affiliate" />,
        cell: ({ row }) => <span className="font-medium">{row.original.affiliateName}</span>,
      },
      {
        id: 'method',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Pay to" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.payoutMethodSummary ?? '—'}
          </span>
        ),
      },
      {
        id: 'requested',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Requested" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {new Date(row.original.requestedAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: 'amount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Amount"
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
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) =>
          row.original.status === 'requested' ? (
            <Can permission="ecommerce:commissions:approve">
              <div className="flex justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1"
                  disabled={process.isPending}
                  onClick={() => act(row.original.id, 'paid')}
                >
                  <Check className="size-3.5" aria-hidden />
                  Mark paid
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-muted-foreground"
                  disabled={process.isPending}
                  onClick={() => act(row.original.id, 'reject')}
                >
                  <X className="size-3.5" aria-hidden />
                  Reject
                </Button>
              </div>
            </Can>
          ) : null,
      },
    ],
    [process.isPending]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Withdrawals"
        subtitle="Payout requests from affiliates. Marking one paid settles its commissions."
        count={query.data?.length ?? 0}
        actions={
          <Button variant="outline" render={<Link href="/admin/marketing/affiliates" />}>
            Affiliates
          </Button>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <DataTable
        columns={columns}
        data={query.data ?? []}
        getRowId={(row) => row.id}
        hideSyncColumn
        enableBulkSelect={false}
        filters={
          <TableFilterTabs
            value={filter}
            options={FILTERS}
            onChange={(value) => url.set({ status: value === DEFAULT_FILTER ? undefined : value })}
          />
        }
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-8">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Banknote className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-sm font-medium">No withdrawals</p>
            <p className="text-xs text-muted-foreground">
              Requests from affiliates show up here for you to pay.
            </p>
          </div>
        }
      />
    </div>
  )
}

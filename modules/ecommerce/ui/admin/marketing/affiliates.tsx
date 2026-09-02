import { useMemo, useState, type FormEvent } from 'react'
import { Link } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import { Check, Copy, MessageSquare, MoreHorizontal, Pencil, Plus, Users, X } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { AppSelect, type AppSelectOption } from '~/components/ui/app-select'
import { AppAsyncSelect } from '~/components/ui/app-async-select'
import { Textarea } from '~/components/ui/textarea'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { Can } from '~/components/providers/ability-provider'
import { useUrlState } from '~/hooks/use-url-state'
import { apiErrorMessage } from '~/lib/api-client'
import {
  useAffiliates,
  useAddAffiliate,
  useApproveAffiliate,
  useRejectAffiliate,
  useUpdateAffiliate,
  searchAffiliateAccounts,
  type AffiliateDto,
} from '../_api'
import { TableFilterTabs } from '~/components/admin/table-filter-tabs'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'rejected', label: 'Rejected' },
]

const FILTERS: { value: 'all' | AffiliateDto['status']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Applications' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'rejected', label: 'Rejected' },
]

const FILTER_VALUES = FILTERS.map((f) => f.value)
type FilterValue = (typeof FILTER_VALUES)[number]

/** Date + time in the operator's locale, e.g. "2 Sep 2026, 15:45". */
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function StatusBadge({ status }: { status: AffiliateDto['status'] }) {
  if (status === 'pending') return <Badge variant="warning">Pending</Badge>
  if (status === 'active') return <Badge variant="success">Active</Badge>
  if (status === 'paused') return <Badge variant="warning">Paused</Badge>
  if (status === 'rejected') return <Badge variant="secondary">Rejected</Badge>
  return <Badge variant="destructive">Blocked</Badge>
}

interface EditForm {
  id: string
  commissionPercent: number
  status: AffiliateDto['status']
  notes: string
}

export default function AffiliatesPage() {
  const query = useAffiliates()
  const addAffiliate = useAddAffiliate()
  const approve = useApproveAffiliate()
  const reject = useRejectAffiliate()
  const update = useUpdateAffiliate()

  const url = useUrlState()
  const search = url.get('q')
  const filter = url.one('filter', FILTER_VALUES, 'all')

  function setSearch(value: string) {
    url.set({ q: value, aff_page: undefined })
  }
  function setFilter(value: FilterValue) {
    url.set({ filter: value === 'all' ? undefined : value, aff_page: undefined })
  }

  const [addOpen, setAddOpen] = useState(false)
  const [addAccount, setAddAccount] = useState<AppSelectOption | null>(null)
  const [addPercent, setAddPercent] = useState<number | ''>('')
  const [edit, setEdit] = useState<EditForm | null>(null)
  const [notesOf, setNotesOf] = useState<AffiliateDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const rows = useMemo(() => {
    const all = query.data ?? []
    const needle = search.trim().toLowerCase()
    return all.filter((row) => {
      if (filter !== 'all' && row.status !== filter) return false
      if (!needle) return true
      return (
        row.code.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle)
      )
    })
  }, [query.data, search, filter])

  const pendingCount = (query.data ?? []).filter((a) => a.status === 'pending').length

  async function copyLink(code: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/ref/${code}`)
      setCopied(code)
      window.setTimeout(() => setCopied(null), 2_000)
    } catch {
      // clipboard denied; the code is visible in the row.
    }
  }

  async function submitAdd(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!addAccount) {
      setError('Pick an account first.')
      return
    }
    try {
      await addAffiliate.mutateAsync({
        email: addAccount.value,
        commissionPercent: addPercent === '' ? undefined : Number(addPercent),
      })
      setAddOpen(false)
      setAddAccount(null)
      setAddPercent('')
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  async function loadAccounts(input: string): Promise<AppSelectOption[]> {
    const rows = await searchAffiliateAccounts(input)
    return rows.map((a) => ({ value: a.email, label: a.name ? `${a.name} · ${a.email}` : a.email }))
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault()
    if (!edit) return
    setError(null)
    try {
      await update.mutateAsync({
        id: edit.id,
        input: {
          commissionPercent: Number(edit.commissionPercent),
          status: edit.status,
          notes: edit.notes.trim() || null,
        },
      })
      setEdit(null)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const columns = useMemo<ColumnDef<AffiliateDto>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Affiliate" />,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-medium">{row.original.name}</span>
            <span className="truncate text-xs text-muted-foreground">{row.original.email}</span>
          </div>
        ),
      },
      {
        accessorKey: 'code',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Referral link" />,
        cell: ({ row }) =>
          row.original.status === 'pending' ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <button
              type="button"
              onClick={() => copyLink(row.original.code)}
              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              /ref/{row.original.code}
              <Copy className="size-3" aria-hidden />
              {copied === row.original.code ? (
                <span className="font-sans text-[11px] text-emerald-600">Copied</span>
              ) : null}
            </button>
          ),
      },
      {
        accessorKey: 'commissionPercent',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Rate" />,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">{row.original.commissionPercent}%</span>
        ),
      },
      {
        id: 'performance',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Clicks / orders" />,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {row.original.clicksCount} / {row.original.ordersCount}
          </span>
        ),
      },
      {
        id: 'available',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Available"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right text-sm tabular-nums">
            {row.original.availableCommission.formatted}
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
        cell: ({ row }) => {
          const noteCount = (row.original.applicantMessage ? 1 : 0) + (row.original.notes ? 1 : 0)
          const notesBtn =
            noteCount > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-muted-foreground"
                onClick={() => setNotesOf(row.original)}
              >
                <MessageSquare className="size-3.5" aria-hidden />
                {noteCount} {noteCount === 1 ? 'note' : 'notes'}
              </Button>
            ) : null
          return (
            <Can permission="ecommerce:affiliates:manage">
              {row.original.status === 'pending' ? (
                <div className="flex justify-end gap-1.5">
                  {notesBtn}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1"
                    disabled={approve.isPending}
                    onClick={() => approve.mutate({ id: row.original.id })}
                  >
                    <Check className="size-3.5" aria-hidden />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-muted-foreground"
                    disabled={reject.isPending}
                    onClick={() => reject.mutate({ id: row.original.id })}
                  >
                    <X className="size-3.5" aria-hidden />
                    Reject
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-1.5">
                  {notesBtn}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon" className="size-8" />}
                    >
                      <MoreHorizontal className="size-4" aria-hidden />
                      <span className="sr-only">Actions for {row.original.name}</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setError(null)
                          setEdit({
                            id: row.original.id,
                            commissionPercent: row.original.commissionPercent,
                            status: row.original.status,
                            notes: row.original.notes ?? '',
                          })
                        }}
                      >
                        <Pencil className="mr-2 size-4" aria-hidden />
                        Edit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </Can>
          )
        },
      },
    ],
    [copied, approve, reject]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Affiliates"
        subtitle="Account holders who earn a share of what they refer."
        count={query.data?.length ?? 0}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" render={<Link href="/admin/marketing/withdrawals" />}>
              Withdrawals
            </Button>
            <Button variant="outline" render={<Link href="/admin/marketing/commissions" />}>
              Commissions
            </Button>
            <Can permission="ecommerce:affiliates:manage">
              <Button
                className="gap-2"
                onClick={() => {
                  setError(null)
                  setAddOpen(true)
                }}
              >
                <Plus className="size-4" aria-hidden />
                Add affiliate
              </Button>
            </Can>
          </div>
        }
      />

      {pendingCount > 0 && filter !== 'pending' ? (
        <button
          onClick={() => setFilter('pending')}
          className="flex w-full items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-left text-sm text-amber-700 hover:bg-amber-500/10"
        >
          <span className="font-medium">{pendingCount}</span> affiliate application
          {pendingCount === 1 ? '' : 's'} awaiting review — click to review.
        </button>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        hideSyncColumn
        enableBulkSelect={false}
        searchPlaceholder="Search affiliates…"
        searchValue={search}
        onSearchChange={setSearch}
        filters={<TableFilterTabs value={filter} options={FILTERS} onChange={setFilter} />}
        urlSync={{ paramPrefix: 'aff' }}
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-8">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Users className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-sm font-medium">No affiliates here</p>
            <p className="text-xs text-muted-foreground">
              Customers apply from their account, or add one by email.
            </p>
          </div>
        }
      />

      {/* Add affiliate by account email */}
      <Dialog open={addOpen} onOpenChange={(open) => !open && setAddOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add affiliate</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitAdd} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Account</Label>
              <AppAsyncSelect
                value={addAccount}
                onChange={setAddAccount}
                loadOptions={loadAccounts}
                placeholder="Search by name or email…"
                noOptionsMessage="No accounts found"
              />
              <p className="text-xs text-muted-foreground">
                Search an existing storefront account. They become an active affiliate immediately.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-rate">Commission rate (%)</Label>
              <Input
                id="add-rate"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={addPercent}
                onChange={(e) => setAddPercent(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Store default"
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addAffiliate.isPending}>
                {addAffiliate.isPending ? 'Adding…' : 'Add affiliate'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit affiliate */}
      <Dialog open={edit !== null} onOpenChange={(open) => !open && setEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit affiliate</DialogTitle>
          </DialogHeader>
          {edit ? (
            <form onSubmit={submitEdit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-rate">Commission rate (%)</Label>
                  <Input
                    id="edit-rate"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={edit.commissionPercent}
                    onChange={(e) =>
                      setEdit({ ...edit, commissionPercent: Number(e.target.value) })
                    }
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-status">Status</Label>
                  <AppSelect
                    id="edit-status"
                    value={edit.status}
                    onChange={(value) =>
                      setEdit({ ...edit, status: value as AffiliateDto['status'] })
                    }
                    options={STATUS_OPTIONS}
                    isSearchable={false}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  rows={2}
                  value={edit.notes}
                  onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEdit(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending ? 'Saving…' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Notes / applicant message */}
      <Dialog open={notesOf !== null} onOpenChange={(open) => !open && setNotesOf(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Notes — {notesOf?.name}</DialogTitle>
          </DialogHeader>
          {notesOf ? (
            <div className="space-y-4">
              {notesOf.applicantMessage ? (
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Applicant’s message
                    </p>
                    {notesOf.appliedAt ? (
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(notesOf.appliedAt)}
                      </span>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    {notesOf.applicantMessage}
                  </p>
                </div>
              ) : null}
              {notesOf.notes ? (
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Admin note
                    </p>
                    <span className="text-xs text-muted-foreground">
                      Updated {formatDateTime(notesOf.updatedAt)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    {notesOf.notes}
                  </p>
                </div>
              ) : null}
              {!notesOf.applicantMessage && !notesOf.notes ? (
                <p className="text-sm text-muted-foreground">No notes.</p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

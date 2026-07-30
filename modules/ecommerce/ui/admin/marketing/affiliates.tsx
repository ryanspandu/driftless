import { useMemo, useState, type FormEvent } from 'react'
import { Link } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, MoreHorizontal, Pencil, Plus, Users } from 'lucide-react'
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
import { AppSelect } from '~/components/ui/app-select'
import { Textarea } from '~/components/ui/textarea'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { Can } from '~/components/providers/ability-provider'
import { useUrlState } from '~/hooks/use-url-state'
import { apiErrorMessage } from '~/lib/api-client'
import { cn } from '~/lib/utils'
import { useAffiliates, useSaveAffiliate, type AffiliateDto } from '../_api'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'blocked', label: 'Blocked' },
]

const FILTERS: { value: 'all' | AffiliateDto['status']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'blocked', label: 'Blocked' },
]

/** The values `?filter=` accepts; anything else falls back to `all`. */
const FILTER_VALUES = FILTERS.map((f) => f.value)

type FilterValue = (typeof FILTER_VALUES)[number]

function emptyForm() {
  return {
    id: null as string | null,
    code: '',
    name: '',
    email: '',
    commissionPercent: 10,
    status: 'active' as AffiliateDto['status'],
    /**
     * Empty means "leave whatever is stored alone" on edit — the plaintext is
     * never sent back to the browser, so an empty box cannot mean "clear it".
     * Clearing is a separate, explicit intent, tracked by `clearPayout`.
     */
    payoutDetails: '',
    clearPayout: false,
    notes: '',
    hasPayoutDetails: false,
  }
}

type FormState = ReturnType<typeof emptyForm>

function toForm(affiliate: AffiliateDto): FormState {
  return {
    id: affiliate.id,
    code: affiliate.code,
    name: affiliate.name,
    email: affiliate.email,
    commissionPercent: affiliate.commissionPercent,
    status: affiliate.status,
    payoutDetails: '',
    clearPayout: false,
    notes: affiliate.notes ?? '',
    hasPayoutDetails: affiliate.hasPayoutDetails,
  }
}

function StatusBadge({ status }: { status: AffiliateDto['status'] }) {
  if (status === 'active') return <Badge variant="success">Active</Badge>
  if (status === 'paused') return <Badge variant="warning">Paused</Badge>
  return <Badge variant="destructive">Blocked</Badge>
}

export default function AffiliatesPage() {
  const query = useAffiliates()
  const save = useSaveAffiliate()

  /**
   * The toolbar state lives in the URL, not in React: this view should survive a
   * reload, be linkable, and come back with the browser's back button.
   */
  const url = useUrlState()
  const search = url.get('q')
  const filter = url.one('filter', FILTER_VALUES, 'all')

  /**
   * Both writers clear `aff_page` — the paging key DataTable's `urlSync` writes
   * for this table (see the `paramPrefix` below). Narrowing the list has to send
   * you back to page 1: otherwise you keep whatever page number you were on and
   * land in the middle of the new results, having never seen the first ones.
   */
  function setSearch(value: string) {
    url.set({ q: value, aff_page: undefined })
  }

  function setFilter(value: FilterValue) {
    url.set({ filter: value === 'all' ? undefined : value, aff_page: undefined })
  }

  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const affiliates = useMemo(() => {
    const rows = query.data ?? []
    const needle = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (filter !== 'all' && row.status !== filter) return false
      if (!needle) return true
      return (
        row.code.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle)
      )
    })
  }, [query.data, search, filter])

  async function copyLink(code: string) {
    const url = `${window.location.origin}/ref/${code}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(code)
      window.setTimeout(() => setCopied(null), 2_000)
    } catch {
      // Clipboard access can be denied; the code is visible in the row anyway.
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setError(null)

    try {
      await save.mutateAsync({
        id: form.id,
        input: form.id
          ? {
              name: form.name.trim(),
              email: form.email.trim(),
              commissionPercent: Number(form.commissionPercent),
              status: form.status,
              notes: form.notes.trim() || null,
              /**
               * Three distinct intents, and the API distinguishes all three:
               * omitted keeps what is stored, an empty string clears it, and
               * text replaces it.
               */
              ...(form.clearPayout
                ? { payoutDetails: '' }
                : form.payoutDetails === ''
                  ? {}
                  : { payoutDetails: form.payoutDetails }),
            }
          : {
              code: form.code.trim(),
              name: form.name.trim(),
              email: form.email.trim(),
              commissionPercent: Number(form.commissionPercent),
              payoutDetails: form.payoutDetails.trim() || null,
              notes: form.notes.trim() || null,
            },
      })
      setForm(null)
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
        header: ({ column }) => <DataTableColumnHeader column={column} title="Referral link" />,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => copyLink(row.original.code)}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            /ref/{row.original.code}
            <Copy className="size-3" aria-hidden />
            <span className="sr-only">Copy referral link</span>
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
        id: 'earned',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Earned"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right text-sm tabular-nums">
            {row.original.totalCommission.formatted}
          </div>
        ),
      },
      {
        id: 'outstanding',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Owed"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => {
          const owed = row.original.outstanding
          return (
            <div
              className={cn(
                'text-right text-sm tabular-nums',
                owed.amount > 0 && 'font-medium text-amber-600'
              )}
            >
              {owed.formatted}
            </div>
          )
        },
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
        cell: ({ row }) => (
          <Can permission="ecommerce:affiliates:manage">
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
                    setForm(toForm(row.original))
                  }}
                >
                  <Pencil className="mr-2 size-4" aria-hidden />
                  Edit
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Can>
        ),
      },
    ],
    [copied]
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
        title="Affiliates"
        subtitle="Partners who earn a share of what they refer."
        count={query.data?.length ?? 0}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" render={<Link href="/admin/marketing/commissions" />}>
              Commissions
            </Button>
            <Can permission="ecommerce:affiliates:manage">
              <Button
                className="gap-2"
                onClick={() => {
                  setError(null)
                  setForm(emptyForm())
                }}
              >
                <Plus className="size-4" aria-hidden />
                New affiliate
              </Button>
            </Can>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={affiliates}
        getRowId={(row) => row.id}
        hideSyncColumn
        enableBulkSelect={false}
        searchPlaceholder="Search affiliates…"
        searchValue={search}
        onSearchChange={setSearch}
        filters={statusFilter}
        /**
         * Puts paging and sorting in the URL too, so the whole view is linkable
         * and survives a reload. The `aff` prefix keeps the table's own keys
         * (`aff_page`, `aff_size`, `aff_sort`) clear of the page-level `q` and
         * `filter` above — sharing the bare `q` key would make the table
         * re-filter rows this page has already filtered.
         */
        urlSync={{ paramPrefix: 'aff' }}
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-8">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Users className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-sm font-medium">No affiliates yet</p>
            <p className="text-xs text-muted-foreground">
              Add a partner to give them a referral link.
            </p>
          </div>
        }
      />

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Edit affiliate' : 'New affiliate'}</DialogTitle>
          </DialogHeader>

          {form ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {form.id ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="status">Status</Label>
                    <AppSelect
                      id="status"
                      value={form.status}
                      onChange={(value) => set('status', value as AffiliateDto['status'])}
                      options={STATUS_OPTIONS}
                      isSearchable={false}
                    />
                    <p className="text-xs text-muted-foreground">
                      Paused and blocked links still redirect, they just stop earning.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="code">Referral code</Label>
                    <Input
                      id="code"
                      value={form.code}
                      onChange={(e) => set('code', e.target.value)}
                      placeholder="jane"
                      className="font-mono"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Their link becomes /ref/{form.code || '…'}. It cannot be changed later.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="rate">Commission rate (%)</Label>
                  <Input
                    id="rate"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.commissionPercent}
                    onChange={(e) => set('commissionPercent', Number(e.target.value))}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Taken from the order subtotal, before tax and shipping.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payout">Payout details</Label>
                <Textarea
                  id="payout"
                  rows={2}
                  value={form.payoutDetails}
                  disabled={form.clearPayout}
                  onChange={(e) => set('payoutDetails', e.target.value)}
                  placeholder={
                    form.clearPayout
                      ? 'Will be removed on save'
                      : form.hasPayoutDetails
                        ? 'Stored — leave blank to keep it unchanged'
                        : 'Bank account, PayPal address, whatever you pay them with'
                  }
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Encrypted at rest and never sent back to the browser.
                  </p>
                  {form.hasPayoutDetails ? (
                    <button
                      type="button"
                      onClick={() => {
                        set('clearPayout', !form.clearPayout)
                        set('payoutDetails', '')
                      }}
                      className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      {form.clearPayout ? 'Keep stored details' : 'Remove stored details'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                />
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save affiliate'}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

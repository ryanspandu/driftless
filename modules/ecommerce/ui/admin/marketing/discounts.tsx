import { useMemo, useState, type FormEvent } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { MoneyInput } from '../../components/money-input'
import { AppSelect } from '~/components/ui/app-select'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { useUrlState } from '~/hooks/use-url-state'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { Can } from '~/components/providers/ability-provider'
import { apiErrorMessage } from '~/lib/api-client'
import { cn } from '~/lib/utils'
import {
  useDeleteDiscount,
  useDiscounts,
  useSaveDiscount,
  useStoreSettings,
  type DiscountDto,
  type DiscountType,
} from '../_api'
import { TableFilterTabs } from '~/components/admin/table-filter-tabs'

const TYPE_OPTIONS = [
  { value: 'percent', label: 'Percentage off' },
  { value: 'fixed', label: 'Fixed amount off' },
  { value: 'free_shipping', label: 'Free shipping' },
]

const FILTERS: { value: 'all' | 'live' | 'scheduled' | 'off'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'scheduled', label: 'Not live' },
  { value: 'off', label: 'Disabled' },
]

/** The values `?filter=` accepts; anything else falls back to `all`. */
const FILTER_VALUES = FILTERS.map((f) => f.value)

type FilterValue = (typeof FILTER_VALUES)[number]

/** Blank form state. Kept as a factory so each open starts clean. */
function emptyForm() {
  return {
    id: null as string | null,
    code: '',
    name: '',
    description: '',
    type: 'percent' as DiscountType,
    /** Percent as a whole number; fixed as minor units. Never both at once. */
    percentValue: 10,
    fixedValue: null as number | null,
    minSubtotalAmount: null as number | null,
    maxDiscountAmount: null as number | null,
    startsAt: '',
    endsAt: '',
    usageLimit: '',
    usageLimitPerCustomer: '',
    enabled: true,
  }
}

type FormState = ReturnType<typeof emptyForm>

function toForm(discount: DiscountDto): FormState {
  return {
    id: discount.id,
    code: discount.code,
    name: discount.name ?? '',
    description: discount.description ?? '',
    type: discount.type,
    percentValue: discount.type === 'percent' ? discount.value : 10,
    fixedValue: discount.type === 'fixed' ? discount.value : null,
    minSubtotalAmount: discount.minSubtotalAmount,
    maxDiscountAmount: discount.maxDiscountAmount,
    startsAt: discount.startsAt ? discount.startsAt.slice(0, 10) : '',
    endsAt: discount.endsAt ? discount.endsAt.slice(0, 10) : '',
    usageLimit: discount.usageLimit === null ? '' : String(discount.usageLimit),
    usageLimitPerCustomer:
      discount.usageLimitPerCustomer === null ? '' : String(discount.usageLimitPerCustomer),
    enabled: discount.enabled,
  }
}

/**
 * What the code is worth, in the unit that matches its type.
 *
 * `value` is deliberately overloaded server-side — a percentage for `percent`,
 * minor units for `fixed`, ignored for `free_shipping` — so the display has to
 * branch on the type rather than formatting the number blindly.
 */
function ValueCell({ discount, currency }: { discount: DiscountDto; currency: string }) {
  if (discount.type === 'free_shipping') {
    return <span className="text-sm text-muted-foreground">Free shipping</span>
  }
  if (discount.type === 'percent') {
    return <span className="text-sm tabular-nums">{discount.value}%</span>
  }
  return (
    <span className="text-sm tabular-nums">
      {new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
        discount.value / 100
      )}
    </span>
  )
}

/**
 * Enabled and live are different questions.
 *
 * A code can be switched on and still not work — because its window has not
 * opened, has closed, or its quota is spent. Showing only the toggle would make
 * "why isn't my code working?" a support ticket every time.
 */
function StatusBadge({ discount }: { discount: DiscountDto }) {
  if (!discount.enabled) return <Badge variant="outline">Disabled</Badge>
  if (discount.live) return <Badge variant="success">Live</Badge>
  return <Badge variant="warning">Not live</Badge>
}

export default function DiscountsPage() {
  const query = useDiscounts()
  const save = useSaveDiscount()
  const remove = useDeleteDiscount()
  const settings = useStoreSettings()
  const confirmDelete = useConfirmDelete()

  const currency = settings.data?.currency ?? 'USD'

  /**
   * The toolbar state lives in the URL, not in React: this view should survive a
   * reload, be linkable, and come back with the browser's back button.
   */
  const url = useUrlState()
  const search = url.get('q')
  const filter = url.one('filter', FILTER_VALUES, 'all')

  /**
   * Both writers clear `disc_page` — the paging key DataTable's `urlSync` writes
   * for this table (see the `paramPrefix` below). Narrowing the list has to send
   * you back to page 1: otherwise you keep whatever page number you were on and
   * land in the middle of the new results, having never seen the first ones.
   */
  function setSearch(value: string) {
    url.set({ q: value, disc_page: undefined })
  }

  function setFilter(value: FilterValue) {
    url.set({ filter: value === 'all' ? undefined : value, disc_page: undefined })
  }

  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const discounts = useMemo(() => {
    const rows = query.data ?? []
    const needle = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (filter === 'live' && !row.live) return false
      if (filter === 'scheduled' && (row.live || !row.enabled)) return false
      if (filter === 'off' && row.enabled) return false
      if (!needle) return true
      return (
        row.code.toLowerCase().includes(needle) || (row.name ?? '').toLowerCase().includes(needle)
      )
    })
  }, [query.data, search, filter])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setError(null)

    /**
     * Empty text means "no limit", which the API expects as `null` — sending
     * `0` would mean a code nobody can ever use.
     */
    const optionalInt = (value: string) => (value.trim() === '' ? null : Number(value))

    try {
      await save.mutateAsync({
        id: form.id,
        input: {
          code: form.code.trim(),
          name: form.name.trim() || null,
          description: form.description.trim() || null,
          type: form.type,
          value:
            form.type === 'percent'
              ? Number(form.percentValue)
              : form.type === 'fixed'
                ? (form.fixedValue ?? 0)
                : 0,
          minSubtotalAmount: form.minSubtotalAmount,
          maxDiscountAmount: form.type === 'percent' ? form.maxDiscountAmount : null,
          startsAt: form.startsAt || null,
          endsAt: form.endsAt || null,
          usageLimit: optionalInt(form.usageLimit),
          usageLimitPerCustomer: optionalInt(form.usageLimitPerCustomer),
          enabled: form.enabled,
        },
      })
      setForm(null)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const columns = useMemo<ColumnDef<DiscountDto>[]>(
    () => [
      {
        accessorKey: 'code',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="font-mono text-sm font-medium uppercase">{row.original.code}</span>
            {row.original.name ? (
              <span className="truncate text-xs text-muted-foreground">{row.original.name}</span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'type',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Value" />,
        cell: ({ row }) => <ValueCell discount={row.original} currency={currency} />,
      },
      {
        id: 'window',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Window" />,
        cell: ({ row }) => {
          const { startsAt, endsAt } = row.original
          if (!startsAt && !endsAt) {
            return <span className="text-xs text-muted-foreground">Always</span>
          }
          const fmt = (iso: string | null) =>
            iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'
          return (
            <span className="text-xs text-muted-foreground">
              {fmt(startsAt)} → {fmt(endsAt)}
            </span>
          )
        },
      },
      {
        id: 'usage',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Used"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => {
          const { usageCount, usageLimit } = row.original
          const spent = usageLimit !== null && usageCount >= usageLimit
          return (
            <div
              className={cn(
                'text-right text-sm tabular-nums',
                spent && 'font-medium text-amber-600'
              )}
            >
              {usageCount}
              {usageLimit !== null ? (
                <span className="text-muted-foreground"> / {usageLimit}</span>
              ) : null}
            </div>
          )
        },
      },
      {
        accessorKey: 'enabled',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusBadge discount={row.original} />,
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const discount = row.original
          return (
            <Can permission="ecommerce:discounts:manage">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon" className="size-8" />}
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                  <span className="sr-only">Actions for {discount.code}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setError(null)
                      setForm(toForm(discount))
                    }}
                  >
                    <Pencil className="mr-2 size-4" aria-hidden />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={async () => {
                      const confirmed = await confirmDelete({
                        title: `Delete ${discount.code}?`,
                        description:
                          'The code stops working immediately. Orders that already used it keep their discount.',
                      })
                      if (confirmed) remove.mutate(discount.id)
                    }}
                  >
                    <Trash2 className="mr-2 size-4" aria-hidden />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Can>
          )
        },
      },
    ],
    [confirmDelete, currency, remove]
  )

  const statusFilter = (
    <TableFilterTabs
      value={filter}
      options={FILTERS}
      onChange={setFilter}
    />
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discounts"
        subtitle="Codes shoppers can enter at checkout."
        count={query.data?.length ?? 0}
        actions={
          <Can permission="ecommerce:discounts:manage">
            <Button
              className="gap-2"
              onClick={() => {
                setError(null)
                setForm(emptyForm())
              }}
            >
              <Plus className="size-4" aria-hidden />
              New discount
            </Button>
          </Can>
        }
      />

      <DataTable
        columns={columns}
        data={discounts}
        getRowId={(row) => row.id}
        hideSyncColumn
        enableBulkSelect={false}
        searchPlaceholder="Search codes…"
        searchValue={search}
        onSearchChange={setSearch}
        filters={statusFilter}
        /**
         * Puts paging and sorting in the URL too, so the whole view is linkable
         * and survives a reload. The `disc` prefix keeps the table's own keys
         * (`disc_page`, `disc_size`, `disc_sort`) clear of the page-level `q`
         * and `filter` above — sharing the bare `q` key would make the table
         * re-filter rows this page has already filtered.
         */
        urlSync={{ paramPrefix: 'disc' }}
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-8">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Tag className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-sm font-medium">No discounts yet</p>
            <p className="text-xs text-muted-foreground">
              Create a code to run your first promotion.
            </p>
          </div>
        }
      />

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Edit discount' : 'New discount'}</DialogTitle>
          </DialogHeader>

          {form ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="code">Code</Label>
                  <Input
                    id="code"
                    value={form.code}
                    onChange={(e) => set('code', e.target.value.toUpperCase())}
                    placeholder="SUMMER20"
                    className="font-mono uppercase"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    What shoppers type. Case does not matter at checkout.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Internal name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="Summer sale"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="type">Type</Label>
                  <AppSelect
                    id="type"
                    value={form.type}
                    onChange={(value) => set('type', value as DiscountType)}
                    options={TYPE_OPTIONS}
                    isSearchable={false}
                  />
                </div>

                {form.type === 'percent' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="percent">Percentage off</Label>
                    <Input
                      id="percent"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={form.percentValue}
                      onChange={(e) => set('percentValue', Number(e.target.value))}
                      required
                    />
                  </div>
                ) : null}

                {form.type === 'fixed' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="fixed">Amount off</Label>
                    <MoneyInput
                      id="fixed"
                      value={form.fixedValue}
                      currency={currency}
                      onChange={(value) => set('fixedValue', value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Never takes more off than the basket is worth.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={2}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Shown to the shopper when the code is accepted."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="minSubtotal">Minimum basket</Label>
                  <MoneyInput
                    id="minSubtotal"
                    value={form.minSubtotalAmount}
                    currency={currency}
                    onChange={(value) => set('minSubtotalAmount', value)}
                    placeholder="No minimum"
                  />
                </div>
                {form.type === 'percent' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="maxDiscount">Maximum discount</Label>
                    <MoneyInput
                      id="maxDiscount"
                      value={form.maxDiscountAmount}
                      currency={currency}
                      onChange={(value) => set('maxDiscountAmount', value)}
                      placeholder="No cap"
                    />
                    <p className="text-xs text-muted-foreground">
                      Caps what a percentage can cost you on a large order.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="startsAt">Starts</Label>
                  <Input
                    id="startsAt"
                    type="date"
                    value={form.startsAt}
                    onChange={(e) => set('startsAt', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="endsAt">Ends</Label>
                  <Input
                    id="endsAt"
                    type="date"
                    value={form.endsAt}
                    onChange={(e) => set('endsAt', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="usageLimit">Total uses</Label>
                  <Input
                    id="usageLimit"
                    type="number"
                    min={1}
                    step={1}
                    value={form.usageLimit}
                    onChange={(e) => set('usageLimit', e.target.value)}
                    placeholder="Unlimited"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="perCustomer">Uses per customer</Label>
                  <Input
                    id="perCustomer"
                    type="number"
                    min={1}
                    step={1}
                    value={form.usageLimitPerCustomer}
                    onChange={(e) => set('usageLimitPerCustomer', e.target.value)}
                    placeholder="Unlimited"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="enabled">Enabled</Label>
                  <p className="text-xs text-muted-foreground">
                    Switch off to stop the code without deleting its history.
                  </p>
                </div>
                <Switch
                  id="enabled"
                  checked={form.enabled}
                  onCheckedChange={(checked) => set('enabled', checked)}
                />
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save discount'}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useState } from 'react'
import { Link } from '@inertiajs/react'
import { ArrowUpRight, Download, Laptop, Smartphone, Tablet } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { PageHeader } from '~/components/admin/page-header'
import { TableFilterTabs } from '~/components/admin/table-filter-tabs'
import { useOutboundClickHistory, useOutboundClicks, type OutboundClickDto } from '../_api'

const RANGES: { value: '7' | '30' | '90' | 'all'; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All time' },
]

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/**
 * Which products' `external` (affiliate) buy button shoppers actually follow,
 * ranked by clicks. Each click is recorded server-side by `/out/:productId`
 * (`ProductCtaClickService`) before it redirects onward — see
 * `modules/ecommerce/controllers/storefront/outbound_controller.ts`.
 */
export default function OutboundClicksPage() {
  const [range, setRange] = useState<'7' | '30' | '90' | 'all'>('30')
  const [selected, setSelected] = useState<OutboundClickDto | null>(null)
  const days = range === 'all' ? 'all' : Number(range)
  const query = useOutboundClicks(days)
  const rows = query.data ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outbound links"
        subtitle="Clicks on a product's 'Link elsewhere (affiliate)' buy button."
        count={rows.length}
        actions={
          <Button
            variant="outline"
            className="gap-2"
            render={<a href={`/api/admin/ecommerce/exports/outbound-clicks?days=${range}`} />}
          >
            <Download className="size-4" aria-hidden />
            Export CSV
          </Button>
        }
      />

      <TableFilterTabs value={range} onChange={setRange} options={RANGES} ariaLabel="Date range" />

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No outbound clicks in this window yet. A product's Buy button must be set to &quot;Link
          elsewhere (affiliate)&quot; before its clicks are tracked here.
        </p>
      ) : (
        <div className="rounded-lg border border-border">
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.productId}>
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{row.title}</span>
                    {row.externalUrl ? (
                      <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        {row.externalUrl}
                        <ArrowUpRight className="size-3 shrink-0" aria-hidden />
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    last click {formatWhen(row.lastClickedAt)}
                  </span>
                  <span className="shrink-0 tabular-nums font-medium">{row.clicks} clicks</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ClickHistoryDialog product={selected} days={days} onOpenChange={() => setSelected(null)} />
    </div>
  )
}

const DEVICE_ICONS = { desktop: Laptop, mobile: Smartphone, tablet: Tablet } as const

function ClickHistoryDialog({
  product,
  days,
  onOpenChange,
}: {
  product: OutboundClickDto | null
  days: number | 'all'
  onOpenChange: () => void
}) {
  const query = useOutboundClickHistory(product?.productId ?? null, days)
  const history = query.data ?? []

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      {/* An explicit rem value, not `max-w-md`/`max-w-lg`: this app's design
          tokens repurpose the `sm/md/lg/xl` container scale for its own
          responsive-breakpoint system (`--container-lg: 1024px` etc. in
          `inertia/css/app.css`), so those utilities are far wider here than
          Tailwind's own defaults — this bypasses that redefinition. */}
      <DialogContent className="max-h-[80vh] max-w-[28rem] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product?.title}</DialogTitle>
        </DialogHeader>

        {product ? (
          <Link
            href={`/admin/ecommerce/products/${product.productId}`}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            View product
          </Link>
        ) : null}

        <p className="text-xs text-muted-foreground">
          IP addresses are stored hashed for privacy and can&apos;t be shown individually — the
          server re-checks and rate-limits abuse on the hash instead.
        </p>

        <div className="mt-4 max-h-[50vh] space-y-1 overflow-y-auto">
          {query.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No clicks in this window.
            </p>
          ) : (
            history.map((click, i) => {
              const Icon = DEVICE_ICONS[click.deviceType]
              return (
                <div
                  // eslint-disable-next-line react/no-array-index-key -- append-only, server-ordered log with no stable id in the DTO
                  key={i}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm odd:bg-muted/30"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate tabular-nums">
                    {formatWhen(click.createdAt)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {[click.browser, click.os].filter(Boolean).join(' · ') || '—'}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

import { useState } from 'react'
import { Link } from '@inertiajs/react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  AlertTriangle,
  ArrowRight,
  Package,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '~/components/ui/chart'
import { PageHeader } from '~/components/admin/page-header'
import { formatMoney } from '../lib/money'
import { cn } from '~/lib/utils'
import { useAbandonedCarts, useSalesReport, useStoreStats } from './_api'
import { TableFilterTabs } from '~/components/admin/table-filter-tabs'

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]

const chartConfig = {
  revenue: { label: 'Revenue', color: 'var(--primary)' },
} satisfies ChartConfig

/**
 * Revenue over time, plus what sold most.
 *
 * Amounts arrive as integer minor units because a chart needs a number to plot;
 * the axis and tooltip format them for display and nothing here adds them up —
 * `windowRevenue` is computed server-side for exactly that reason.
 */
function SalesPanel() {
  const [days, setDays] = useState(30)
  /** Undefined means "the store's base" — the server decides what that is. */
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const query = useSalesReport(days, selected)
  const report = query.data

  // What the report actually came back in, which is authoritative.
  const currency = report?.currency ?? 'USD'
  const points = (report?.series ?? []).map((point) => ({
    ...point,
    // Recharts plots numbers; keep minor units out of the axis labels.
    major: point.revenue / 100,
  }))

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Revenue</CardTitle>
          <CardDescription>
            {report
              ? `${report.windowRevenue.formatted} from ${report.windowOrders} ${report.windowOrders === 1 ? 'order' : 'orders'}`
              : 'Loading…'}
          </CardDescription>

          {/*
            Shown only when there is more than one currency to choose from.
            Reports are single-currency by design — there are no exchange rates
            in this module, so adding €90 to $100 would produce a number that
            means nothing. Listing the others makes that visible instead of
            hiding it.
          */}
          {report && report.currenciesWithSales.length > 1 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {report.currenciesWithSales.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={report.currency === code}
                  onClick={() => setSelected(code)}
                  className={cn(
                    'rounded-md border px-2 py-0.5 font-mono text-xs transition-colors',
                    report.currency === code
                      ? 'border-foreground/20 bg-muted font-medium'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {code}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {/* Days are numbers; the shared control keys on strings, so they are
            converted at the boundary rather than widening its type. */}
        <TableFilterTabs
          value={String(days)}
          options={RANGES.map((range) => ({ value: String(range.days), label: range.label }))}
          onChange={(value) => setDays(Number(value))}
          ariaLabel="Date range"
        />
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <AreaChart data={points}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              minTickGap={24}
              tickFormatter={(value: string) =>
                new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              }
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={64}
              tickFormatter={(value: number) => formatMoney(Math.round(value * 100), currency)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatMoney(Math.round(Number(value) * 100), currency)}
                />
              }
            />
            <Area
              dataKey="major"
              name="revenue"
              type="monotone"
              stroke="var(--primary)"
              fill="var(--primary)"
              fillOpacity={0.15}
            />
          </AreaChart>
        </ChartContainer>

        {report && report.topProducts.length > 0 ? (
          <div className="mt-6 border-t pt-4">
            <p className="text-sm font-medium">Best sellers</p>
            <ul className="mt-2 space-y-1.5">
              {report.topProducts.map((product) => (
                <li key={`${product.productId ?? product.title}`} className="flex gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {product.productId ? (
                      <Link
                        href={`/admin/ecommerce/products/${product.productId}`}
                        className="hover:underline"
                      >
                        {product.title}
                      </Link>
                    ) : (
                      product.title
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {product.quantity} sold
                  </span>
                  <span className="shrink-0 tabular-nums">{product.revenue.formatted}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * Baskets filled and left. A list to look at, not a campaign tool — emailing
 * someone because they abandoned a basket needs consent and an unsubscribe path
 * first.
 */
function AbandonedCartsPanel() {
  const query = useAbandonedCarts()
  const carts = query.data ?? []

  if (carts.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Abandoned baskets</CardTitle>
        <CardDescription>
          Filled and left past the checkout window. Priced at today's prices.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {carts.slice(0, 8).map((cart) => (
            <li
              key={cart.id}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <ShoppingCart className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {cart.email ?? <span className="text-muted-foreground">Guest — no email</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'} ·{' '}
                  {new Date(cart.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <span className="shrink-0 tabular-nums">{cart.value.formatted}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
  href,
}: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'warning'
  href?: string
}) {
  const inner = (
    <Card className={cn('h-full', href && 'transition-colors hover:bg-accent/40')}>
      <CardContent className="flex items-start gap-3 p-4">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-md',
            tone === 'warning' ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-semibold tabular-nums">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {href ? <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
      </CardContent>
    </Card>
  )

  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  )
}

export default function EcommerceDashboardPage() {
  const stats = useStoreStats()
  const data = stats.data

  return (
    <div className="space-y-6">
      <PageHeader title="E-commerce" subtitle="Sales, stock and everything waiting on you." />

      {stats.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              icon={TrendingUp}
              label="Revenue"
              value={data?.revenue.formatted ?? '—'}
              hint="Collected, net of refunds"
            />
            <StatTile
              icon={Receipt}
              label="Paid orders"
              value={String(data?.paidOrdersCount ?? 0)}
              hint={
                data?.averageOrderValue ? `${data.averageOrderValue.formatted} average` : undefined
              }
              href="/admin/ecommerce/orders"
            />
            <StatTile
              icon={Package}
              label="Active products"
              value={String(data?.activeProductsCount ?? 0)}
              hint={`${data?.productsCount ?? 0} total`}
              href="/admin/ecommerce/products"
            />
            <StatTile
              icon={Users}
              label="Customers"
              value={String(data?.customersCount ?? 0)}
              href="/admin/ecommerce/customers"
            />
          </div>

          {(data?.activeAffiliatesCount ?? 0) > 0 ||
          (data?.pendingAffiliatesCount ?? 0) > 0 ||
          (data?.affiliatePayable.amount ?? 0) > 0 ||
          (data?.affiliatePaid.amount ?? 0) > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatTile
                icon={Users}
                label="Active affiliates"
                value={String(data?.activeAffiliatesCount ?? 0)}
                hint={
                  (data?.pendingAffiliatesCount ?? 0) > 0
                    ? `${data?.pendingAffiliatesCount} application(s) pending`
                    : undefined
                }
                tone={(data?.pendingAffiliatesCount ?? 0) > 0 ? 'warning' : undefined}
                href="/admin/marketing/affiliates"
              />
              <StatTile
                icon={Receipt}
                label="Commission payable"
                value={data?.affiliatePayable.formatted ?? '—'}
                hint="Approved, awaiting payout"
                href="/admin/marketing/withdrawals"
              />
              <StatTile
                icon={TrendingUp}
                label="Paid to affiliates"
                value={data?.affiliatePaid.formatted ?? '—'}
                hint="Lifetime commission paid"
              />
            </div>
          ) : null}

          {(data?.pendingOrdersCount ?? 0) > 0 || (data?.lowStockCount ?? 0) > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {(data?.pendingOrdersCount ?? 0) > 0 ? (
                <StatTile
                  icon={Receipt}
                  tone="warning"
                  label="Awaiting payment"
                  value={String(data?.pendingOrdersCount ?? 0)}
                  hint="Unpaid orders still holding stock"
                  href="/admin/ecommerce/orders"
                />
              ) : null}
              {(data?.lowStockCount ?? 0) > 0 ? (
                <StatTile
                  icon={AlertTriangle}
                  tone="warning"
                  label="Low stock"
                  value={String(data?.lowStockCount ?? 0)}
                  hint="Variants with 5 or fewer units left"
                  href="/admin/ecommerce/products"
                />
              ) : null}
            </div>
          ) : null}

          <SalesPanel />
          <AbandonedCartsPanel />
        </>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '~/components/ui/chart'
import { AppSelect } from '~/components/ui/app-select'
import { DateRangePicker, type DateRangeValue } from '~/components/admin/date-range-picker'
import {
  useAnalyticsReport,
  type Breakdown,
  type Granularity,
  type TopPage,
} from '~/hooks/api/use-analytics'

const PIE_COLORS = [
  'var(--primary)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]

const trafficConfig = {
  pageviews: { label: 'Pageviews', color: 'var(--primary)' },
  visitors: { label: 'Visitors', color: 'var(--chart-2)' },
} satisfies ChartConfig

function fmtInt(n: number): string {
  return new Intl.NumberFormat().format(n)
}
function fmtDuration(seconds: number): string {
  if (!seconds) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m ? `${m}m ${s}s` : `${s}s`
}
function fmtLabel(date: string, g: Granularity): string {
  const d = DateTime.fromISO(date)
  if (!d.isValid) return date
  if (g === 'month') return d.toFormat('LLL yyyy')
  return d.toFormat('d LLL')
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: DateTime.now().minus({ days: 29 }).toISODate()!,
    to: DateTime.now().toISODate()!,
  }))
  const [granularity, setGranularity] = useState<Granularity>('day')

  const from = range.from ?? DateTime.now().minus({ days: 29 }).toISODate()!
  const to = range.to ?? DateTime.now().toISODate()!

  const { data, isPending, isError } = useAnalyticsReport({ from, to, granularity })

  const chartData = useMemo(
    () =>
      (data?.timeseries ?? []).map((p) => ({
        label: fmtLabel(p.date, granularity),
        pageviews: p.pageviews,
        visitors: p.visitors,
      })),
    [data?.timeseries, granularity]
  )

  const s = data?.summary

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Traffic and audience insights</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-36">
            <AppSelect
              value={granularity}
              onChange={(v) => setGranularity(v as Granularity)}
              options={GRANULARITIES}
              isSearchable={false}
              size="sm"
            />
          </div>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      {isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            Could not load analytics.
          </CardContent>
        </Card>
      ) : null}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pageviews" value={s ? fmtInt(s.pageviews) : '—'} loading={isPending} />
        <StatCard
          label="Unique visitors"
          value={s ? fmtInt(s.visitors) : '—'}
          loading={isPending}
        />
        <StatCard label="Sessions" value={s ? fmtInt(s.sessions) : '—'} loading={isPending} />
        <StatCard
          label="Bounce rate"
          value={s ? `${Math.round(s.bounceRate * 100)}%` : '—'}
          hint={s ? `Avg. session ${fmtDuration(s.avgSessionSeconds)}` : undefined}
          loading={isPending}
        />
      </div>

      {/* Visitors over time */}
      <Card>
        <CardHeader>
          <CardTitle>Traffic over time</CardTitle>
          <CardDescription>
            Pageviews and unique visitors — {fmtLabel(from, 'day')} to {fmtLabel(to, 'day')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={trafficConfig} className="h-[300px] w-full">
            <AreaChart data={chartData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                tickMargin={8}
                minTickGap={24}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={12}
                width={40}
                allowDecimals={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="pageviews"
                stroke="var(--color-pageviews)"
                fill="var(--color-pageviews)"
                fillOpacity={0.15}
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="visitors"
                stroke="var(--color-visitors)"
                fill="var(--color-visitors)"
                fillOpacity={0.1}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Top pages */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top pages</CardTitle>
            <CardDescription>Most visited pages in this period</CardDescription>
          </CardHeader>
          <CardContent>
            <TopPagesTable rows={data?.topPages ?? []} loading={isPending} />
          </CardContent>
        </Card>

        {/* Traffic sources */}
        <Card>
          <CardHeader>
            <CardTitle>Traffic sources</CardTitle>
            <CardDescription>Where visitors come from</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutBreakdown rows={data?.sources ?? []} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Devices */}
        <Card>
          <CardHeader>
            <CardTitle>Devices</CardTitle>
            <CardDescription>Desktop, mobile & tablet</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutBreakdown rows={data?.devices ?? []} />
          </CardContent>
        </Card>

        {/* Browsers */}
        <Card>
          <CardHeader>
            <CardTitle>Browsers</CardTitle>
          </CardHeader>
          <CardContent>
            <BarBreakdown rows={data?.browsers ?? []} />
          </CardContent>
        </Card>

        {/* OS */}
        <Card>
          <CardHeader>
            <CardTitle>Operating systems</CardTitle>
          </CardHeader>
          <CardContent>
            <BarBreakdown rows={data?.os ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  loading,
}: {
  label: string
  value: string
  hint?: string
  loading?: boolean
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{loading ? '…' : value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

function TopPagesTable({ rows, loading }: { rows: TopPage[]; loading?: boolean }) {
  if (loading && rows.length === 0)
    return <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
  if (rows.length === 0)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">No data for this period.</p>
    )
  const max = Math.max(...rows.map((r) => r.pageviews), 1)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1 pb-1 text-xs text-muted-foreground">
        <span>Page</span>
        <span>Views · Visitors</span>
      </div>
      {rows.map((r) => (
        <div key={r.path} className="relative overflow-hidden rounded-md">
          <div
            className="absolute inset-y-0 left-0 bg-primary/10"
            style={{ width: `${(r.pageviews / max) * 100}%` }}
          />
          <div className="relative flex items-center justify-between px-2 py-1.5 text-sm">
            <span className="truncate font-mono text-xs">{r.path}</span>
            <span className="ml-3 shrink-0 tabular-nums text-muted-foreground">
              {fmtInt(r.pageviews)} · {fmtInt(r.visitors)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function DonutBreakdown({ rows }: { rows: Breakdown[] }) {
  const total = rows.reduce((sum, r) => sum + r.count, 0)
  if (total === 0)
    return <p className="py-10 text-center text-sm text-muted-foreground">No data yet.</p>
  return (
    <div className="flex flex-col items-center gap-4">
      <ChartContainer config={{}} className="h-[180px] w-full">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
          <Pie
            data={rows}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={72}
            dataKey="count"
            nameKey="label"
          >
            {rows.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="flex w-full flex-col gap-1.5">
        {rows.map((r, i) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 capitalize">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
              />
              <span className="text-muted-foreground">{r.label}</span>
            </span>
            <span className="tabular-nums text-muted-foreground">
              {Math.round((r.count / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarBreakdown({ rows }: { rows: Breakdown[] }) {
  if (rows.length === 0)
    return <p className="py-6 text-center text-sm text-muted-foreground">No data yet.</p>
  const max = Math.max(...rows.map((r) => r.count), 1)
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-0.5 flex items-center justify-between text-xs">
            <span className="truncate">{r.label}</span>
            <span className="tabular-nums text-muted-foreground">{fmtInt(r.count)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

import { Link } from '@inertiajs/react'
import { useMemo, type FC } from 'react'
import { usePathname, useRouter, useSearchParams } from '~/hooks/use-inertia-url'
import { Eye, FileText, Pencil, Users } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { useContentList } from '~/hooks/api/use-content'
import type { ContentDto } from '~/types/api'
import { mergeSearchParamsLive, replaceUrlIfChanged } from '~/lib/table-url-params'
import { cn, formatAdminTableDateTime } from '~/lib/utils'

interface DashboardStats {
  totalUsers: number
  totalContent: number
  publishedContent: number
  draftContent: number
}

interface Props {
  stats: DashboardStats
}

function parseContentTab(sp: ReturnType<typeof useSearchParams>): string {
  const t = sp.get('tab')
  if (t === 'published' || t === 'draft' || t === 'all') return t
  return 'all'
}

function formatCount(n: number): string {
  return n.toLocaleString()
}

function DashboardPageInner({ stats }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = useMemo(() => parseContentTab(searchParams), [searchParams])
  const contentQuery = useContentList()

  const onTabChange = (value: string) => {
    const merged = mergeSearchParamsLive(searchParams, {
      tab: value === 'all' ? undefined : value,
    })
    replaceUrlIfChanged(pathname, router, merged, { scroll: false })
  }

  const allRows = useMemo(() => contentQuery.data ?? [], [contentQuery.data])
  const publishedRows = useMemo(() => allRows.filter((c) => c.status === 'PUBLISHED'), [allRows])
  const draftRows = useMemo(() => allRows.filter((c) => c.status === 'DRAFT'), [allRows])

  const publishedPct =
    stats.totalContent > 0 ? Math.round((stats.publishedContent / stats.totalContent) * 100) : 0

  const statCards = useMemo(
    () => [
      {
        title: 'Total Posts',
        value: formatCount(stats.totalContent),
        caption: 'All entries in the CMS',
        icon: FileText,
        accent: 'text-ring',
        bgAccent: 'bg-ring/10',
      },
      {
        title: 'Published',
        value: formatCount(stats.publishedContent),
        caption: `${publishedPct}% of all posts`,
        icon: Eye,
        accent: 'text-emerald-600 dark:text-emerald-400',
        bgAccent: 'bg-emerald-500/10',
      },
      {
        title: 'Drafts',
        value: formatCount(stats.draftContent),
        caption: 'Awaiting publish',
        icon: Pencil,
        accent: 'text-amber-600 dark:text-amber-400',
        bgAccent: 'bg-amber-500/10',
      },
      {
        title: 'Total Users',
        value: formatCount(stats.totalUsers),
        caption: 'Registered accounts',
        icon: Users,
        accent: 'text-ring',
        bgAccent: 'bg-ring/10',
      },
    ],
    [stats, publishedPct]
  )

  const columns = useMemo<ColumnDef<ContentDto>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => (
          <div className="flex flex-col leading-tight">
            <span className="font-medium">{row.original.title}</span>
            <span className="text-xs text-muted-foreground">{row.original.slug}</span>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'PUBLISHED' ? 'success' : 'secondary'}>
            {row.original.status === 'PUBLISHED' ? 'Published' : 'Draft'}
          </Badge>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Updated"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right text-xs text-muted-foreground tabular-nums">
            {formatAdminTableDateTime(row.original.updatedAt)}
          </div>
        ),
      },
    ],
    []
  )

  const activeData = tab === 'published' ? publishedRows : tab === 'draft' ? draftRows : allRows

  const statusFilters = [
    { value: 'all', label: 'All posts', count: allRows.length },
    { value: 'published', label: 'Published', count: publishedRows.length },
    { value: 'draft', label: 'Drafts', count: draftRows.length },
  ]
  const statusFilter = (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      {statusFilters.map((f) => {
        const active = tab === f.value
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onTabChange(f.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
              active
                ? 'bg-background font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
            <span className="text-xs tabular-nums text-muted-foreground">{f.count}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" subtitle="Content performance at a glance" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((s) => (
          <div key={s.title} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">{s.title}</span>
              <div className={cn('flex size-9 items-center justify-center rounded-lg', s.bgAccent)}>
                <s.icon className={cn('size-[18px]', s.accent)} />
              </div>
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{s.value}</div>
            <p className="mt-1 text-xs text-muted-foreground">{s.caption}</p>
          </div>
        ))}
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Recent content</h2>
            <p className="text-xs text-muted-foreground">
              {contentQuery.isLoading
                ? 'Loading…'
                : `${allRows.length} post${allRows.length === 1 ? '' : 's'} in the CMS`}
            </p>
          </div>
          <Button variant="outline" size="sm" render={<Link href="/admin/content" />}>
            View all
          </Button>
        </div>

        {contentQuery.error ? (
          <p className="text-sm text-destructive">{(contentQuery.error as Error).message}</p>
        ) : (
          <DataTable
            key={tab}
            columns={columns}
            data={activeData}
            filters={statusFilter}
            searchPlaceholder="Search posts…"
            defaultPageSize={5}
            urlSync={{ paramPrefix: tab }}
            hideSyncColumn
            enableBulkSelect={false}
            emptyMessage={contentQuery.isLoading ? 'Loading…' : 'No posts yet.'}
          />
        )}
      </section>
    </div>
  )
}

const DashboardPage: FC<Props> = ({ stats }) => {
  return <DashboardPageInner stats={stats} />
}

export default DashboardPage

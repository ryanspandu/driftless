
import { Link } from '@inertiajs/react'
import { useMemo, type FC } from 'react'
import { usePathname, useRouter, useSearchParams } from '~/hooks/use-inertia-url'
import { Eye, FileText, Users } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { useContentList } from '~/hooks/api/use-content'
import type { ContentDto } from '~/types/api'
import {
  mergeSearchParamsLive,
  replaceUrlIfChanged,
} from '~/lib/table-url-params'
import { formatAdminTableDateTime } from '~/lib/utils'

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
  const publishedRows = useMemo(
    () => allRows.filter((c) => c.status === 'PUBLISHED'),
    [allRows]
  )
  const draftRows = useMemo(() => allRows.filter((c) => c.status === 'DRAFT'), [allRows])

  const statCards = useMemo(
    () => [
      {
        title: 'Total Posts',
        value: formatCount(stats.totalContent),
        icon: FileText,
        accent: 'text-ring',
        bgAccent: 'bg-ring/10',
      },
      {
        title: 'Published',
        value: formatCount(stats.publishedContent),
        icon: Eye,
        accent: 'text-emerald-600',
        bgAccent: 'bg-emerald-500/10',
      },
      {
        title: 'Drafts',
        value: formatCount(stats.draftContent),
        icon: FileText,
        accent: 'text-amber-600',
        bgAccent: 'bg-amber-500/10',
      },
      {
        title: 'Total Users',
        value: formatCount(stats.totalUsers),
        icon: Users,
        accent: 'text-ring',
        bgAccent: 'bg-ring/10',
      },
    ],
    [stats]
  )

  const columns = useMemo<ColumnDef<ContentDto>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        accessorKey: 'slug',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Slug" />,
        cell: ({ row }) => (
          <span className="font-mono text-sm text-muted-foreground">{row.original.slug}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'PUBLISHED' ? 'default' : 'secondary'}>
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
          <div className="text-right text-sm text-muted-foreground tabular-nums">
            {formatAdminTableDateTime(row.original.updatedAt)}
          </div>
        ),
      },
    ],
    []
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">Content performance at a glance</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription className="text-sm font-medium">{s.title}</CardDescription>
              <div className={`rounded-md p-2 ${s.bgAccent}`}>
                <s.icon className={`size-4 ${s.accent}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent content</CardTitle>
            <CardDescription>
              {contentQuery.isLoading
                ? 'Loading…'
                : `${allRows.length} post${allRows.length === 1 ? '' : 's'} in the CMS`}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" render={<Link href="/admin/content" />}>
            View all
          </Button>
        </CardHeader>
        <CardContent>
          {contentQuery.error ? (
            <p className="text-sm text-destructive">{(contentQuery.error as Error).message}</p>
          ) : (
            <Tabs value={tab} onValueChange={onTabChange}>
              <TabsList>
                <TabsTrigger value="all">All posts</TabsTrigger>
                <TabsTrigger value="published">Published</TabsTrigger>
                <TabsTrigger value="draft">Drafts</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-4">
                {tab === 'all' ? (
                  <DataTable
                    columns={columns}
                    data={allRows}
                    searchPlaceholder="Search posts…"
                    defaultPageSize={5}
                    urlSync={{ paramPrefix: 'all' }}
                    emptyMessage="No posts yet."
                  />
                ) : null}
              </TabsContent>
              <TabsContent value="published" className="mt-4">
                {tab === 'published' ? (
                  <DataTable
                    columns={columns}
                    data={publishedRows}
                    searchPlaceholder="Search published…"
                    defaultPageSize={5}
                    urlSync={{ paramPrefix: 'published' }}
                    emptyMessage="No published posts."
                  />
                ) : null}
              </TabsContent>
              <TabsContent value="draft" className="mt-4">
                {tab === 'draft' ? (
                  <DataTable
                    columns={columns}
                    data={draftRows}
                    searchPlaceholder="Search drafts…"
                    defaultPageSize={5}
                    urlSync={{ paramPrefix: 'draft' }}
                    emptyMessage="No drafts."
                  />
                ) : null}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const DashboardPage: FC<Props> = ({ stats }) => {
  return <DashboardPageInner stats={stats} />
}

export default DashboardPage

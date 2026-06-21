import { useMemo, useState } from 'react'
import { router } from '@inertiajs/react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, MoreHorizontal, Plus, SquarePen, Star, Trash2 } from 'lucide-react'
import type { TemplateSummaryDto, TemplateType } from '~/types/api'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { TemplateFormDialog } from '~/components/admin/template-form-dialog'
import {
  useTemplatesList,
  useCreateTemplate,
  useDeleteTemplate,
  useDuplicateTemplate,
  useSetDefaultTemplate,
} from '~/hooks/api/use-templates'
import { formatAdminTableDateTime } from '~/lib/utils'
import { apiErrorMessage } from '~/lib/api'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'

const TYPE_LABEL: Record<TemplateType, string> = {
  HEADER: 'Header',
  FOOTER: 'Footer',
  COMPONENT: 'Component',
  LAYOUT: 'Layout',
}

type TabValue = 'all' | TemplateType

const TABS: { value: TabValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'HEADER', label: 'Headers' },
  { value: 'FOOTER', label: 'Footers' },
  { value: 'COMPONENT', label: 'Components' },
  { value: 'LAYOUT', label: 'Layouts' },
]

export default function TemplatesPage() {
  const confirmDelete = useConfirmDelete()
  const [tab, setTab] = useState<TabValue>('all')
  const listQuery = useTemplatesList(tab === 'all' ? undefined : tab)
  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const createMut = useCreateTemplate()
  const deleteMut = useDeleteTemplate()
  const duplicateMut = useDuplicateTemplate()
  const setDefaultMut = useSetDefaultTemplate()
  const [dialogOpen, setDialogOpen] = useState(false)

  const columns = useMemo<ColumnDef<TemplateSummaryDto, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (r) => r.name,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'type',
        accessorFn: (r) => r.type,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ row }) => (
          <Badge variant="outline">{TYPE_LABEL[row.original.type] ?? row.original.type}</Badge>
        ),
      },
      {
        id: 'default',
        accessorFn: (r) => r.isDefault,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Default" />,
        cell: ({ row }) =>
          row.original.isDefault ? (
            <Badge variant="default" className="gap-1">
              <Star className="size-3" />
              Default
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
      },
      {
        id: 'updatedAt',
        accessorFn: (r) => r.updatedAt,
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
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="size-8" />}
              aria-label="Row actions"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="gap-2"
                onClick={() => router.visit(`/admin/templates/${row.original.id}/edit`)}
              >
                <SquarePen className="size-4" />
                Open builder
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                disabled={row.original.isDefault}
                onClick={() => void setDefaultMut.mutateAsync(row.original.id)}
              >
                <Star className="size-4" />
                Set default
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onClick={() => void duplicateMut.mutateAsync(row.original.id)}
              >
                <Copy className="size-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                className="gap-2"
                onClick={() => {
                  void confirmDelete({ description: 'Delete this template?' }).then(
                    async (confirmed) => {
                      if (!confirmed) return
                      try {
                        await deleteMut.mutateAsync(row.original.id)
                      } catch (e) {
                        toast.error(apiErrorMessage(e, 'Failed to delete'))
                      }
                    }
                  )
                }}
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [confirmDelete, deleteMut, duplicateMut, setDefaultMut]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Reusable headers, footers, layouts &amp; components for your pages
          </p>
        </div>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          New template
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>All templates</CardTitle>
          <CardDescription>
            {listQuery.isLoading ? 'Loading…' : `${rows.length} templates`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(r) => r.id}
            hideSyncColumn
            searchPlaceholder="Search by name…"
            emptyMessage={
              listQuery.isLoading
                ? 'Loading…'
                : 'No templates yet — create your first template.'
            }
          />
        </CardContent>
      </Card>

      <TemplateFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={async (values) => {
          const created = await createMut.mutateAsync(values)
          router.visit(`/admin/templates/${created.id}/edit`)
        }}
      />
    </div>
  )
}

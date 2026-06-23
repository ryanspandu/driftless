import { useMemo, useState } from 'react'
import { router } from '@inertiajs/react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, MoreHorizontal, Plus, SquarePen, Star, Trash2 } from 'lucide-react'
import type { TemplateSummaryDto, TemplateType } from '~/types/api'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { TemplateFormDialog } from '~/components/admin/template-form-dialog'
import {
  useTemplatesList,
  useCreateTemplate,
  useDeleteTemplate,
  useDuplicateTemplate,
  useSetDefaultTemplate,
} from '~/hooks/api/use-templates'
import { cn, formatAdminTableDateTime } from '~/lib/utils'
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
        // Primary cell: template name with its type label as muted secondary text.
        cell: ({ row }) => (
          <div className="flex flex-col leading-tight">
            <span className="font-medium">{row.original.name}</span>
            <span className="text-xs text-muted-foreground">
              {TYPE_LABEL[row.original.type] ?? row.original.type}
            </span>
          </div>
        ),
      },
      {
        id: 'default',
        accessorFn: (r) => r.isDefault,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Default" />,
        cell: ({ row }) =>
          row.original.isDefault ? (
            <Badge variant="success" className="gap-1">
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
          <div className="text-right text-xs text-muted-foreground tabular-nums">
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

  // Type filter (All / Headers / Footers / Components / Layouts) lives in the
  // table toolbar as a compact segmented control. Filtering is server-side, so
  // only the active tab's row count is known — per-segment counts are omitted.
  const typeFilter = (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      {TABS.map((t) => {
        const active = tab === t.value
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
              active
                ? 'bg-background font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        subtitle="Reusable headers, footers, layouts & components for your pages"
        count={listQuery.isLoading ? undefined : rows.length}
        actions={
          <Button className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            New template
          </Button>
        }
      />

      <DataTable
        key={tab}
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        hideSyncColumn
        searchPlaceholder="Search by name…"
        filters={typeFilter}
        emptyMessage={
          listQuery.isLoading ? 'Loading…' : 'No templates yet — create your first template.'
        }
      />

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

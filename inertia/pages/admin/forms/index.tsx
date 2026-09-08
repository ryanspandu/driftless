import { useMemo, useState } from 'react'
import { router } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Copy, Inbox, MoreHorizontal, Plus, SquarePen, Trash2 } from 'lucide-react'
import type { FormSummaryDto } from '~/types/api'
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
import { FormCreateDialog } from '~/components/admin/form-create-dialog'
import {
  useFormsList,
  useCreateForm,
  useDeleteForm,
  useDuplicateForm,
} from '~/hooks/api/use-forms-admin'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { formatAdminTableDateTime } from '~/lib/utils'

const STATUS_VARIANT: Record<FormSummaryDto['status'], 'success' | 'secondary' | 'warning'> = {
  active: 'success',
  inactive: 'secondary',
  draft: 'warning',
}

export default function FormsListPage() {
  const confirmDelete = useConfirmDelete()
  const listQuery = useFormsList()
  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const createMut = useCreateForm()
  const deleteMut = useDeleteForm()
  const dupMut = useDuplicateForm()
  const [dialogOpen, setDialogOpen] = useState(false)

  const columns = useMemo<ColumnDef<FormSummaryDto, unknown>[]>(
    () => [
      {
        id: 'title',
        accessorFn: (r) => r.title,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Form" />,
        cell: ({ row }) => (
          <div className="flex flex-col leading-tight">
            <span className="font-medium">{row.original.title}</span>
            <span className="font-mono text-xs text-muted-foreground">{row.original.slug}</span>
          </div>
        ),
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]} className="capitalize">
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'fields',
        accessorFn: (r) => r.fieldCount,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Fields" />,
        cell: ({ row }) => <span className="tabular-nums">{row.original.fieldCount}</span>,
      },
      {
        id: 'submissions',
        accessorFn: (r) => r.submissionCount,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Submissions" />,
        cell: ({ row }) => <span className="tabular-nums">{row.original.submissionCount}</span>,
      },
      {
        id: 'updatedAt',
        accessorFn: (r) => r.updatedAt,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Updated" className="ml-auto w-full justify-end" />
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
                onClick={() => router.visit(`/admin/forms/${row.original.id}?tab=fields`)}
              >
                <SquarePen className="size-4" /> Edit fields
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onClick={() => router.visit(`/admin/forms/${row.original.id}?tab=submissions`)}
              >
                <Inbox className="size-4" /> View submissions
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onClick={() =>
                  void dupMut
                    .mutateAsync(row.original.id)
                    .then(() => toast.success('Form duplicated'))
                    .catch(() => toast.error('Could not duplicate'))
                }
              >
                <Copy className="size-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                className="gap-2"
                onClick={() => {
                  void confirmDelete({
                    description: 'Delete this form? Its submissions are kept.',
                  }).then((confirmed) => {
                    if (confirmed) void deleteMut.mutateAsync(row.original.id)
                  })
                }}
              >
                <Trash2 className="size-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [confirmDelete, deleteMut, dupMut]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forms"
        subtitle="Custom forms with their own fields. Submissions land in each form’s inbox."
        count={listQuery.isLoading ? undefined : rows.length}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => router.visit('/admin/forms/submissions')}>
              <Inbox className="size-4" /> All submissions
            </Button>
            <Button className="gap-2" onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" /> New form
            </Button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        hideSyncColumn
        searchPlaceholder="Search forms…"
        emptyMessage={listQuery.isLoading ? 'Loading…' : 'No forms yet — create your first form.'}
      />

      <FormCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={async (title) => {
          const form = await createMut.mutateAsync({ title })
          setDialogOpen(false)
          router.visit(`/admin/forms/${form.id}?tab=fields`)
        }}
      />
    </div>
  )
}

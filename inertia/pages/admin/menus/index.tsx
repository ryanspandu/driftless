import { useMemo, useState, type FormEvent } from 'react'
import { router } from '@inertiajs/react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { ListTree, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { MenuSummaryDto } from '~/types/api'
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
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { formatAdminTableDateTime } from '~/lib/utils'
import { apiErrorMessage } from '~/lib/api'
import { useMenusList, useCreateMenu, useUpdateMenu, useDeleteMenu } from '~/hooks/api/use-menus'

type DialogState =
  | { mode: 'create'; name: string; handle: string }
  | { mode: 'rename'; id: string; name: string; handle: string }

export default function MenusPage() {
  const listQuery = useMenusList()
  const createMut = useCreateMenu()
  const updateMut = useUpdateMenu()
  const deleteMut = useDeleteMenu()
  const confirmDelete = useConfirmDelete()

  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = listQuery.data ?? []

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!dialog) return
    setError(null)
    const name = dialog.name.trim()
    if (!name) {
      setError('Name is required')
      return
    }
    try {
      if (dialog.mode === 'create') {
        const created = await createMut.mutateAsync({
          name,
          handle: dialog.handle.trim() || undefined,
        })
        setDialog(null)
        router.visit(`/admin/menus/${created.id}/edit`)
      } else {
        await updateMut.mutateAsync({
          id: dialog.id,
          name,
          handle: dialog.handle.trim() || undefined,
        })
        setDialog(null)
      }
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const columns = useMemo<ColumnDef<MenuSummaryDto>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => (
          <button
            type="button"
            className="text-left font-medium hover:underline"
            onClick={() => router.visit(`/admin/menus/${row.original.id}/edit`)}
          >
            {row.original.name}
          </button>
        ),
      },
      {
        accessorKey: 'handle',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Handle" />,
        cell: ({ row }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.original.handle}</code>
        ),
      },
      {
        accessorKey: 'itemCount',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
        cell: ({ row }) => <Badge variant="secondary">{row.original.itemCount}</Badge>,
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatAdminTableDateTime(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const menu = row.original
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon" className="size-8" />}
                  aria-label="Row actions"
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => router.visit(`/admin/menus/${menu.id}/edit`)}>
                    <ListTree className="mr-2 size-4" /> Edit items
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      setDialog({
                        mode: 'rename',
                        id: menu.id,
                        name: menu.name,
                        handle: menu.handle,
                      })
                    }
                  >
                    <Pencil className="mr-2 size-4" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={async () => {
                      const ok = await confirmDelete({
                        title: `Delete "${menu.name}"?`,
                        description:
                          'The menu and its items will be removed. Any MenuBar block bound to this menu will render nothing.',
                      })
                      if (!ok) return
                      try {
                        await deleteMut.mutateAsync(menu.id)
                        toast.success('Menu deleted')
                      } catch (err) {
                        toast.error(apiErrorMessage(err))
                      }
                    }}
                  >
                    <Trash2 className="mr-2 size-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ],
    [confirmDelete, deleteMut]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menus"
        subtitle="Reusable navigation menus — nest and order items, then render one with a MenuBar block in a header/footer template."
        count={listQuery.isLoading ? undefined : rows.length}
        actions={
          <Button
            className="gap-2"
            onClick={() => setDialog({ mode: 'create', name: '', handle: '' })}
          >
            <Plus className="size-4" />
            New menu
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        hideSyncColumn
        searchPlaceholder="Search by name…"
        emptyMessage={listQuery.isLoading ? 'Loading…' : 'No menus yet — create your first menu.'}
      />

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{dialog?.mode === 'rename' ? 'Rename menu' : 'New menu'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="menu-name">Name</Label>
                <Input
                  id="menu-name"
                  autoFocus
                  value={dialog?.name ?? ''}
                  onChange={(e) => setDialog((d) => (d ? { ...d, name: e.target.value } : d))}
                  placeholder="Primary navigation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="menu-handle">Handle (optional)</Label>
                <Input
                  id="menu-handle"
                  value={dialog?.handle ?? ''}
                  onChange={(e) => setDialog((d) => (d ? { ...d, handle: e.target.value } : d))}
                  placeholder="primary"
                />
                <p className="text-xs text-muted-foreground">
                  The key a MenuBar block binds to. Leave blank to derive it from the name.
                </p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {dialog?.mode === 'rename' ? 'Save' : 'Create & edit items'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

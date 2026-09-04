import { useMemo, useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { toast } from 'sonner'
import {
  Copy,
  Download,
  ExternalLink,
  Layers,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  SquarePen,
  Trash2,
  Upload,
} from 'lucide-react'
import { PAGE_ROLE_SLOTS, type PageSummaryDto } from '~/types/api'
import { modulePageRoles } from '~/lib/module-page-roles'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { TrashModal } from '~/components/trash-modal'
import { PageFormDialog } from '~/components/admin/page-form-dialog'
import {
  usePagesList,
  useCreatePage,
  useUpdatePage,
  useDeletePage,
  useTrashedPages,
  useRestorePage,
  useForceDeletePage,
  useDuplicatePage,
  useImportPage,
  useBulkPages,
  usePreviewToken,
} from '~/hooks/api/use-pages'
import { useUpdateWebsiteSettings, useWebsiteSettings } from '~/hooks/api/use-website-settings'
import { cn, formatAdminTableDateTime } from '~/lib/utils'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'

const RENDER_MODE_LABEL: Record<string, string> = {
  SSR: 'SSR',
  SSG: 'Static',
  CSR: 'PWA',
}

type DialogMode = { kind: 'create' } | { kind: 'edit'; row: PageSummaryDto }

export default function PagesPage() {
  const confirmDelete = useConfirmDelete()
  const listQuery = usePagesList()
  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const createMut = useCreatePage()
  const updateMut = useUpdatePage()
  const deleteMut = useDeletePage()

  const trashedQuery = useTrashedPages()
  const restoreMut = useRestorePage()
  const forceDeleteMut = useForceDeletePage()
  const duplicateMut = useDuplicatePage()
  const importMut = useImportPage()
  const bulkMut = useBulkPages()
  const previewTokenMut = usePreviewToken()
  const trashedItems = useMemo(() => trashedQuery.data ?? [], [trashedQuery.data])
  const [trashOpen, setTrashOpen] = useState(false)
  const [selection, setSelection] = useState<RowSelectionState>({})
  const selectedIds = useMemo(() => Object.keys(selection).filter((k) => selection[k]), [selection])
  const importInputRef = useRef<HTMLInputElement>(null)

  const onDuplicate = async (id: string) => {
    try {
      await duplicateMut.mutateAsync(id)
      toast.success('Page duplicated')
    } catch {
      toast.error('Could not duplicate')
    }
  }

  const onExport = async (id: string, title: string) => {
    try {
      const data = await (
        await import('~/lib/api')
      ).apiGet<Record<string, unknown>>(`/api/admin/pages/${id}/export`)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'page'}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Could not export')
    }
  }

  const onImportFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text())
      await importMut.mutateAsync(parsed)
      toast.success('Page imported as a draft')
    } catch {
      toast.error('Invalid page file')
    }
  }

  const onCopyPreviewLink = async (id: string) => {
    try {
      const { url } = await previewTokenMut.mutateAsync(id)
      const full = `${window.location.origin}${url}`
      await navigator.clipboard.writeText(full)
      toast.success('Preview link copied')
    } catch {
      toast.error('Could not create preview link')
    }
  }

  const onBulk = async (action: 'publish' | 'unpublish' | 'trash') => {
    try {
      const { count } = await bulkMut.mutateAsync({ ids: selectedIds, action })
      setSelection({})
      toast.success(`${count} page(s) updated`)
    } catch {
      toast.error('Bulk action failed')
    }
  }
  const [dialog, setDialog] = useState<{ open: boolean; mode: DialogMode }>({
    open: false,
    mode: { kind: 'create' },
  })

  const trashButton = (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5"
      onClick={() => {
        setTrashOpen(true)
        void trashedQuery.refetch()
      }}
    >
      <Trash2 className="size-4" />
      Trash{trashedItems.length ? ` (${trashedItems.length})` : ''}
    </Button>
  )

  const columns = useMemo<ColumnDef<PageSummaryDto, unknown>[]>(
    () => [
      {
        id: 'title',
        accessorFn: (r) => r.title,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        // Primary cell: title with the page path as muted secondary text beneath it.
        cell: ({ row }) => (
          <div className="flex flex-col leading-tight">
            <span className="font-medium">{row.original.title}</span>
            <span className="text-xs text-muted-foreground">/{row.original.path}</span>
          </div>
        ),
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={row.original.status === 'PUBLISHED' ? 'success' : 'secondary'}>
              {row.original.status === 'PUBLISHED' ? 'Published' : 'Draft'}
            </Badge>
            {row.original.hasDraft ? (
              <Badge variant="warning" title="Has unpublished draft edits">
                Draft edits
              </Badge>
            ) : null}
            {row.original.scheduledPublishAt || row.original.scheduledUnpublishAt ? (
              <Badge variant="outline" title="Scheduled">
                Scheduled
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: 'renderMode',
        accessorFn: (r) => r.renderMode,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Render" />,
        cell: ({ row }) => (
          <Badge variant="outline">
            {RENDER_MODE_LABEL[row.original.renderMode] ?? row.original.renderMode}
          </Badge>
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
        id: 'view',
        enableSorting: false,
        header: () => <span className="sr-only">View</span>,
        // Open the page on the frontend: live URL when published, else the
        // admin-only preview (drafts aren't reachable on the public route).
        cell: ({ row }) => {
          const r = row.original
          const published = r.status === 'PUBLISHED'
          const href = published ? `/${r.path}` : `/admin/pages/${r.id}/preview`
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              title={published ? 'Open the live page' : 'Preview this draft'}
            >
              <ExternalLink className="size-3.5" />
              {published ? 'View' : 'Preview'}
            </a>
          )
        },
      },
      {
        id: 'role',
        enableSorting: false,
        header: () => <span className="text-xs font-medium text-muted-foreground">Role</span>,
        cell: ({ row }) => <PageRoleBadges pageId={row.original.id} />,
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
                render={
                  <a
                    href={`/admin/pages/${row.original.id}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <SquarePen className="size-4" />
                Open builder
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onClick={() => setDialog({ open: true, mode: { kind: 'edit', row: row.original } })}
              >
                <Pencil className="size-4" />
                Edit settings
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onClick={() => void onDuplicate(row.original.id)}>
                <Copy className="size-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onClick={() => void onExport(row.original.id, row.original.title)}
              >
                <Download className="size-4" />
                Export JSON
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onClick={() => void onCopyPreviewLink(row.original.id)}
              >
                <Link2 className="size-4" />
                Copy preview link
              </DropdownMenuItem>
              <PageRoleMenu page={row.original} />
              <DropdownMenuItem
                variant="destructive"
                className="gap-2"
                onClick={() => {
                  void confirmDelete({ description: 'Delete this page?' }).then((confirmed) => {
                    if (confirmed) void deleteMut.mutateAsync(row.original.id)
                  })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirmDelete, deleteMut]
  )

  const trashColumns = useMemo<ColumnDef<PageSummaryDto, unknown>[]>(
    () => [
      {
        id: 'title',
        accessorFn: (r) => r.title,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        id: 'path',
        accessorFn: (r) => r.path,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Path" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">/{row.original.path}</span>
        ),
      },
    ],
    []
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pages"
        subtitle="Build landing & marketing pages with the visual builder"
        count={listQuery.isLoading ? undefined : rows.length}
        actions={
          <div className="flex items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onImportFile(file)
                e.target.value = ''
              }}
            />
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => importInputRef.current?.click()}
            >
              <Upload className="size-4" />
              Import
            </Button>
            <Button
              className="gap-2"
              onClick={() => setDialog({ open: true, mode: { kind: 'create' } })}
            >
              <Plus className="size-4" />
              New page
            </Button>
          </div>
        }
      />

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2 text-sm">
          <span className="font-medium">{selectedIds.length} selected</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void onBulk('publish')}>
              Publish
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onBulk('unpublish')}>
              Unpublish
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              onClick={() => void onBulk('trash')}
            >
              Move to trash
            </Button>
          </div>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        hideSyncColumn
        searchPlaceholder="Search by title or path…"
        toolbarActions={trashButton}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        emptyMessage={listQuery.isLoading ? 'Loading…' : 'No pages yet — create your first page.'}
      />

      <TrashModal
        open={trashOpen}
        onOpenChange={setTrashOpen}
        title="Trash — Pages"
        itemNoun="page"
        rows={trashedItems}
        columns={trashColumns}
        isLoading={trashedQuery.isLoading}
        getRowId={(r) => r.id}
        onRestore={async (id) => {
          await restoreMut.mutateAsync(id)
          await listQuery.refetch()
        }}
        onForceDelete={(id) => forceDeleteMut.mutateAsync(id)}
        emptyMessage="No deleted pages."
      />

      <PageFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
        mode={dialog.mode}
        onSubmit={async (values) => {
          if (dialog.mode.kind === 'edit') {
            await updateMut.mutateAsync({ id: dialog.mode.row.id, ...values })
          } else {
            const created = await createMut.mutateAsync(values)
            router.visit(`/admin/pages/${created.id}/edit`)
          }
        }}
      />
    </div>
  )
}

/**
 * Badges for the built-in screens this page currently stands in for (Front page,
 * Sign in, 404…). Reads the same `web_settings` pointers the resolver uses, so it
 * reflects assignments made here or in Settings → Appearance. A page can fill
 * more than one slot.
 */
function PageRoleBadges({ pageId }: { pageId: string }) {
  const { data } = useWebsiteSettings()
  const sections = data?.sections
  const roles = PAGE_ROLE_SLOTS.filter((slot) => sections?.[slot.section]?.[slot.key] === pageId)
  if (roles.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((slot) => (
        <Badge key={slot.key} variant="outline" className="text-xs font-normal">
          {slot.label}
        </Badge>
      ))}
    </div>
  )
}

/**
 * "Use as page →" row-action submenu: point a built-in screen (Front page, Sign
 * in, …, 500) at this page. Writes the same single-valued `web_settings` pointer
 * as Settings → Appearance, so assigning a slot to this page displaces whatever
 * page held it before. Only Published builder pages are eligible — a Draft or
 * CODE page would resolve to the built-in screen anyway.
 */
function PageRoleMenu({ page }: { page: PageSummaryDto }) {
  const { data } = useWebsiteSettings()
  const update = useUpdateWebsiteSettings()
  const sections = data?.sections
  const eligible = page.status === 'PUBLISHED' && page.kind === 'BUILDER'

  const setRole = (slot: (typeof PAGE_ROLE_SLOTS)[number], value: string) => {
    void update.mutateAsync({ patches: [{ section: slot.section, key: slot.key, value }] })
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2">
        <Layers className="size-4" />
        Use as page
      </DropdownMenuSubTrigger>
      {/* Capped height so a long list (core screens + a module's storefront
          slots) scrolls inside the submenu instead of running off-screen; still
          never taller than the space the popup actually has. */}
      <DropdownMenuSubContent className="max-h-[min(24rem,var(--available-height))] overflow-y-auto">
        {!eligible ? (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            Publish this builder page to assign a role
          </DropdownMenuItem>
        ) : (
          <>
            {PAGE_ROLE_SLOTS.map((slot) => {
              const current = sections?.[slot.section]?.[slot.key] === page.id
              return (
                <DropdownMenuItem
                  key={slot.key}
                  // The assigned slot is shown by a brand highlight (kept through
                  // hover) rather than a checkmark. Clicking it again resets the
                  // slot to its default screen.
                  className={cn(
                    current &&
                      'bg-primary/10 font-medium text-primary focus:bg-primary/15 focus:text-primary'
                  )}
                  onClick={() => setRole(slot, current ? '' : page.id)}
                >
                  {slot.label}
                </DropdownMenuItem>
              )
            })}
            {/* Enabled modules add their own overridable screens (e.g. the
                storefront's basket and checkout), stored in the module's own
                settings — discovered by shape, so core never names them. */}
            {modulePageRoles.map((Contribution, index) => (
              <Contribution key={index} page={page} />
            ))}
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

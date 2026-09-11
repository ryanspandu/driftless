import { useEffect, useMemo, useState } from 'react'
import { router } from '@inertiajs/react'
import { toast } from 'sonner'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import {
  Code2,
  Copy,
  Download,
  MoreHorizontal,
  Plus,
  SquarePen,
  Star,
  Trash2,
  Upload,
} from 'lucide-react'
import type { TemplateSummaryDto, TemplateType } from '~/types/api'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { TrashModal } from '~/components/trash-modal'
import { TemplateFormDialog } from '~/components/admin/template-form-dialog'
import { ImportJsonDialog } from '~/components/admin/import-json-dialog'
import {
  useTemplatesList,
  useCreateTemplate,
  useImportTemplate,
  useDeleteTemplate,
  useDuplicateTemplate,
  useSetDefaultTemplate,
  useTrashedTemplates,
  useRestoreTemplate,
  useForceDeleteTemplate,
} from '~/hooks/api/use-templates'
import { downloadJson, fileStem } from '~/lib/export-download'
import { formatAdminTableDateTime } from '~/lib/utils'
import { apiErrorMessage, apiGet } from '~/lib/api'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { usePathname, useRouter, useSearchParams } from '~/hooks/use-inertia-url'
import { mergeSearchParamsLive, replaceUrlIfChanged } from '~/lib/table-url-params'

const TYPE_LABEL: Record<TemplateType, string> = {
  HEADER: 'Header',
  FOOTER: 'Footer',
  COMPONENT: 'Component',
  LAYOUT: 'Layout',
  EMAIL: 'Email',
  COLLECTION: 'Collection',
}

const TEMPLATE_EXPORT_TYPE = 'driftless.template'

/** Fetch a template's export bundle and download it as JSON. */
async function exportTemplate(id: string, name: string): Promise<void> {
  try {
    const data = await apiGet<Record<string, unknown>>(`/api/admin/templates/${id}/export`)
    downloadJson(fileStem(name, 'template'), data)
  } catch (e) {
    toast.error(apiErrorMessage(e, 'Could not export'))
  }
}

type TabValue = 'all' | TemplateType

const TABS: { value: TabValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'HEADER', label: 'Headers' },
  { value: 'FOOTER', label: 'Footers' },
  { value: 'COMPONENT', label: 'Components' },
  { value: 'LAYOUT', label: 'Layouts' },
  { value: 'EMAIL', label: 'Emails' },
  { value: 'COLLECTION', label: 'Collections' },
]

function isTemplateType(value: string): value is TemplateType {
  return value in TYPE_LABEL
}

/** Where a kit code template lives, from its `codetpl:<kit>/…` id — for the hint. */
function codeTemplatePath(id: string): string {
  const m = id.match(/^codetpl:([^/]+)\/(.+)$/)
  if (!m) return id
  const [, kit, rest] = m
  if (rest.startsWith('collection/')) return `inertia/custom/kits/${kit}/${rest}.tsx`
  if (rest.startsWith('email/')) {
    return `inertia/custom/kits/${kit}/emails/${rest.slice('email/'.length)}.tsx`
  }
  return `inertia/custom/kits/${kit}/templates/${rest}.tsx`
}

/** The kit a code template belongs to, from its `codetpl:<kit>/…` id — or null
 *  for a visual-builder template (which has no kit). */
function templateKit(id: string): string | null {
  return id.match(/^codetpl:([^/]+)\//)?.[1] ?? null
}

// Read the active tab from `?tab=` so views are linkable. URLs stay lowercase
// (`?tab=header`); `all` is the default and omitted from the query string.
function parseTemplatesTab(sp: ReturnType<typeof useSearchParams>): TabValue {
  const t = (sp.get('tab') ?? '').toUpperCase()
  return isTemplateType(t) ? t : 'all'
}

/**
 * `?new=<TYPE>&collection=<key>` opens the create dialog pre-filled.
 *
 * The page builder's "Create template" button lands here from a CollectionList
 * that found no template for its collection; the operator should only have to
 * type a name. Anything unparseable means "no prefill".
 */
function parseNewTemplateLink(
  sp: ReturnType<typeof useSearchParams>
): { type: TemplateType; collectionKey?: string } | null {
  const t = (sp.get('new') ?? '').toUpperCase()
  if (!isTemplateType(t)) return null
  const collectionKey = sp.get('collection')?.trim() || undefined
  return { type: t, collectionKey }
}

export default function TemplatesPage() {
  const confirmDelete = useConfirmDelete()
  const urlRouter = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = useMemo(() => parseTemplatesTab(searchParams), [searchParams])
  const onTabChange = (value: TabValue) => {
    const merged = mergeSearchParamsLive(searchParams, {
      tab: value === 'all' ? undefined : value.toLowerCase(),
    })
    replaceUrlIfChanged(pathname, urlRouter, merged, { scroll: false })
  }
  // `includeCode` so kit code templates (codetpl:<kit>/…, no DB row) appear
  // read-only, the way file-pages show in the Pages list.
  const listQuery = useTemplatesList(tab === 'all' ? undefined : tab, true)
  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const createMut = useCreateTemplate()
  const importMut = useImportTemplate()
  const deleteMut = useDeleteTemplate()
  const duplicateMut = useDuplicateTemplate()
  const setDefaultMut = useSetDefaultTemplate()
  const [importOpen, setImportOpen] = useState(false)

  // Trash (soft-delete + restore), mirroring Content.
  const trashedQuery = useTrashedTemplates()
  const restoreMut = useRestoreTemplate()
  const forceDeleteMut = useForceDeleteTemplate()
  const trashedItems = useMemo(() => trashedQuery.data ?? [], [trashedQuery.data])
  const [trashOpen, setTrashOpen] = useState(false)

  // Bulk selection — templates have no publish state, so "move to trash" is the
  // only bulk action. Code templates (`source === 'code'`) can't be selected.
  const [selection, setSelection] = useState<RowSelectionState>({})
  const selectedIds = useMemo(
    () => Object.keys(selection).filter((k) => selection[k]),
    [selection]
  )
  const [bulkBusy, setBulkBusy] = useState(false)

  const onBulkDelete = async () => {
    const confirmed = await confirmDelete({
      title: `Move ${selectedIds.length} template${selectedIds.length === 1 ? '' : 's'} to trash?`,
      description: 'You can restore them from the trash later.',
      confirmLabel: 'Move to trash',
    })
    if (!confirmed) return
    setBulkBusy(true)
    try {
      for (const id of selectedIds) await deleteMut.mutateAsync(id)
      setSelection({})
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Failed to delete'))
    } finally {
      setBulkBusy(false)
    }
  }

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

  const trashColumns = useMemo<ColumnDef<TemplateSummaryDto, unknown>[]>(
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
          <span className="text-sm text-muted-foreground">
            {TYPE_LABEL[row.original.type] ?? row.original.type}
          </span>
        ),
      },
      {
        id: 'updated',
        accessorFn: (r) => r.updatedAt,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {row.original.updatedAt ? formatAdminTableDateTime(row.original.updatedAt) : '—'}
          </span>
        ),
      },
    ],
    []
  )
  // Deep link from the page builder (`?new=COLLECTION&collection=posts`): the
  // page mounts with the dialog already open and pre-filled. Read once, at
  // mount — the link always opens in a fresh tab.
  const [dialogInitial, setDialogInitial] = useState<{
    type: TemplateType
    collectionKey?: string
  } | null>(() => parseNewTemplateLink(searchParams))
  const [dialogOpen, setDialogOpen] = useState(() => dialogInitial !== null)

  // Then strip the params so a reload (or a Cancel) doesn't reopen it.
  useEffect(() => {
    if (!searchParams.has('new') && !searchParams.has('collection')) return
    const merged = mergeSearchParamsLive(searchParams, { new: undefined, collection: undefined })
    replaceUrlIfChanged(pathname, urlRouter, merged, { scroll: false })
  }, [searchParams, pathname, urlRouter])

  const columns = useMemo<ColumnDef<TemplateSummaryDto, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (r) => r.name,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        // Primary cell: template name with its type label as muted secondary text,
        // plus a "Code" badge marking a kit code template (managed in a .tsx file).
        cell: ({ row }) => (
          <div className="flex w-[360px] max-w-[360px] flex-col leading-tight">
            <span className="flex min-w-0 items-center gap-1.5 font-medium">
              <span className="truncate">{row.original.name}</span>
              {row.original.source === 'code' ? (
                <Badge
                  variant="info"
                  className="shrink-0 gap-1 whitespace-nowrap text-[10px] font-normal"
                  title={`Edit in code: ${codeTemplatePath(row.original.id)}`}
                >
                  <Code2 className="size-3" />
                  Custom code
                </Badge>
              ) : null}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {TYPE_LABEL[row.original.type] ?? row.original.type}
              {row.original.collectionKey ? ` · ${row.original.collectionKey}` : null}
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
        id: 'kit',
        accessorFn: (r) => templateKit(r.id) ?? '',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Template kit" />,
        // Which coded kit a code template comes from (its `codetpl:<kit>/…` id).
        // A visual-builder template has no kit, so it shows a dash.
        cell: ({ row }) => {
          const kit = templateKit(row.original.id)
          return kit ? (
            <Badge
              variant="outline"
              className="gap-1 whitespace-nowrap font-normal"
              title={`Custom template kit: inertia/custom/kits/${kit}`}
            >
              <Code2 className="size-3" />
              {kit}
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )
        },
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
            {row.original.updatedAt ? formatAdminTableDateTime(row.original.updatedAt) : '—'}
          </div>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          // A code template has no DB row — it is managed in its .tsx file, so
          // every DB-backed action (builder, default, duplicate, delete) is
          // omitted; only a disabled hint pointing at the file remains.
          if (row.original.source === 'code') {
            return (
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
                    disabled
                    title={codeTemplatePath(row.original.id)}
                  >
                    <Code2 className="size-4" />
                    Managed in code
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )
          }
          return (
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
                      href={`/admin/templates/${row.original.id}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <SquarePen className="size-4" />
                  Open builder
                </DropdownMenuItem>
                {/* Only HEADER/FOOTER/LAYOUT/EMAIL have something that consumes a
                  site default; COLLECTION/COMPONENT are picked by reference. */}
                {['HEADER', 'FOOTER', 'LAYOUT', 'EMAIL'].includes(row.original.type) ? (
                  <DropdownMenuItem
                    className="gap-2"
                    disabled={row.original.isDefault}
                    onClick={() =>
                      void setDefaultMut
                        .mutateAsync(row.original.id)
                        .then(() => toast.success('Set as default'))
                        .catch((e) => toast.error(apiErrorMessage(e, 'Failed to set default')))
                    }
                  >
                    <Star className="size-4" />
                    Set default
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() =>
                    void duplicateMut
                      .mutateAsync(row.original.id)
                      .then(() => toast.success('Template duplicated'))
                      .catch((e) => toast.error(apiErrorMessage(e, 'Failed to duplicate')))
                  }
                >
                  <Copy className="size-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => void exportTemplate(row.original.id, row.original.name)}
                >
                  <Download className="size-4" />
                  Export JSON
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
          )
        },
      },
    ],
    [confirmDelete, deleteMut, duplicateMut, setDefaultMut]
  )

  // Type filter (All / Headers / Footers / Components / Layouts) lives in the
  // table toolbar as a compact segmented control. Filtering is server-side, so
  // only the active tab's row count is known — per-segment counts are omitted.
  const typeFilter = (
    <Tabs value={tab} onValueChange={(value) => onTabChange(value as TabValue)}>
      <TabsList>
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        subtitle="Reusable headers, footers, layouts & components for your pages"
        count={listQuery.isLoading ? undefined : rows.length}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" />
              Import
            </Button>
            <Button
              className="gap-2"
              onClick={() => {
                setDialogInitial(null)
                setDialogOpen(true)
              }}
            >
              <Plus className="size-4" />
              New template
            </Button>
          </div>
        }
      />

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2 text-sm">
          <span className="font-medium">{selectedIds.length} selected</span>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            disabled={bulkBusy}
            onClick={() => void onBulkDelete()}
          >
            Move to trash
          </Button>
        </div>
      ) : null}

      <DataTable
        key={tab}
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        getRowCanSelect={(r) => r.source !== 'code'}
        hideSyncColumn
        searchPlaceholder="Search by name…"
        filters={typeFilter}
        toolbarActions={trashButton}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        urlSync={{}}
        emptyMessage={
          listQuery.isLoading ? 'Loading…' : 'No templates yet — create your first template.'
        }
      />

      <TrashModal
        open={trashOpen}
        onOpenChange={setTrashOpen}
        title="Trash — Templates"
        itemNoun="template"
        rows={trashedItems}
        columns={trashColumns}
        isLoading={trashedQuery.isLoading}
        getRowId={(r) => r.id}
        onRestore={(id) => restoreMut.mutateAsync(id).then(() => undefined)}
        onForceDelete={(id) => forceDeleteMut.mutateAsync(id)}
        emptyMessage="No deleted templates."
      />

      <TemplateFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={dialogInitial}
        onSubmit={async (values) => {
          const created = await createMut.mutateAsync(values)
          router.visit(`/admin/templates/${created.id}/edit`)
        }}
      />

      <ImportJsonDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import template"
        description="Creates a new, non-default template from a JSON export."
        expectedType={TEMPLATE_EXPORT_TYPE}
        expectedLabel="template"
        successMessage="Template imported"
        onImport={async (parsed) => {
          await importMut.mutateAsync(parsed)
        }}
      />
    </div>
  )
}

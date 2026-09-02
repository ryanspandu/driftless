import { useEffect, useMemo, useState } from 'react'
import { router } from '@inertiajs/react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, MoreHorizontal, Plus, SquarePen, Star, Trash2 } from 'lucide-react'
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
  const listQuery = useTemplatesList(tab === 'all' ? undefined : tab)
  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const createMut = useCreateTemplate()
  const deleteMut = useDeleteTemplate()
  const duplicateMut = useDuplicateTemplate()
  const setDefaultMut = useSetDefaultTemplate()
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
        // Primary cell: template name with its type label as muted secondary text.
        cell: ({ row }) => (
          <div className="flex flex-col leading-tight">
            <span className="font-medium">{row.original.name}</span>
            <span className="text-xs text-muted-foreground">
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
              {/* A collection template is picked per CollectionList — there is
                  no site-wide slot for a default to fill. */}
              {row.original.type !== 'COLLECTION' ? (
                <DropdownMenuItem
                  className="gap-2"
                  disabled={row.original.isDefault}
                  onClick={() => void setDefaultMut.mutateAsync(row.original.id)}
                >
                  <Star className="size-4" />
                  Set default
                </DropdownMenuItem>
              ) : null}
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
        initial={dialogInitial}
        onSubmit={async (values) => {
          const created = await createMut.mutateAsync(values)
          router.visit(`/admin/templates/${created.id}/edit`)
        }}
      />
    </div>
  )
}

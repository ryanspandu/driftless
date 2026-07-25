import { Link } from '@inertiajs/react'
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { List, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { CmsCollectionDto } from '~/types/api'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { PageHeader } from '~/components/admin/page-header'
import { DataTableColumnHeader } from '~/components/data-table'
import { TrashModal } from '~/components/trash-modal'
import {
  useCmsCollectionsList,
  useDeleteCmsCollection,
  useForceDeleteCmsCollection,
  useRestoreCmsCollection,
  useTrashedCmsCollections,
} from '~/hooks/api/use-cms-collections'
import { formatAdminTableDateTime } from '~/lib/utils'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { cmsRecordListPath } from '~/components/cms/cms-record-actions'
import {
  isCustomCollectionIcon,
  resolveCollectionLucideIcon,
} from '~/components/cms/collection-icon-lucide'
import { useAbility } from '~/components/providers/ability-provider'

type CollectionPermissions = ReturnType<typeof useAbility>['permissions']

/** Strapi-style collection card: icon tile + name + meta + actions menu. */
function CollectionCard({
  collection,
  permissions,
  onDelete,
}: {
  collection: CmsCollectionDto
  permissions: CollectionPermissions
  onDelete: (key: string) => void
}) {
  const key = collection.key
  const isNative = collection.source === 'PRISMA'
  const canReadRecords = permissions.canCms('read', key)
  const canManageSchema = permissions.canManageCms()
  const canDeleteCollection = permissions.canManageCms()
  const hasActions = canReadRecords || canManageSchema || canDeleteCollection

  const primaryHref = canManageSchema
    ? `/admin/cms/collections/${encodeURIComponent(key)}`
    : canReadRecords
      ? cmsRecordListPath(key)
      : null

  const iconValue = collection.icon ?? 'LayoutList'
  const isCustomImage = isCustomCollectionIcon(iconValue)
  const LucideIcon = resolveCollectionLucideIcon(iconValue)

  const iconTile = (
    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/50 text-foreground/80">
      {isCustomImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL / remote icon
        <img src={iconValue} alt="" className="size-full object-cover" />
      ) : (
        <LucideIcon className="size-5" aria-hidden />
      )}
    </span>
  )

  const heading = (
    <span className="flex items-start gap-3">
      {iconTile}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-tight text-foreground">
          {collection.label}
        </span>
        <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
          {collection.key}
        </span>
      </span>
    </span>
  )

  return (
    <div className="group relative flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/50 hover:shadow-md">
      {hasActions ? (
        <div className="absolute right-2.5 top-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                />
              }
              aria-label="Collection actions"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canReadRecords ? (
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  render={<Link href={cmsRecordListPath(key)} />}
                >
                  <List className="size-4" />
                  Records
                </DropdownMenuItem>
              ) : null}
              {canManageSchema ? (
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  render={
                    <Link
                      href={`/admin/cms/collections/${encodeURIComponent(key)}`}
                    />
                  }
                >
                  <Pencil className="size-4" />
                  Edit schema
                </DropdownMenuItem>
              ) : null}
              {canDeleteCollection ? (
                <DropdownMenuItem
                  variant="destructive"
                  className="gap-2 cursor-pointer"
                  onClick={() => onDelete(key)}
                >
                  <Trash2 className="size-4" />
                  Delete collection
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      {primaryHref ? (
        <Link
          href={primaryHref}
          className="rounded-md pr-8 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {heading}
        </Link>
      ) : (
        <div className="pr-8">{heading}</div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <Badge variant={isNative ? 'secondary' : 'default'} className="text-[11px]">
          {isNative ? 'Native' : 'Dynamic'}
        </Badge>
        {collection.kind === 'single' ? (
          <Badge variant="outline" className="text-[11px]">
            Single
          </Badge>
        ) : null}
        <span>
          {collection.fields.length} field{collection.fields.length === 1 ? '' : 's'}
        </span>
        {collection.group ? (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{collection.group}</span>
          </>
        ) : null}
        <span className="ml-auto tabular-nums">
          {formatAdminTableDateTime(collection.updatedAt)}
        </span>
      </div>
    </div>
  )
}

export default function CmsCollectionsPage() {
  const confirmDelete = useConfirmDelete()
  const { permissions } = useAbility()
  const query = useCmsCollectionsList()
  const deleteMut = useDeleteCmsCollection()

  const trashedQuery = useTrashedCmsCollections()
  const restoreMut = useRestoreCmsCollection()
  const forceMut = useForceDeleteCmsCollection()
  const trashedItems = useMemo(() => trashedQuery.data ?? [], [trashedQuery.data])
  const [trashOpen, setTrashOpen] = useState(false)
  const [search, setSearch] = useState('')

  const handleDelete = (key: string) => {
    void confirmDelete({
      title: 'Delete collection',
      description: `Drop collection "${key}" and its data? This cannot be undone.`,
    }).then((confirmed) => {
      if (confirmed) deleteMut.mutate(key)
    })
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

  const trashColumns = useMemo<ColumnDef<CmsCollectionDto, unknown>[]>(
    () => [
      {
        id: 'label',
        accessorFn: (c) => c.label,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Collection" />,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.label}</div>
            <div className="text-xs text-muted-foreground">{row.original.key}</div>
          </div>
        ),
      },
      {
        id: 'group',
        accessorFn: (c) => c.group ?? '',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Group" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.group ?? '—'}</span>
        ),
      },
      {
        id: 'fields',
        accessorFn: (c) => c.fields.length,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Fields" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.fields.length}</span>
        ),
      },
    ],
    []
  )

  const items: CmsCollectionDto[] = useMemo(() => query.data ?? [], [query.data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.key.toLowerCase().includes(q) ||
        (c.group ?? '').toLowerCase().includes(q)
    )
  }, [items, search])

  /** Stable group order: named groups alphabetically, ungrouped last. */
  const grouped = useMemo(() => {
    const map = new Map<string, CmsCollectionDto[]>()
    for (const c of filtered) {
      const g = c.group?.trim() || 'Other'
      const list = map.get(g) ?? []
      list.push(c)
      map.set(g, list)
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'Other') return 1
      if (b === 'Other') return -1
      return a.localeCompare(b)
    })
  }, [filtered])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collections"
        subtitle={
          <>
            Define and manage CMS content types
            {query.isFetching ? ' · refreshing…' : ''}
            {query.error ? (
              <span className="ml-2 text-destructive">· {(query.error as Error).message}</span>
            ) : null}
          </>
        }
        count={query.isLoading ? undefined : items.length}
        actions={
          <div className="flex items-center gap-2">
            {trashButton}
            <Button className="gap-2" render={<Link href="/admin/cms/collections/new" />}>
              <Plus className="size-4" />
              New collection
            </Button>
          </div>
        }
      />

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search collections…"
          className="h-9 pl-9"
          autoComplete="off"
        />
      </div>

      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[104px] animate-pulse rounded-xl border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {search.trim()
              ? `No collections match “${search.trim()}”.`
              : 'No collections yet. Create your first one.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([group, collections]) => (
            <section key={group} className="space-y-3">
              {grouped.length > 1 ? (
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </h2>
              ) : null}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {collections.map((collection) => (
                  <CollectionCard
                    key={collection.id}
                    collection={collection}
                    permissions={permissions}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <TrashModal
        open={trashOpen}
        onOpenChange={setTrashOpen}
        title="Trash — Collections"
        itemNoun="collection"
        rows={trashedItems}
        columns={trashColumns}
        isLoading={trashedQuery.isLoading}
        getRowId={(r) => r.id}
        onRestore={async (id) => {
          await restoreMut.mutateAsync(id)
        }}
        onForceDelete={(id) => forceMut.mutateAsync(id)}
        emptyMessage="No deleted collections."
      />
    </div>
  )
}

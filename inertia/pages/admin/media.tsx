import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from '~/hooks/use-inertia-url'
import { FileText, ImageOff, Loader2, Search, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import type { MediaDto } from '~/types/api'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { PageHeader } from '~/components/admin/page-header'
import { DataTableColumnHeader } from '~/components/data-table'
import { DataTablePagination } from '~/components/data-table-pagination'
import { TrashModal } from '~/components/trash-modal'
import { DragDropImageUpload } from '~/components/drag-drop-image-upload'
import { MediaDetailDialog } from '~/components/admin/media-detail-dialog'
import { DateRangePicker } from '~/components/admin/date-range-picker'
import {
  formatBytes,
  mediaSrc,
  useDeleteMedia,
  useForceDeleteMedia,
  useMediaList,
  useRestoreMedia,
  useTrashedMedia,
  useUploadMedia,
} from '~/hooks/api/use-media'
import { mergeSearchParamsLive, replaceUrlIfChanged } from '~/lib/table-url-params'
import { cn, formatAdminTableDateTime } from '~/lib/utils'
import { useAbility } from '~/components/providers/ability-provider'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'

const PAGE_SIZE_OPTIONS = [20, 40, 60, 100]
const DEFAULT_PAGE_SIZE = 40

function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

function extLabel(item: MediaDto): string {
  const m = /\.([a-z0-9]+)$/i.exec(item.filename)
  if (m) return m[1].toUpperCase()
  return item.mimeType.split('/')[1]?.toUpperCase() ?? 'FILE'
}

export default function MediaPage() {
  const { permissions } = useAbility()
  const confirmDelete = useConfirmDelete()
  const canWrite = permissions.has('media:manage') || permissions.has('*')
  const canDelete = permissions.has('media:manage') || permissions.has('*')

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const parsed = useMemo(() => {
    const pageRaw = Number.parseInt(searchParams.get('page') ?? '1', 10)
    const sizeRaw = Number.parseInt(searchParams.get('size') ?? String(DEFAULT_PAGE_SIZE), 10)
    return {
      q: searchParams.get('q') ?? '',
      from: searchParams.get('from') ?? '',
      to: searchParams.get('to') ?? '',
      page: Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1,
      size: PAGE_SIZE_OPTIONS.includes(sizeRaw) ? sizeRaw : DEFAULT_PAGE_SIZE,
    }
  }, [searchParams])

  const patchUrl = useCallback(
    (patch: Record<string, string | undefined>) => {
      const merged = mergeSearchParamsLive(searchParams, patch)
      replaceUrlIfChanged(pathname, router, merged, { scroll: false })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mergeSearchParamsLive reads window.location on the client
    [pathname, router]
  )

  // Debounced search: type freely, write to the URL after a pause.
  const [searchInput, setSearchInput] = useState(parsed.q)
  useLayoutEffect(() => {
    setSearchInput(parsed.q)
  }, [parsed.q])
  useEffect(() => {
    if (searchInput === parsed.q) return
    const id = window.setTimeout(() => {
      patchUrl({ q: searchInput.trim() || undefined, page: undefined })
    }, 300)
    return () => window.clearTimeout(id)
  }, [searchInput, parsed.q, patchUrl])

  const listQuery = useMediaList({
    page: parsed.page,
    pageSize: parsed.size,
    search: parsed.q,
    dateFrom: parsed.from,
    dateTo: parsed.to,
  })
  const uploadMut = useUploadMedia()
  const deleteMut = useDeleteMedia()
  const [uploadError, setUploadError] = useState<string | null>(null)

  const trashedQuery = useTrashedMedia()
  const restoreMut = useRestoreMedia()
  const forceMut = useForceDeleteMedia()
  const trashedItems = useMemo(() => trashedQuery.data ?? [], [trashedQuery.data])
  const [trashOpen, setTrashOpen] = useState(false)

  const [detail, setDetail] = useState<MediaDto | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const items = useMemo(() => listQuery.data?.items ?? [], [listQuery.data])
  const total = listQuery.data?.total ?? 0
  const totalPages = listQuery.data?.totalPages ?? 1
  const hasFilters = Boolean(parsed.q || parsed.from || parsed.to)

  // Reflect fresh data (new updatedAt/dimensions after an edit) into the open
  // dialog by re-resolving the selected item from the latest list.
  const liveDetail = useMemo(
    () => (detail ? (items.find((m) => m.id === detail.id) ?? detail) : null),
    [items, detail]
  )

  const openDetail = useCallback((item: MediaDto) => {
    setDetail(item)
    setDetailOpen(true)
  }, [])

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

  const trashColumns = useMemo<ColumnDef<MediaDto, unknown>[]>(
    () => [
      {
        id: 'filename',
        accessorFn: (m) => m.filename,
        header: ({ column }) => <DataTableColumnHeader column={column} title="File" />,
        cell: ({ row }) => <span className="font-medium">{row.original.filename}</span>,
      },
      {
        id: 'mimeType',
        accessorFn: (m) => m.mimeType,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.mimeType}</span>
        ),
      },
      {
        id: 'size',
        accessorFn: (m) => m.size,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Size" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatBytes(row.original.size)}
          </span>
        ),
      },
      {
        id: 'created',
        accessorFn: (m) => m.createdAt,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatAdminTableDateTime(row.original.createdAt)}
          </span>
        ),
      },
    ],
    []
  )

  const onUpload = useCallback(
    async (file: File) => {
      setUploadError(null)
      try {
        await uploadMut.mutateAsync(file)
        toast.success(`Uploaded ${file.name}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Upload failed'
        setUploadError(msg)
        toast.error(msg)
      }
    },
    [uploadMut]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Media"
        subtitle="Manage images, documents, and other assets"
        count={listQuery.isLoading ? undefined : total}
        actions={trashButton}
      />

      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>Upload</CardTitle>
            <CardDescription>Drag and drop or click to add files to the library</CardDescription>
          </CardHeader>
          <CardContent>
            <DragDropImageUpload
              onFile={onUpload}
              accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf,.doc,.docx"
              disabled={uploadMut.isPending}
              hint="Images, PDF, or Word documents up to 10 MB."
            />
            {uploadError ? <p className="mt-2 text-sm text-destructive">{uploadError}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="relative flex-1 sm:min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or alt text…"
            className="pl-9"
          />
        </div>
        <div className="flex items-end gap-2">
          <DateRangePicker
            value={{ from: parsed.from, to: parsed.to }}
            onChange={(next) =>
              patchUrl({ from: next.from || undefined, to: next.to || undefined, page: undefined })
            }
          />
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => {
                setSearchInput('')
                patchUrl({ q: undefined, from: undefined, to: undefined, page: undefined })
              }}
            >
              <X className="size-4" />
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {/* Grid */}
      {listQuery.error ? (
        <p className="text-sm text-destructive">{(listQuery.error as Error).message}</p>
      ) : listQuery.isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ImageOff className="size-6" />
          </div>
          <p className="text-sm font-medium text-foreground">
            {hasFilters ? 'No files match your filters' : 'No files yet'}
          </p>
          <p className="text-xs text-muted-foreground">
            {hasFilters
              ? 'Try a different search or date range.'
              : 'Upload your first asset above.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <div key={item.id} className="group relative">
                <button
                  type="button"
                  onClick={() => openDetail(item)}
                  className={cn(
                    'block w-full overflow-hidden rounded-xl border bg-card text-left',
                    'transition-all hover:-translate-y-0.5 hover:border-ring/40 hover:shadow-md',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  )}
                  aria-label={`Open ${item.filename}`}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted/40">
                    {isImageMime(item.mimeType) ? (
                      <img
                        src={mediaSrc(item.url, item.updatedAt)}
                        alt={item.alt ?? item.filename}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                        <FileText className="size-10" />
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-foreground backdrop-blur-sm">
                      {extLabel(item)}
                    </span>
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div className="space-y-0.5 p-2.5">
                    <p className="truncate text-xs font-medium" title={item.title ?? item.filename}>
                      {item.title?.trim() || item.filename}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {formatBytes(item.size)} · {formatAdminTableDateTime(item.createdAt)}
                    </p>
                  </div>
                </button>
                {canDelete ? (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute right-2 top-2 z-10 size-8 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    disabled={deleteMut.isPending}
                    aria-label={`Delete ${item.filename}`}
                    onClick={() => {
                      void confirmDelete({
                        description: `Delete "${item.filename}"?`,
                      }).then((confirmed) => {
                        if (!confirmed) return
                        deleteMut.mutate(item.id, {
                          onSuccess: () => toast.success('File deleted'),
                          onError: (e) => toast.error((e as Error).message),
                        })
                      })
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

          <DataTablePagination
            pageIndex={parsed.page - 1}
            pageSize={parsed.size}
            totalRows={total}
            pageCount={totalPages}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            disabled={listQuery.isFetching}
            onPageIndexChange={(idx) => patchUrl({ page: idx <= 0 ? undefined : String(idx + 1) })}
            onPageSizeChange={(size) =>
              patchUrl({
                size: size === DEFAULT_PAGE_SIZE ? undefined : String(size),
                page: undefined,
              })
            }
          />
        </>
      )}

      <MediaDetailDialog
        item={liveDetail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        canWrite={canWrite}
      />

      <TrashModal
        open={trashOpen}
        onOpenChange={setTrashOpen}
        title="Trash — Media"
        itemNoun="file"
        rows={trashedItems}
        columns={trashColumns}
        isLoading={trashedQuery.isLoading}
        getRowId={(r) => r.id}
        onRestore={async (id) => {
          await restoreMut.mutateAsync(id)
        }}
        onForceDelete={(id) => forceMut.mutateAsync(id)}
        emptyMessage="No deleted files."
      />
    </div>
  )
}

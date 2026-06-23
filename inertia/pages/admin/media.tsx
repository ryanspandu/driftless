import { useCallback, useMemo, useState } from 'react'
import { FileText, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import type { MediaDto } from '~/types/api'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { PageHeader } from '~/components/admin/page-header'
import { DataTableColumnHeader } from '~/components/data-table'
import { TrashModal } from '~/components/trash-modal'
import { DragDropImageUpload } from '~/components/drag-drop-image-upload'
import {
  formatBytes,
  useDeleteMedia,
  useForceDeleteMedia,
  useMediaList,
  useRestoreMedia,
  useTrashedMedia,
  useUploadMedia,
} from '~/hooks/api/use-media'
import { formatAdminTableDateTime } from '~/lib/utils'
import { useAbility } from '~/components/providers/ability-provider'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'

function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

export default function MediaPage() {
  const { permissions } = useAbility()
  const confirmDelete = useConfirmDelete()
  const canWrite = permissions.has('media:manage') || permissions.has('*')
  const canDelete = permissions.has('media:manage') || permissions.has('*')

  const listQuery = useMediaList()
  const uploadMut = useUploadMedia()
  const deleteMut = useDeleteMedia()
  const [uploadError, setUploadError] = useState<string | null>(null)

  const trashedQuery = useTrashedMedia()
  const restoreMut = useRestoreMedia()
  const forceMut = useForceDeleteMedia()
  const trashedItems = useMemo(() => trashedQuery.data ?? [], [trashedQuery.data])
  const [trashOpen, setTrashOpen] = useState(false)

  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0

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

      {listQuery.error ? (
        <p className="text-sm text-destructive">{(listQuery.error as Error).message}</p>
      ) : listQuery.isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No files yet. Upload your first asset above.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="group relative flex aspect-square flex-col overflow-hidden rounded-lg border bg-muted/50"
            >
              {isImageMime(item.mimeType) ? (
                <img src={item.url} alt={item.filename} className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center p-4">
                  <FileText className="size-10 text-muted-foreground/60" />
                </div>
              )}
              <div className="border-t bg-background/95 p-2">
                <p className="truncate text-xs font-medium" title={item.filename}>
                  {item.filename}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatBytes(item.size)} · {formatAdminTableDateTime(item.createdAt)}
                </p>
              </div>
              {canDelete ? (
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute right-2 top-2 size-8 opacity-0 transition-opacity group-hover:opacity-100"
                  disabled={deleteMut.isPending}
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
      )}

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

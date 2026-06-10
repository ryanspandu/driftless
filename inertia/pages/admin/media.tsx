
import { useCallback, useState } from 'react'
import { FileText, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { DragDropImageUpload } from '~/components/drag-drop-image-upload'
import {
  formatBytes,
  useDeleteMedia,
  useMediaList,
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
  const canWrite = permissions.has('cms:media:create') || permissions.has('*')
  const canDelete = permissions.has('cms:media:delete') || permissions.has('*')

  const listQuery = useMediaList()
  const uploadMut = useUploadMedia()
  const deleteMut = useDeleteMedia()
  const [uploadError, setUploadError] = useState<string | null>(null)

  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Media</h1>
          <p className="text-sm text-muted-foreground">
            Manage images, documents, and other assets
          </p>
        </div>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>Media library</CardTitle>
          <CardDescription>
            {listQuery.isLoading
              ? 'Loading…'
              : `${total} file${total === 1 ? '' : 's'} in the library`}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                    <img
                      src={item.url}
                      alt={item.filename}
                      className="h-full w-full object-cover"
                    />
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
        </CardContent>
      </Card>
    </div>
  )
}

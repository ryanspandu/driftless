import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { DragDropImageUpload } from '~/components/drag-drop-image-upload'
import { mediaSrc, useMediaList, useUploadMedia } from '~/hooks/api/use-media'

/**
 * Lightweight "insert image" picker for the article editor: paste a URL, or
 * click an image from the media library. Reuses the media list endpoint.
 */
export function MediaImagePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (url: string) => void
}) {
  const [url, setUrl] = useState('')
  const { data, isLoading } = useMediaList({ pageSize: 24 })
  const uploadMut = useUploadMedia()
  const images = (data?.items ?? []).filter((m) => m.mimeType.startsWith('image/'))

  function pick(u: string) {
    const trimmed = u.trim()
    if (!trimmed) return
    onPick(trimmed)
    onOpenChange(false)
    setUrl('')
  }

  // Upload straight into the media library, then insert the saved file.
  async function onUpload(file: File) {
    try {
      const media = await uploadMut.mutateAsync(file)
      toast.success(`Uploaded ${file.name}`)
      pick(media.url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Insert image</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <DragDropImageUpload
            onFile={onUpload}
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
            disabled={uploadMut.isPending}
            minHeightClassName="min-h-[110px]"
            hint="PNG, JPG, GIF, WebP, or SVG up to 10 MB — added to your media library."
          />

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or paste a URL
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste an image URL…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  pick(url)
                }
              }}
            />
            <Button type="button" onClick={() => pick(url)} disabled={!url.trim()}>
              Insert
            </Button>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">From media library</p>
            {isLoading ? (
              <div className="flex justify-center py-8 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : images.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No images in the library yet.
              </p>
            ) : (
              <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                {images.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pick(m.url)}
                    className="group relative aspect-square overflow-hidden rounded-md border bg-muted/40 transition-all hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={m.title ?? m.filename}
                  >
                    <img
                      src={mediaSrc(m.url, m.updatedAt)}
                      alt={m.alt ?? m.filename}
                      loading="lazy"
                      className="size-full object-cover transition-transform group-hover:scale-105"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

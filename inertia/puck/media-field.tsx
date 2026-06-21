import { useMemo, useState } from 'react'
import { ImageIcon, Loader2 } from 'lucide-react'
import type { MediaDto } from '~/types/api'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { useMediaList } from '~/hooks/api/use-media'
import { cn } from '~/lib/utils'

/**
 * Reusable media picker used as a Puck custom field. Shows a thumbnail preview
 * when a URL is set, otherwise a "Choose image" trigger. The picker dialog lists
 * images from the media library (`GET /api/admin/media` via `useMediaList`) and
 * also accepts a pasted URL as a fallback. SSR-safe: all fetching happens inside
 * the query hook, with no top-level `window`/`document` access.
 */

function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

function MediaPickerDialog({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value?: string
  onChange: (url: string) => void
}) {
  const listQuery = useMediaList(1, 60)
  const images = useMemo(
    () => (listQuery.data?.items ?? []).filter((m) => isImageMime(m.mimeType)),
    [listQuery.data]
  )

  function select(item: MediaDto) {
    onChange(item.url)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose image</DialogTitle>
          <DialogDescription>
            Pick from the media library or paste an image URL below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            type="url"
            placeholder="https://example.com/image.jpg"
            defaultValue={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />

          {listQuery.error ? (
            <p className="py-8 text-center text-sm text-destructive">
              {(listQuery.error as Error).message}
            </p>
          ) : listQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : images.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No images in the library yet.
            </p>
          ) : (
            <div className="grid max-h-96 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
              {images.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => select(item)}
                  className={cn(
                    'group relative aspect-square overflow-hidden rounded-lg border bg-muted/50 transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    value === item.url && 'border-ring ring-2 ring-ring/50'
                  )}
                  title={item.filename}
                >
                  <img
                    src={item.url}
                    alt={item.filename}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function MediaField({
  value,
  onChange,
}: {
  value?: string
  onChange: (url: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      {value ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border bg-muted/50">
            <img
              src={value}
              alt="Selected media"
              className="h-32 w-full object-cover"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
              Replace
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange('')}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <ImageIcon className="size-4" />
          Choose image
        </Button>
      )}

      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        value={value}
        onChange={onChange}
      />
    </div>
  )
}

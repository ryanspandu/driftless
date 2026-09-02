import { useMemo, useRef, useState, type DragEvent } from 'react'
import { ImageIcon, Loader2, UploadCloud } from 'lucide-react'
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
import { useMediaList, useUploadMedia } from '~/hooks/api/use-media'
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

/**
 * Exported because the Backgrounds panel needs the *record*, not just its URL:
 * an image layer shows the filename, pixel dimensions and file size, and `@2x`
 * cannot be computed without the intrinsic width. `onPick` fires only for a
 * library choice — a pasted URL carries no metadata to report.
 */
export function MediaPickerDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value?: string
  onChange: (url: string) => void
  onPick?: (item: MediaDto) => void
}) {
  const listQuery = useMediaList({ page: 1, pageSize: 60 })
  const upload = useUploadMedia()
  const fileInput = useRef<HTMLInputElement>(null)
  /**
   * A counter, not a boolean. `dragleave` fires when the pointer crosses into a
   * *child* element, so a boolean flag flickers off the moment the cursor moves
   * over the grid inside the drop area. Counting enter/leave pairs is what makes
   * the highlight hold steady across the whole dialog.
   */
  const [dragDepth, setDragDepth] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadedCount, setUploadedCount] = useState(0)

  const images = useMemo(
    () => (listQuery.data?.items ?? []).filter((m) => isImageMime(m.mimeType)),
    [listQuery.data]
  )

  function select(item: MediaDto) {
    onChange(item.url)
    onPick?.(item)
    onOpenChange(false)
  }

  /**
   * Upload, then get out of the way.
   *
   * One file is the overwhelmingly common case and the intent is unambiguous —
   * take it and close. Several files is a library-filling gesture rather than a
   * pick, so the dialog stays open with the grid refreshed and nothing chosen
   * on the author's behalf.
   */
  async function uploadFiles(files: File[]) {
    const accepted = files.filter((f) => isImageMime(f.type))
    if (accepted.length === 0) {
      setUploadError('Only image files can be used here.')
      return
    }

    setUploadError(null)
    setUploadedCount(0)

    const done: MediaDto[] = []
    for (const file of accepted) {
      try {
        done.push(await upload.mutateAsync(file))
        setUploadedCount(done.length)
      } catch (error) {
        setUploadError((error as Error).message || `Could not upload ${file.name}`)
        break
      }
    }

    if (done.length === 1 && accepted.length === 1) select(done[0]!)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragDepth(0)
    void uploadFiles([...e.dataTransfer.files])
  }

  const dragging = dragDepth > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose image</DialogTitle>
          <DialogDescription>
            Drop a file to add it to the media library, pick one already there, or paste a URL.
          </DialogDescription>
        </DialogHeader>

        {/*
          The drop target is the whole dialog, not just the dashed box. Aiming
          for a small rectangle while holding a dragged file is needless
          precision when there is nothing else here a file could mean.
        */}
        <div
          className="space-y-4"
          onDragEnter={(e) => {
            e.preventDefault()
            setDragDepth((d) => d + 1)
          }}
          onDragLeave={() => setDragDepth((d) => Math.max(0, d - 1))}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={upload.isPending}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
              dragging
                ? 'border-ring bg-accent/40'
                : 'border-border hover:border-ring hover:bg-accent/20',
              upload.isPending && 'pointer-events-none opacity-70'
            )}
          >
            {upload.isPending ? (
              <>
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                <span className="text-sm">
                  Uploading{uploadedCount > 0 ? ` — ${uploadedCount} done` : '…'}
                </span>
              </>
            ) : (
              <>
                <UploadCloud
                  className={cn('size-5', dragging ? 'text-foreground' : 'text-muted-foreground')}
                />
                <span className="text-sm font-medium">
                  {dragging ? 'Drop to upload' : 'Drag & drop an image here'}
                </span>
                <span className="text-xs text-muted-foreground">
                  or click to browse — JPG, PNG, WebP, GIF or SVG, up to 10 MB
                </span>
              </>
            )}
          </button>

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void uploadFiles([...(e.target.files ?? [])])
              // Cleared so re-picking the same file fires `change` again.
              e.target.value = ''
            }}
          />

          {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
          {!upload.isPending && uploadedCount > 1 ? (
            <p className="text-sm text-muted-foreground">
              {uploadedCount} images added to the library — pick one below.
            </p>
          ) : null}

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
                  <img src={item.url} alt={item.filename} className="h-full w-full object-cover" />
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
  onPick,
}: {
  value?: string
  onChange: (url: string) => void
  /** Fires with the full media record (incl. responsive variants) on library pick. */
  onPick?: (item: MediaDto) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      {value ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border bg-muted/50">
            <img src={value} alt="Selected media" className="h-32 w-full object-cover" />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
              Replace
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange('')}>
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
        onPick={onPick}
      />
    </div>
  )
}

import { useMemo, useRef, useState, type DragEvent } from 'react'
import { File as FileIcon, ImageIcon, Loader2, Play, UploadCloud } from 'lucide-react'
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
import { useMedia, useMediaList, useUploadMedia } from '~/hooks/api/use-media'
import { isImageMime, isVideoMime } from '~/puck/media-mime'
import { cn } from '~/lib/utils'

/**
 * Reusable media picker used as a Puck custom field (and, via `MediaIdField`, as
 * a CMS collection field). Shows a thumbnail preview when a value is set,
 * otherwise a "Choose" trigger. The picker dialog lists media from the library
 * (`GET /api/admin/media` via `useMediaList`) and supports drag-and-drop upload
 * straight into the dialog. SSR-safe: all fetching happens inside query hooks,
 * with no top-level `window`/`document` access.
 */

// Re-exported for existing callers that import these from this module.
export { isImageMime, isVideoMime }

function extLabel(filename: string, mimeType: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename)
  if (m) return m[1].toUpperCase()
  return mimeType.split('/')[1]?.toUpperCase() ?? 'FILE'
}

/**
 * One media item's preview — a real thumbnail for image/video, a file-type
 * badge for everything else (PDF, Word, font). Shared by the picker grid and
 * both field triggers so every place media renders looks the same.
 */
function MediaThumb({
  item,
  className,
}: {
  item: Pick<MediaDto, 'url' | 'mimeType' | 'filename' | 'alt'>
  className?: string
}) {
  if (isImageMime(item.mimeType)) {
    return (
      <img
        src={item.url}
        alt={item.alt ?? item.filename}
        className={cn('object-cover', className)}
      />
    )
  }
  if (isVideoMime(item.mimeType)) {
    return (
      <div className={cn('relative overflow-hidden', className)}>
        {/* `preload="metadata"` shows the first frame with no server-side poster. */}
        <video src={item.url} muted preload="metadata" className="size-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex size-8 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="size-3.5 fill-current" />
          </div>
        </div>
      </div>
    )
  }
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1 bg-muted/50 text-muted-foreground',
        className
      )}
    >
      <FileIcon className="size-6" />
      <span className="text-[10px] font-medium">{extLabel(item.filename, item.mimeType)}</span>
    </div>
  )
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
  mimeFilter,
  accept,
  kindLabel = 'file',
  selectedId,
  showUrlInput = true,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value?: string
  onChange: (url: string) => void
  onPick?: (item: MediaDto) => void
  /** Restrict the library grid + upload to items whose mime passes this test. Omit to allow every uploaded type. */
  mimeFilter?: (mime: string) => boolean
  /** `<input type="file" accept="...">` — omit to accept any file (the server still validates by real magic bytes). */
  accept?: string
  /** Word used in the dialog/trigger copy ("Choose a <kindLabel>", "Drop a <kindLabel> here"). */
  kindLabel?: string
  /** Highlight the grid item whose id matches, for a caller (like MediaIdField) whose `value` isn't a URL. */
  selectedId?: string
  /** The "or paste a URL" fallback only makes sense when the caller stores a URL. */
  showUrlInput?: boolean
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

  const items = useMemo(
    () => (listQuery.data?.items ?? []).filter((m) => (mimeFilter ? mimeFilter(m.mimeType) : true)),
    [listQuery.data, mimeFilter]
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
    const accepted = mimeFilter ? files.filter((f) => mimeFilter(f.type)) : files
    if (accepted.length === 0) {
      setUploadError(`Only ${kindLabel} files can be used here.`)
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
          <DialogTitle>Choose {kindLabel}</DialogTitle>
          <DialogDescription>
            Drop a file to add it to the media library
            {showUrlInput
              ? ', pick one already there, or paste a URL.'
              : ' or pick one already there.'}
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
                  {dragging ? 'Drop to upload' : `Drag & drop a ${kindLabel} here`}
                </span>
                <span className="text-xs text-muted-foreground">or click to browse</span>
              </>
            )}
          </button>

          <input
            ref={fileInput}
            type="file"
            accept={accept}
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
              {uploadedCount} files added to the library — pick one below.
            </p>
          ) : null}

          {showUrlInput ? (
            <Input
              type="url"
              placeholder="https://example.com/image.jpg"
              defaultValue={value ?? ''}
              onChange={(e) => onChange(e.target.value)}
            />
          ) : null}

          {listQuery.error ? (
            <p className="py-8 text-center text-sm text-destructive">
              {(listQuery.error as Error).message}
            </p>
          ) : listQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No {kindLabel} files in the library yet.
            </p>
          ) : (
            <div className="grid max-h-96 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => select(item)}
                  className={cn(
                    'group relative aspect-square overflow-hidden rounded-lg border bg-muted/50 transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    (value === item.url || selectedId === item.id) &&
                      'border-ring ring-2 ring-ring/50'
                  )}
                  title={item.filename}
                >
                  <MediaThumb item={item} className="h-full w-full" />
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
  mimeFilter,
  accept,
  kindLabel = 'image',
}: {
  value?: string
  onChange: (url: string) => void
  /** Fires with the full media record (incl. responsive variants) on library pick. */
  onPick?: (item: MediaDto) => void
  mimeFilter?: (mime: string) => boolean
  accept?: string
  kindLabel?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      {value ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border bg-muted/50">
            {isVideoMime2(value) ? (
              <video src={value} muted preload="metadata" className="h-32 w-full object-cover" />
            ) : (
              <img src={value} alt="Selected media" className="h-32 w-full object-cover" />
            )}
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
          Choose {kindLabel}
        </Button>
      )}

      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        value={value}
        onChange={onChange}
        onPick={onPick}
        mimeFilter={mimeFilter}
        accept={accept}
        kindLabel={kindLabel}
      />
    </div>
  )
}

/**
 * `MediaField`'s own trigger preview only ever had `value` — a URL, with no
 * mime type attached — so a video URL is detected by extension as a fallback.
 * Good enough for a preview thumbnail; the picker dialog's grid (which does
 * have each item's real mime) is the source of truth for what's a video.
 */
function isVideoMime2(url: string): boolean {
  return /\.(mp4|webm)(\?|#|$)/i.test(url)
}

/**
 * The CMS collection MEDIA field's picker. Same trigger+dialog UX as
 * `MediaField`, but the stored/emitted value is a media **id**, not a URL —
 * matching the field's storage contract (`app/services/cms_service.ts`:
 * `MEDIA` columns hold an id; `resolveMediaUrls` swaps it for a URL only on
 * public render). No mime filter by default — a "Media" field may hold any
 * uploaded file type, not just images.
 */
export function MediaIdField({
  value,
  onChange,
  disabled,
  mimeFilter,
  accept,
  kindLabel = 'file',
}: {
  value?: string | null
  onChange: (id: string | null) => void
  disabled?: boolean
  mimeFilter?: (mime: string) => boolean
  accept?: string
  kindLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const mediaQuery = useMedia(value || undefined)
  const item = mediaQuery.data

  return (
    <div className="space-y-2">
      {value ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border bg-muted/50">
            {mediaQuery.isLoading ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : item ? (
              <MediaThumb item={item} className="h-32 w-full" />
            ) : (
              <div className="flex h-32 flex-col items-center justify-center gap-1 text-center text-muted-foreground">
                <span className="text-xs">Media not found</span>
                <span className="max-w-full truncate px-2 text-[10px]">{value}</span>
              </div>
            )}
          </div>
          {item ? (
            <p className="truncate text-xs text-muted-foreground" title={item.filename}>
              {item.filename}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => setOpen(true)}
            >
              Replace
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onChange(null)}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <ImageIcon className="size-4" />
          Choose {kindLabel}
        </Button>
      )}

      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        onChange={() => {
          // No-op: an id field has nothing to do with a pasted URL. Not shown
          // anyway (showUrlInput=false below) — kept only to satisfy the prop.
        }}
        onPick={(picked) => onChange(picked.id)}
        mimeFilter={mimeFilter}
        accept={accept}
        kindLabel={kindLabel}
        selectedId={value ?? undefined}
        showUrlInput={false}
      />
    </div>
  )
}

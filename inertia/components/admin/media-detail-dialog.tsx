import { useMemo, useRef, useState } from 'react'
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PercentCrop,
} from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import {
  Check,
  Copy,
  Crop as CropIcon,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  LockOpen,
  RotateCcw,
  RotateCw,
  Save,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { MediaDto } from '~/types/api'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { Separator } from '~/components/ui/separator'
import { Dialog, DialogContent } from '~/components/ui/dialog'
import {
  formatBytes,
  mediaSrc,
  useReplaceMediaFile,
  useUpdateMediaMeta,
} from '~/hooks/api/use-media'
import { isEditableImage, outputDimensions, renderEditedBlob } from '~/lib/image-edit'
import { cn, formatAdminTableDateTime } from '~/lib/utils'

const ASPECTS: { label: string; value: string; ratio: number | undefined }[] = [
  { label: 'Free', value: 'free', ratio: undefined },
  { label: '1:1', value: '1-1', ratio: 1 },
  { label: '4:3', value: '4-3', ratio: 4 / 3 },
  { label: '3:4', value: '3-4', ratio: 3 / 4 },
  { label: '16:9', value: '16-9', ratio: 16 / 9 },
]

/** Light/dark checkerboard so transparency is obvious in the preview. */
const CHECKER_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, rgba(128,128,128,0.18) 25%, transparent 25%), linear-gradient(-45deg, rgba(128,128,128,0.18) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.18) 75%), linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.18) 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
}

type Props = {
  item: MediaDto | null
  open: boolean
  onOpenChange: (open: boolean) => void
  canWrite: boolean
}

export function MediaDetailDialog({ item, open, onOpenChange, canWrite }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden p-0">
        {item ? (
          <MediaDetailInner
            key={item.id}
            item={item}
            canWrite={canWrite}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function MediaDetailInner({
  item,
  canWrite,
  onClose,
}: {
  item: MediaDto
  canWrite: boolean
  onClose: () => void
}) {
  const isImage = item.mimeType.startsWith('image/')
  const editable = isImage && isEditableImage(item.mimeType) && canWrite
  const [mode, setMode] = useState<'info' | 'edit'>('info')

  const updateMeta = useUpdateMediaMeta()
  const replaceFile = useReplaceMediaFile()

  // ── Metadata form ────────────────────────────────────────────────────────
  const [title, setTitle] = useState(item.title ?? '')
  const [alt, setAlt] = useState(item.alt ?? '')
  const [description, setDescription] = useState(item.description ?? '')
  const dirty =
    title !== (item.title ?? '') ||
    alt !== (item.alt ?? '') ||
    description !== (item.description ?? '')

  // Natural dimensions: prefer stored, else read off the rendered image.
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(
    item.width && item.height ? { width: item.width, height: item.height } : null
  )

  // ── Edit state ───────────────────────────────────────────────────────────
  const imgRef = useRef<HTMLImageElement>(null)
  const [crop, setCrop] = useState<Crop>()
  const [aspectKey, setAspectKey] = useState('free')
  const [rotate, setRotate] = useState(0)
  const [resizeW, setResizeW] = useState('')
  const [resizeH, setResizeH] = useState('')
  const [lockAspect, setLockAspect] = useState(true)

  const aspect = ASPECTS.find((a) => a.value === aspectKey)?.ratio

  const cropPct = useMemo<PercentCrop | null>(
    () => (crop && crop.width > 0 && crop.height > 0 ? (crop as PercentCrop) : null),
    [crop]
  )

  // Output dimensions of the current crop + rotation, before any manual resize.
  const baseDims = useMemo(
    () => (natural ? outputDimensions(natural, cropPct, rotate) : null),
    [natural, cropPct, rotate]
  )

  const targetDims = useMemo(() => {
    if (!baseDims) return null
    const w = resizeW ? Math.max(1, Math.round(Number(resizeW))) : baseDims.width
    const h = resizeH ? Math.max(1, Math.round(Number(resizeH))) : baseDims.height
    return { width: w, height: h }
  }, [baseDims, resizeW, resizeH])

  function applyAspect(key: string) {
    setAspectKey(key)
    const ratio = ASPECTS.find((a) => a.value === key)?.ratio
    const img = imgRef.current
    if (!ratio || !img || !img.width || !img.height) {
      setCrop(undefined)
      return
    }
    const next = centerCrop(
      makeAspectCrop({ unit: '%', width: 80 }, ratio, img.width, img.height),
      img.width,
      img.height
    )
    setCrop(next)
  }

  function onResizeWidth(value: string) {
    setResizeW(value)
    if (lockAspect && baseDims && value) {
      const ratio = baseDims.width / baseDims.height
      setResizeH(String(Math.max(1, Math.round(Number(value) / ratio))))
    }
  }
  function onResizeHeight(value: string) {
    setResizeH(value)
    if (lockAspect && baseDims && value) {
      const ratio = baseDims.width / baseDims.height
      setResizeW(String(Math.max(1, Math.round(Number(value) * ratio))))
    }
  }

  function resetEdit() {
    setCrop(undefined)
    setAspectKey('free')
    setRotate(0)
    setResizeW('')
    setResizeH('')
  }

  async function saveMeta() {
    try {
      await updateMeta.mutateAsync({ id: item.id, title, description, alt })
      toast.success('Details saved')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function applyEdit() {
    const img = imgRef.current
    if (!img) return
    try {
      const { blob, width, height } = await renderEditedBlob({
        image: img,
        cropPct,
        rotate,
        targetWidth: resizeW ? Number(resizeW) : null,
        targetHeight: resizeH ? Number(resizeH) : null,
        mimeType: item.mimeType,
      })
      await replaceFile.mutateAsync({ id: item.id, blob, filename: item.filename, width, height })
      toast.success('Image replaced')
      setNatural({ width, height })
      resetEdit()
      setMode('info')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const absoluteUrl = useMemo(() => {
    if (typeof window === 'undefined') return item.url
    try {
      return new URL(item.url, window.location.origin).href
    } catch {
      return item.url
    }
  }, [item.url])

  const previewSrc = mediaSrc(item.url, item.updatedAt)

  return (
    <div className="flex max-h-[90vh] min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold" title={item.title ?? item.filename}>
            {item.title?.trim() || item.filename}
          </h2>
          <p className="truncate text-xs text-muted-foreground" title={item.filename}>
            {item.filename}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1.6fr_1fr]">
        {/* Preview / editor */}
        <div
          className="flex min-h-[280px] items-center justify-center overflow-auto border-b p-4 md:border-b-0 md:border-r"
          style={CHECKER_STYLE}
        >
          {!isImage ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <FileText className="size-12" />
              <span className="text-xs">No preview available</span>
            </div>
          ) : mode === 'edit' ? (
            <ReactCrop
              crop={crop}
              onChange={(_, percent) => setCrop(percent)}
              aspect={aspect}
              keepSelection
              className="max-h-[70vh]"
            >
              <img
                ref={imgRef}
                src={previewSrc}
                alt={item.alt ?? item.filename}
                className="max-h-[70vh] w-auto select-none"
                onLoad={(e) =>
                  setNatural({
                    width: e.currentTarget.naturalWidth,
                    height: e.currentTarget.naturalHeight,
                  })
                }
              />
            </ReactCrop>
          ) : (
            <img
              src={previewSrc}
              alt={item.alt ?? item.filename}
              className="max-h-[70vh] w-auto object-contain"
              onLoad={(e) =>
                setNatural({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                })
              }
            />
          )}
        </div>

        {/* Right panel */}
        <div className="min-h-0 overflow-y-auto p-5">
          {mode === 'edit' ? (
            <EditPanel
              aspectKey={aspectKey}
              onAspect={applyAspect}
              rotate={rotate}
              onRotate={(d) => setRotate((r) => (((r + d) % 360) + 360) % 360)}
              baseDims={baseDims}
              targetDims={targetDims}
              resizeW={resizeW}
              resizeH={resizeH}
              onResizeWidth={onResizeWidth}
              onResizeHeight={onResizeHeight}
              lockAspect={lockAspect}
              onToggleLock={() => setLockAspect((v) => !v)}
              onReset={resetEdit}
              onCancel={() => {
                resetEdit()
                setMode('info')
              }}
              onApply={applyEdit}
              applying={replaceFile.isPending}
            />
          ) : (
            <InfoPanel
              item={item}
              canWrite={canWrite}
              editable={editable}
              title={title}
              alt={alt}
              description={description}
              setTitle={setTitle}
              setAlt={setAlt}
              setDescription={setDescription}
              dirty={dirty}
              saving={updateMeta.isPending}
              onSave={saveMeta}
              onEdit={() => setMode('edit')}
              natural={natural}
              absoluteUrl={absoluteUrl}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function InfoPanel({
  item,
  canWrite,
  editable,
  title,
  alt,
  description,
  setTitle,
  setAlt,
  setDescription,
  dirty,
  saving,
  onSave,
  onEdit,
  natural,
  absoluteUrl,
}: {
  item: MediaDto
  canWrite: boolean
  editable: boolean
  title: string
  alt: string
  description: string
  setTitle: (v: string) => void
  setAlt: (v: string) => void
  setDescription: (v: string) => void
  dirty: boolean
  saving: boolean
  onSave: () => void
  onEdit: () => void
  natural: { width: number; height: number } | null
  absoluteUrl: string
}) {
  function copyUrl() {
    void navigator.clipboard
      .writeText(absoluteUrl)
      .then(() => toast.success('URL copied'))
      .catch(() => toast.error('Could not copy URL'))
  }

  return (
    <div className="space-y-5">
      {canWrite ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="media-title">Title</Label>
            <Input
              id="media-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A human-friendly name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="media-alt">Alt text</Label>
            <Input
              id="media-alt"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Describe the image for accessibility & SEO"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="media-desc">Description</Label>
            <Textarea
              id="media-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional caption or notes"
              rows={3}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onSave} disabled={!dirty || saving} className="gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save details
            </Button>
            {editable ? (
              <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
                <CropIcon className="size-4" />
                Edit image
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {canWrite ? <Separator /> : null}

      <dl className="space-y-2.5 text-sm">
        <InfoRow label="URL">
          <div className="flex items-center gap-1">
            <code className="truncate rounded bg-muted px-1.5 py-0.5 text-xs" title={absoluteUrl}>
              {item.url}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={copyUrl}
              aria-label="Copy URL"
            >
              <Copy className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              render={<a href={item.url} target="_blank" rel="noreferrer" />}
              aria-label="Open in new tab"
            >
              <ExternalLink className="size-3.5" />
            </Button>
          </div>
        </InfoRow>
        <InfoRow label="Type">{item.mimeType}</InfoRow>
        <InfoRow label="Size">{formatBytes(item.size)}</InfoRow>
        <InfoRow label="Dimensions">
          {natural ? `${natural.width} × ${natural.height} px` : '—'}
        </InfoRow>
        <InfoRow label="Date added">{formatAdminTableDateTime(item.createdAt)}</InfoRow>
        <InfoRow label="Last modified">
          {item.updatedAt ? formatAdminTableDateTime(item.updatedAt) : '—'}
        </InfoRow>
      </dl>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-foreground">{children}</dd>
    </div>
  )
}

function EditPanel({
  aspectKey,
  onAspect,
  rotate,
  onRotate,
  baseDims,
  targetDims,
  resizeW,
  resizeH,
  onResizeWidth,
  onResizeHeight,
  lockAspect,
  onToggleLock,
  onReset,
  onCancel,
  onApply,
  applying,
}: {
  aspectKey: string
  onAspect: (key: string) => void
  rotate: number
  onRotate: (delta: number) => void
  baseDims: { width: number; height: number } | null
  targetDims: { width: number; height: number } | null
  resizeW: string
  resizeH: string
  onResizeWidth: (v: string) => void
  onResizeHeight: (v: string) => void
  lockAspect: boolean
  onToggleLock: () => void
  onReset: () => void
  onCancel: () => void
  onApply: () => void
  applying: boolean
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Aspect ratio</Label>
        <div className="flex flex-wrap gap-1.5">
          {ASPECTS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => onAspect(a.value)}
              aria-pressed={aspectKey === a.value}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs transition-colors',
                aspectKey === a.value
                  ? 'border-primary bg-primary/10 font-medium text-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Drag on the image to crop. Pick a ratio to lock the selection shape.
        </p>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Rotate</Label>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onRotate(-90)}>
            <RotateCcw className="size-4" />
            Left
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onRotate(90)}>
            <RotateCw className="size-4" />
            Right
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">{rotate}°</span>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Resize output</Label>
          <button
            type="button"
            onClick={onToggleLock}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-pressed={lockAspect}
          >
            {lockAspect ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
            {lockAspect ? 'Locked' : 'Free'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="space-y-1">
            <Label htmlFor="resize-w" className="text-[11px] text-muted-foreground">
              Width
            </Label>
            <Input
              id="resize-w"
              inputMode="numeric"
              className="h-8 w-24 text-xs tabular-nums"
              value={resizeW}
              placeholder={baseDims ? String(baseDims.width) : ''}
              onChange={(e) => onResizeWidth(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          <span className="mt-5 text-muted-foreground">×</span>
          <div className="space-y-1">
            <Label htmlFor="resize-h" className="text-[11px] text-muted-foreground">
              Height
            </Label>
            <Input
              id="resize-h"
              inputMode="numeric"
              className="h-8 w-24 text-xs tabular-nums"
              value={resizeH}
              placeholder={baseDims ? String(baseDims.height) : ''}
              onChange={(e) => onResizeHeight(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Output:{' '}
          <span className="tabular-nums text-foreground">
            {targetDims ? `${targetDims.width} × ${targetDims.height} px` : '—'}
          </span>
        </p>
      </div>

      <Separator />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onApply} disabled={applying} className="gap-1.5">
          {applying ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Apply & replace
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset} disabled={applying}>
          Reset
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={applying}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Replaces the original file — the URL stays the same, so every page using this image updates.
      </p>
    </div>
  )
}

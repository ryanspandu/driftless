import { useState } from 'react'
import {
  Blend,
  ChevronDown,
  ChevronUp,
  Circle,
  Eye,
  EyeOff,
  ImageIcon,
  MoreHorizontal,
  MoreVertical,
  Plus,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import {
  ColorControl,
  NumberUnitControl,
  SegmentedControl,
  stepNumericValue,
} from '~/puck/style-controls'
import { MediaPickerDialog } from '~/puck/media-field'
import {
  convertLayer,
  formatBytes,
  layerLabel,
  layerSwatch,
  layerToImage,
  newLayer,
  RADIAL_EXTENTS,
  readLayers,
  type BgImageLayer,
  type BgLayer,
  type BgLayerType,
  type BgLinearLayer,
  type BgOverlayLayer,
  type BgRadialLayer,
  type BgStop,
} from '~/puck/background-layers'

/**
 * The Backgrounds panel, modelled on Webflow's.
 *
 * Webflow puts a base colour at the top, then an "Image & gradient" stack below
 * it: `+` adds a layer, each row can be hidden, deleted or moved, and selecting
 * a row reveals a type-specific editor (image / linear / radial / solid
 * overlay). That structure is reproduced here rather than a flat list of CSS
 * fields, because the whole point of the layer stack is that one element can
 * carry several backgrounds at once — which no single-value control can express.
 *
 * Everything writes back through one `onChange(layers)`; the data shape and its
 * compilation to CSS live in `background-layers.ts`.
 */

const inputCls =
  'h-7 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring'

const TYPE_OPTIONS: { value: BgLayerType; icon: typeof ImageIcon; title: string }[] = [
  { value: 'image', icon: ImageIcon, title: 'Image' },
  { value: 'linear', icon: Blend, title: 'Linear gradient' },
  { value: 'radial', icon: Circle, title: 'Radial gradient' },
  { value: 'overlay', icon: Square, title: 'Solid overlay' },
]

const SIZE_OPTIONS = [
  { value: 'custom', label: 'Custom' },
  { value: 'cover', label: 'Cover' },
  { value: 'contain', label: 'Contain' },
]

const TILE_OPTIONS = [
  { value: 'repeat', icon: Grid, title: 'Tile' },
  { value: 'repeat-x', icon: MoreHorizontal, title: 'Tile horizontally' },
  { value: 'repeat-y', icon: MoreVertical, title: 'Tile vertically' },
  { value: 'no-repeat', icon: X, title: 'No tile' },
]

const ATTACHMENT_OPTIONS = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'scroll', label: 'Not fixed' },
]

/** Lucide has no 3×3 dot glyph; Webflow's tile icon is exactly that. */
function Grid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} fill="currentColor" aria-hidden>
      {[1.5, 5.5, 9.5].map((y) =>
        [1.5, 5.5, 9.5].map((x) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="2" height="2" rx="0.4" />
        ))
      )}
    </svg>
  )
}

function Label({ children, set = false }: { children: string; set?: boolean }) {
  return (
    <span
      className={cn(
        'w-14 shrink-0 pt-1.5 text-xs leading-tight',
        set ? 'text-blue-400' : 'text-muted-foreground'
      )}
    >
      {children}
    </span>
  )
}

function Row({
  label,
  set,
  children,
}: {
  label: string
  set?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <Label set={set}>{label}</Label>
      <div className="min-w-0 flex-1 space-y-1.5">{children}</div>
    </div>
  )
}

// ───────────────────────────── Position (9-point) ─────────────────────────────

const ANCHORS = ['0%', '50%', '100%'] as const

/**
 * Webflow's nine-dot origin picker, paired with the numeric offsets beside it.
 *
 * The dots are shortcuts that write the same two values the inputs do, so a
 * click never puts the control into a state the fields cannot express.
 */
function PositionGrid({
  x,
  y,
  onChange,
}: {
  x: string
  y: string
  onChange: (x: string, y: string) => void
}) {
  return (
    <div className="grid w-fit shrink-0 grid-cols-3 gap-px rounded-md border border-input bg-background p-0.5">
      {ANCHORS.map((py) =>
        ANCHORS.map((px) => {
          const active = x === px && y === py
          return (
            <button
              key={`${px}-${py}`}
              type="button"
              title={`${px} ${py}`}
              onClick={() => onChange(px, py)}
              className="flex size-4 items-center justify-center rounded hover:bg-muted"
            >
              <span
                className={cn(
                  'block rounded-full transition-all',
                  active ? 'size-2 bg-blue-500' : 'size-1 bg-muted-foreground/50'
                )}
              />
            </button>
          )
        })
      )}
    </div>
  )
}

// ─────────────────────────────── Gradient stops ───────────────────────────────

/**
 * The stop list, under a live preview of the ramp it produces.
 *
 * A gradient needs at least two stops to be valid CSS, so the last two cannot be
 * deleted — the delete button disappears rather than failing on click.
 */
function StopsEditor({
  layer,
  stops,
  onChange,
}: {
  layer: BgLayer
  stops: BgStop[]
  onChange: (stops: BgStop[]) => void
}) {
  const set = (i: number, patch: Partial<BgStop>) =>
    onChange(stops.map((s, n) => (n === i ? { ...s, ...patch } : s)))

  const add = () => {
    const last = stops[stops.length - 1]
    onChange([...stops, { color: last?.color ?? '#000000', pos: '' }])
  }

  return (
    <div className="space-y-2">
      <div
        className="h-6 rounded-md border border-input"
        style={{ backgroundImage: layerToImage(layer) || undefined }}
      />
      {stops.map((stop, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <ColorControl value={stop.color} onChange={(color) => set(i, { color })} />
          </div>
          <input
            type="text"
            value={stop.pos}
            placeholder="auto"
            onChange={(e) => set(i, { pos: e.target.value })}
            onKeyDown={(e) => {
              const next = stepNumericValue(stop.pos, e)
              if (next === null) return
              e.preventDefault()
              set(i, { pos: next })
            }}
            className="h-7 w-12 shrink-0 rounded-md border border-input bg-background px-1 text-center text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring"
            aria-label={`Stop ${i + 1} position`}
          />
          {/*
            Disabled rather than hidden below three stops: a gradient needs two
            to be valid CSS, and a button that vanishes reads as a glitch where
            one that greys out reads as a rule.
          */}
          <button
            type="button"
            title={stops.length > 2 ? 'Remove stop' : 'A gradient needs at least two stops'}
            disabled={stops.length <= 2}
            onClick={() => onChange(stops.filter((_, n) => n !== i))}
            className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive disabled:pointer-events-none disabled:opacity-25"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-input py-1.5 text-xs text-muted-foreground hover:border-ring hover:text-foreground"
      >
        <Plus className="size-3.5" />
        Add stop
      </button>
    </div>
  )
}

// ──────────────────────────────── Layer editors ────────────────────────────────

function ImageLayerEditor({
  layer,
  patch,
}: {
  layer: BgImageLayer
  patch: (p: Partial<BgImageLayer>) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const meta = [
    layer.naturalWidth && layer.naturalHeight
      ? `${layer.naturalWidth} × ${layer.naturalHeight}`
      : null,
    layer.fileSize ? formatBytes(layer.fileSize) : null,
  ].filter(Boolean)

  // `@2x` halves the intrinsic size, so it owns the size and the mode is moot.
  const retinaOwnsSize = !!(layer.retina && layer.naturalWidth)

  return (
    <>
      <Row label="Image" set={!!layer.url}>
        <div className="flex gap-2">
          <div
            className="size-14 shrink-0 rounded border border-input bg-muted/40 bg-cover bg-center"
            style={{ backgroundImage: layer.url ? `url("${layer.url}")` : undefined }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-foreground">{layerLabel(layer)}</p>
            {meta.map((m) => (
              <p key={m as string} className="text-[11px] text-muted-foreground">
                {m}
              </p>
            ))}
            <label
              className={cn(
                'mt-1 flex items-center gap-1.5 text-[11px]',
                layer.naturalWidth ? 'text-muted-foreground' : 'text-muted-foreground/50'
              )}
              title={
                layer.naturalWidth
                  ? 'Treat as a retina export — paint at half its pixel size'
                  : 'Needs an image from the media library, which records its pixel size'
              }
            >
              <input
                type="checkbox"
                checked={!!layer.retina}
                disabled={!layer.naturalWidth}
                onChange={(e) => patch({ retina: e.target.checked })}
              />
              @2x
            </label>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="w-full rounded-md border border-input py-1 text-[11px] hover:bg-muted"
        >
          Choose image
        </button>
      </Row>

      <Row label="Size" set={layer.sizeMode !== 'custom' || !!layer.width || !!layer.height}>
        <SegmentedControl
          options={SIZE_OPTIONS}
          value={retinaOwnsSize ? '' : layer.sizeMode}
          allowClear={false}
          onChange={(v) => patch({ sizeMode: v as BgImageLayer['sizeMode'] })}
        />
        {retinaOwnsSize ? (
          <p className="text-[11px] text-muted-foreground">
            Sized by @2x — {Math.round(layer.naturalWidth! / 2)}px wide.
          </p>
        ) : layer.sizeMode === 'custom' ? (
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <NumberUnitControl value={layer.width} onChange={(width) => patch({ width })} />
              <span className="mt-0.5 block text-center text-[10px] text-muted-foreground">
                Width
              </span>
            </div>
            <div>
              <NumberUnitControl value={layer.height} onChange={(height) => patch({ height })} />
              <span className="mt-0.5 block text-center text-[10px] text-muted-foreground">
                Height
              </span>
            </div>
          </div>
        ) : null}
      </Row>

      <Row label="Position" set={layer.posX !== '0px' || layer.posY !== '0px'}>
        <div className="flex gap-2">
          <PositionGrid
            x={layer.posX ?? '0px'}
            y={layer.posY ?? '0px'}
            onChange={(posX, posY) => patch({ posX, posY })}
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-1">
              <span className="w-6 shrink-0 text-[10px] text-muted-foreground">Left</span>
              <NumberUnitControl value={layer.posX} onChange={(posX) => patch({ posX })} />
            </div>
            <div className="flex items-center gap-1">
              <span className="w-6 shrink-0 text-[10px] text-muted-foreground">Top</span>
              <NumberUnitControl value={layer.posY} onChange={(posY) => patch({ posY })} />
            </div>
          </div>
        </div>
      </Row>

      <Row label="Tile" set={layer.repeat !== 'repeat'}>
        <SegmentedControl
          options={TILE_OPTIONS}
          value={layer.repeat}
          allowClear={false}
          onChange={(v) => patch({ repeat: v as BgImageLayer['repeat'] })}
        />
      </Row>

      <Row label="Fixed" set={layer.attachment === 'fixed'}>
        <SegmentedControl
          options={ATTACHMENT_OPTIONS}
          value={layer.attachment}
          allowClear={false}
          onChange={(v) => patch({ attachment: v as BgImageLayer['attachment'] })}
        />
      </Row>

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        value={layer.url}
        onChange={(url) => patch({ url })}
        onPick={(item) =>
          patch({
            url: item.url,
            filename: item.filename,
            naturalWidth: item.width,
            naturalHeight: item.height,
            fileSize: item.size,
          })
        }
      />
    </>
  )
}

function LinearLayerEditor({
  layer,
  patch,
}: {
  layer: BgLinearLayer
  patch: (p: Partial<BgLinearLayer>) => void
}) {
  return (
    <>
      <Row label="Angle" set={layer.angle !== '180'}>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={360}
            value={Number(layer.angle) || 0}
            onChange={(e) => patch({ angle: e.target.value })}
            className="h-1.5 flex-1 cursor-pointer accent-blue-500"
          />
          <div className="flex h-7 shrink-0 items-center rounded-md border border-input bg-background px-1">
            <input
              type="number"
              value={layer.angle}
              onChange={(e) => patch({ angle: e.target.value })}
              className="w-8 bg-transparent text-right text-sm tabular-nums outline-none"
            />
            <span className="pl-0.5 text-[10px] text-muted-foreground">deg</span>
          </div>
        </div>
      </Row>
      <Row label="Stops" set>
        <StopsEditor layer={layer} stops={layer.stops} onChange={(stops) => patch({ stops })} />
      </Row>
    </>
  )
}

function RadialLayerEditor({
  layer,
  patch,
}: {
  layer: BgRadialLayer
  patch: (p: Partial<BgRadialLayer>) => void
}) {
  return (
    <>
      <Row label="Shape" set={layer.shape !== 'circle'}>
        <SegmentedControl
          options={[
            { value: 'circle', label: 'Circle' },
            { value: 'ellipse', label: 'Ellipse' },
          ]}
          value={layer.shape}
          allowClear={false}
          onChange={(v) => patch({ shape: v as BgRadialLayer['shape'] })}
        />
      </Row>
      <Row label="Size" set={layer.extent !== 'farthest-corner'}>
        <select
          className={cn(inputCls, 'cursor-pointer')}
          value={layer.extent}
          onChange={(e) => patch({ extent: e.target.value })}
        >
          {RADIAL_EXTENTS.map((v) => (
            <option key={v} value={v}>
              {v.replace('-', ' ')}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Position" set={layer.posX !== '50%' || layer.posY !== '50%'}>
        <div className="flex gap-2">
          <PositionGrid
            x={layer.posX}
            y={layer.posY}
            onChange={(posX, posY) => patch({ posX, posY })}
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-1">
              <span className="w-6 shrink-0 text-[10px] text-muted-foreground">Left</span>
              <NumberUnitControl value={layer.posX} onChange={(posX) => patch({ posX })} />
            </div>
            <div className="flex items-center gap-1">
              <span className="w-6 shrink-0 text-[10px] text-muted-foreground">Top</span>
              <NumberUnitControl value={layer.posY} onChange={(posY) => patch({ posY })} />
            </div>
          </div>
        </div>
      </Row>
      <Row label="Stops" set>
        <StopsEditor layer={layer} stops={layer.stops} onChange={(stops) => patch({ stops })} />
      </Row>
    </>
  )
}

function OverlayLayerEditor({
  layer,
  patch,
}: {
  layer: BgOverlayLayer
  patch: (p: Partial<BgOverlayLayer>) => void
}) {
  return (
    <Row label="Color" set={!!layer.color}>
      <ColorControl value={layer.color} onChange={(color) => patch({ color })} />
      <p className="text-[11px] text-muted-foreground">
        Sits in the stack like any other layer, so it can tint the image above it.
      </p>
    </Row>
  )
}

// ───────────────────────────────── The panel ─────────────────────────────────

export function BackgroundLayersControl({
  value,
  onChange,
}: {
  value: unknown
  onChange: (layers: BgLayer[]) => void
}) {
  const layers = readLayers(value)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // The stored id wins over local state so the panel follows the element when
  // the selection changes on the canvas.
  const selected = layers.find((l) => l.id === selectedId) ?? layers[0] ?? null

  const replace = (id: string, next: BgLayer) =>
    onChange(layers.map((l) => (l.id === id ? next : l)))

  const patch = (id: string, p: Record<string, unknown>) => {
    const current = layers.find((l) => l.id === id)
    if (!current) return
    replace(id, { ...current, ...p } as BgLayer)
  }

  const add = () => {
    const layer = newLayer('image')
    // Prepended, not appended: CSS paints the first entry on top, and a layer
    // added from the `+` at the top of the list should land where it was added.
    onChange([layer, ...layers])
    setSelectedId(layer.id)
  }

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= layers.length) return
    const next = [...layers]
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row!)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Image &amp; gradient</span>
        <button
          type="button"
          onClick={add}
          title="Add a background layer"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {layers.length === 0 ? (
        <p className="rounded-md border border-dashed border-input px-2 py-3 text-center text-[11px] text-muted-foreground">
          No layers. Add an image, gradient or overlay.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-input">
          {layers.map((layer, i) => (
            <div
              key={layer.id}
              className={cn(
                'flex items-center gap-1.5 border-b border-input/60 px-1.5 py-1 last:border-b-0',
                selected?.id === layer.id && 'bg-blue-500/10'
              )}
            >
              <button
                type="button"
                onClick={() => setSelectedId(layer.id)}
                className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left"
              >
                <span
                  className="size-5 shrink-0 rounded border border-input"
                  style={{ background: layerSwatch(layer) }}
                />
                <span
                  className={cn(
                    'truncate text-xs',
                    layer.hidden ? 'text-muted-foreground/50 line-through' : 'text-foreground'
                  )}
                >
                  {layerLabel(layer)}
                </span>
              </button>

              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  title="Move up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-25"
                >
                  <ChevronUp className="size-3" />
                </button>
                <button
                  type="button"
                  title="Move down"
                  disabled={i === layers.length - 1}
                  onClick={() => move(i, 1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-25"
                >
                  <ChevronDown className="size-3" />
                </button>
              </div>

              <button
                type="button"
                title={layer.hidden ? 'Show layer' : 'Hide layer'}
                onClick={() => patch(layer.id, { hidden: !layer.hidden })}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {layer.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
              <button
                type="button"
                title="Delete layer"
                onClick={() => onChange(layers.filter((l) => l.id !== layer.id))}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="space-y-2 rounded-md border border-input p-2">
          <Row label="Type" set>
            <SegmentedControl
              options={TYPE_OPTIONS}
              value={selected.type}
              allowClear={false}
              onChange={(v) => replace(selected.id, convertLayer(selected, v as BgLayerType))}
            />
          </Row>

          {selected.type === 'image' && (
            <ImageLayerEditor layer={selected} patch={(p) => patch(selected.id, p)} />
          )}
          {selected.type === 'linear' && (
            <LinearLayerEditor layer={selected} patch={(p) => patch(selected.id, p)} />
          )}
          {selected.type === 'radial' && (
            <RadialLayerEditor layer={selected} patch={(p) => patch(selected.id, p)} />
          )}
          {selected.type === 'overlay' && (
            <OverlayLayerEditor layer={selected} patch={(p) => patch(selected.id, p)} />
          )}
        </div>
      )}
    </div>
  )
}

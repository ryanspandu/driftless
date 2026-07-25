import { useRef } from 'react'
import Image from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'
import { cn } from '~/lib/utils'

type Align = 'left' | 'center' | 'right'

/** Inline alignment so it survives in the saved HTML (rendered with `prose`). */
function alignStyle(align: Align): string {
  if (align === 'left') return 'display:block;margin-left:0;margin-right:auto'
  if (align === 'right') return 'display:block;margin-left:auto;margin-right:0'
  return 'display:block;margin-left:auto;margin-right:auto'
}

/**
 * Image with width (resize) + alignment. Width is stored as an inline CSS width
 * (e.g. `60%`) and alignment as `data-align` + inline margins, so both round-trip
 * through the stored HTML and render the same on the public page. Editing happens
 * in a React NodeView with a drag handle and a small float toolbar.
 */
export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.width || el.getAttribute('width') || null,
        renderHTML: (attrs) => (attrs.width ? { style: `width: ${attrs.width}` } : {}),
      },
      align: {
        default: 'center',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-align') || 'center',
        renderHTML: (attrs) => ({
          'data-align': attrs.align,
          'style': alignStyle((attrs.align as Align) ?? 'center'),
        }),
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  },
})

const SIZE_PRESETS: { value: string; label: string }[] = [
  { value: '25%', label: 'S' },
  { value: '50%', label: 'M' },
  { value: '75%', label: 'L' },
  { value: '100%', label: 'Full' },
]

function ImageNodeView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const width = (node.attrs.width as string | null) ?? null
  const align = ((node.attrs.align as Align) ?? 'center') as Align

  // Explicitly select this node on click. ProseMirror's implicit atom selection
  // is unreliable here (e.g. with content above the image), so we set it directly.
  const selectSelf = () => {
    const pos = typeof getPos === 'function' ? getPos() : null
    if (typeof pos === 'number') editor.commands.setNodeSelection(pos)
  }

  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const box = boxRef.current
    if (!box) return
    const containerWidth = box.parentElement?.offsetWidth ?? box.offsetWidth ?? 1
    const startX = e.clientX
    const startWidth = box.offsetWidth

    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX
      const pct = Math.min(
        100,
        Math.max(10, Math.round(((startWidth + delta) / containerWidth) * 100))
      )
      updateAttributes({ width: `${pct}%` })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const wrapAlign = align === 'left' ? 'mr-auto' : align === 'right' ? 'ml-auto' : 'mx-auto'
  const stop = (e: React.MouseEvent) => e.preventDefault()
  // Visible when selected, and also on hover so the controls stay reachable even
  // if a click didn't land a node selection. Hidden controls are non-interactive
  // (pointer-events-none) so they never block clicking the image itself.
  const reveal = selected
    ? 'opacity-100 pointer-events-auto'
    : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'

  return (
    <NodeViewWrapper className="my-3">
      <div
        ref={boxRef}
        className={cn('group relative', wrapAlign)}
        style={{ width: width ?? 'fit-content', maxWidth: '100%' }}
      >
        <img
          src={node.attrs.src}
          alt={node.attrs.alt ?? ''}
          title={node.attrs.title ?? undefined}
          draggable={false}
          onClick={selectSelf}
          className={cn(
            'block h-auto w-full cursor-pointer rounded-lg',
            selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background'
          )}
        />

        <span
          role="button"
          aria-label="Drag to resize"
          contentEditable={false}
          onPointerDown={startResize}
          className={cn(
            'absolute right-1.5 bottom-1.5 z-10 size-3.5 cursor-nwse-resize rounded-full border-2 border-background bg-primary shadow transition-opacity',
            reveal
          )}
        />
        <div
          contentEditable={false}
          className={cn(
            'absolute top-2 left-1/2 z-10 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-0.5 rounded-lg border border-border bg-popover/95 p-1 text-muted-foreground shadow-md backdrop-blur-sm transition-opacity',
            reveal
          )}
        >
          {(
            [
              ['left', AlignLeft],
              ['center', AlignCenter],
              ['right', AlignRight],
            ] as const
          ).map(([a, Icon]) => (
            <button
              key={a}
              type="button"
              onMouseDown={stop}
              onClick={() => updateAttributes({ align: a })}
              aria-label={`Align ${a}`}
              className={cn(
                'rounded p-1 hover:bg-muted hover:text-foreground',
                align === a && 'bg-muted text-foreground'
              )}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
          <span className="mx-0.5 h-4 w-px bg-border" />
          {SIZE_PRESETS.map((s) => (
            <button
              key={s.value}
              type="button"
              onMouseDown={stop}
              onClick={() => updateAttributes({ width: s.value })}
              className={cn(
                'rounded px-1.5 py-0.5 text-[11px] hover:bg-muted hover:text-foreground',
                width === s.value && 'bg-muted text-foreground'
              )}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            onMouseDown={stop}
            onClick={() => updateAttributes({ width: null })}
            className="rounded px-1.5 py-0.5 text-[11px] hover:bg-muted hover:text-foreground"
          >
            Reset
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  )
}

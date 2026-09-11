
import { useCallback, useId, useRef, useState, type ReactNode } from 'react'
import { ImagePlus, Loader2 } from 'lucide-react'
import { cn } from '~/lib/utils'

export type DragDropImageUploadProps = {
  onFile: (file: File) => void | Promise<void>
  accept?: string
  disabled?: boolean
  minHeightClassName?: string
  className?: string
  hint?: string
  children?: ReactNode
}

export function DragDropImageUpload({
  onFile,
  accept = 'image/jpeg,image/png,image/gif,image/webp',
  disabled,
  minHeightClassName = 'min-h-[140px]',
  className,
  hint = 'PNG, JPG, GIF, or WebP.',
  children,
}: DragDropImageUploadProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)

  const run = useCallback(
    async (file: File | undefined) => {
      if (!file || disabled) return
      setBusy(true)
      try {
        await onFile(file)
      } finally {
        setBusy(false)
      }
    },
    [disabled, onFile]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)
      void run(e.dataTransfer.files?.[0])
    },
    [run]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  return (
    <div className={cn('relative', className)}>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          void run(file)
          e.target.value = ''
        }}
      />
      <div
        role="button"
        tabIndex={disabled || busy ? -1 : 0}
        aria-disabled={disabled || busy}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
          minHeightClassName,
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 bg-muted/30 hover:border-muted-foreground/40 hover:bg-muted/50',
          (disabled || busy) && 'pointer-events-none opacity-60'
        )}
        onClick={() => !disabled && !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {children ?? (
          <>
            {busy ? (
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            ) : (
              <ImagePlus className="size-8 text-muted-foreground" aria-hidden />
            )}
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Drop a file here</span>
              {' · '}
              or click to choose
            </div>
            <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>
          </>
        )}
      </div>
    </div>
  )
}

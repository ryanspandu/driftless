import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { DragDropImageUpload } from '~/components/drag-drop-image-upload'

/**
 * Drag-&-drop JSON importer, shared across Pages / Templates / Collections /
 * Components. Reads the dropped `.json`, checks it carries the expected
 * `_type` discriminator client-side (a friendly pre-check — the server stays
 * the source of truth), then hands the parsed object to `onImport` (which
 * should throw on failure so the error shows inline).
 */
export function ImportJsonDialog({
  open,
  onOpenChange,
  title,
  description,
  expectedType,
  expectedLabel,
  hint,
  successMessage,
  onImport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** The `_type` value a valid export must carry (e.g. "driftless.page"). */
  expectedType: string
  /** Human name of the export kind, used in the mismatch message (e.g. "page"). */
  expectedLabel: string
  hint?: string
  successMessage?: string
  onImport: (parsed: unknown) => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)

  const close = (next: boolean) => {
    if (!next) setError(null)
    onOpenChange(next)
  }

  const handleFile = async (file: File) => {
    setError(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      setError('That file is not valid JSON.')
      return
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as { _type?: unknown })._type !== expectedType
    ) {
      setError(`This isn’t a ${expectedLabel} export. Pick a .json file exported from here.`)
      return
    }
    try {
      await onImport(parsed)
      toast.success(successMessage ?? 'Imported')
      close(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DragDropImageUpload
          onFile={handleFile}
          accept="application/json,.json"
          hint={hint ?? `Only a .json file exported from a ${expectedLabel} can be imported.`}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
